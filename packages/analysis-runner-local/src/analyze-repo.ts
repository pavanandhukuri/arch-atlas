import {
  gatherContext,
  RepoAnalysisSchema,
  ModelAnalysisSchema,
  type AnalysisContext,
  type ContextBundle,
  type ModelAnalysis,
  type RepoAnalysis,
} from '@arch-atlas/llm-importer';
import { chatComplete, REPO_ANALYSIS_JSON_SCHEMA } from './openai-client.js';
import { coerceModelAnalysis, extractJsonObject } from './parse.js';
import { renderPrompt, renderVerifyPrompt, type StructuredOutputMode } from './prompt.js';
import { sanitizeFrameworks, sanitizeServed } from './sanitize.js';

/**
 * The relocated `analyzeRepo` (008): one bounded structured-output model call,
 * one retry on unusable output, partial-result salvage, optional grounding
 * verify pass — now over the local `chatComplete` client instead of pi.
 */

export interface AnalyzeRepoLocalOptions {
  repoName: string;
  repoDescription?: string;
  input: { repoPath: string; descriptionHint?: string } | { bundle: ContextBundle };
  endpoint: string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
  structuredOutput?: StructuredOutputMode;
  verifyGrounding?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (line: string) => void;
}

export type AnalyzeRepoLocalResult =
  | { status: 'complete' | 'partial'; analysis: RepoAnalysis }
  | { status: 'failed'; error: string };

function contextFrom(options: AnalyzeRepoLocalOptions): AnalysisContext {
  if ('bundle' in options.input) {
    const b = options.input.bundle;
    return {
      repoName: b.repoName,
      repoPath: b.repoPath,
      descriptionHint: b.descriptionHint,
      readmes: b.readmes,
      manifests: b.manifests,
      dependencySplits: b.dependencySplits,
      listing: b.listing,
      sourceExcerpts: b.sourceExcerpts,
      detected: b.detected,
      totalBytes: b.totalBytes,
    };
  }
  return gatherContext(
    options.repoName,
    options.input.repoPath,
    options.input.descriptionHint ?? options.repoDescription
  );
}

async function callModel(
  options: AnalyzeRepoLocalOptions,
  prompt: string,
  mode: StructuredOutputMode
): Promise<unknown> {
  const text = await chatComplete({
    endpoint: options.endpoint,
    modelId: options.modelId,
    ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    messages: [{ role: 'user', content: prompt }],
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(mode === 'tool'
      ? { responseFormat: { type: 'json_schema', json_schema: REPO_ANALYSIS_JSON_SCHEMA } }
      : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return extractJsonObject(text);
}

async function verifyGrounding(
  options: AnalyzeRepoLocalOptions,
  ctx: AnalysisContext,
  model: ModelAnalysis,
  mode: StructuredOutputMode
): Promise<ModelAnalysis> {
  try {
    const raw = await callModel(options, renderVerifyPrompt(ctx, model, mode), mode);
    if (raw === null) return model;
    const strict = ModelAnalysisSchema.safeParse(raw);
    if (!strict.success) return model;
    return {
      ...strict.data,
      frameworks: sanitizeFrameworks(strict.data.frameworks),
      served: sanitizeServed(strict.data.served),
    };
  } catch {
    return model;
  }
}

async function runOnce(
  options: AnalyzeRepoLocalOptions,
  ctx: AnalysisContext,
  attempt: 0 | 1
): Promise<{ analysis: RepoAnalysis; partial: boolean }> {
  const mode: StructuredOutputMode = options.structuredOutput ?? 'prompt';
  const raw = await callModel(options, renderPrompt(ctx, attempt, mode), mode);
  if (raw === null) throw new Error('model response contained no parseable analysis');

  const coerced = coerceModelAnalysis(raw);
  let model: ModelAnalysis = {
    ...coerced.model,
    frameworks: sanitizeFrameworks(coerced.model.frameworks),
    served: sanitizeServed(coerced.model.served),
  };

  if (options.verifyGrounding && !coerced.partial && ctx.totalBytes > 0) {
    options.onProgress?.('verifying against source...');
    model = await verifyGrounding(options, ctx, model, mode);
  }

  const partial = coerced.partial || ctx.totalBytes === 0;
  const analysis = RepoAnalysisSchema.parse({
    ...model,
    schemaVersion: '1.0',
    analyzedAt: new Date().toISOString(),
    repository: {
      name: options.repoName,
      path: 'bundle' in options.input ? options.input.bundle.repoPath : options.input.repoPath,
      ...(options.repoDescription !== undefined ? { description: options.repoDescription } : {}),
    },
    analysisStatus: partial ? 'partial' : 'complete',
    retryCount: attempt,
  });
  return { analysis, partial };
}

export async function analyzeRepoLocal(
  options: AnalyzeRepoLocalOptions
): Promise<AnalyzeRepoLocalResult> {
  const ctx = contextFrom(options);
  options.onProgress?.(
    `context: ${ctx.readmes.length + ctx.manifests.length + ctx.sourceExcerpts.length} file(s), ` +
      `${Math.round(ctx.totalBytes / 1024)} KB, ${ctx.detected.httpRoutes.length} route hint(s)`
  );

  let lastError = 'model call did not complete';
  for (const attempt of [0, 1] as const) {
    try {
      options.onProgress?.(attempt === 0 ? 'calling model...' : 'retrying model call...');
      const { analysis, partial } = await runOnce(options, ctx, attempt);
      return { status: partial ? 'partial' : 'complete', analysis };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { status: 'failed', error: lastError };
}
