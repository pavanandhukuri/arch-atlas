import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';
import type { SharedLimiter } from '../concurrency/shared-limiter.js';
import { gatherContext, type AnalysisContext } from './gather-context.js';
import { createSubmitAnalysisTool } from './submit-analysis-tool.js';
import {
  ModelAnalysisSchema,
  OutboundIntentSchema,
  RepoAnalysisSchema,
  ServedInterfacesSchema,
  type ModelAnalysis,
  type RepoAnalysis,
} from './repo-analysis.schema.js';

/**
 * 008: per-repository analysis as a single bounded, structured-output model
 * call. One turn, one retry on invalid output (FR-001, FR-007, NFR-002).
 * research.md D14 adds: low sampling temperature (via the model runtime),
 * deterministic interface hints in the prompt, a framework denylist, an
 * opt-in constrained-sampling tool path, and an opt-in grounding verify pass.
 * See `contracts/analysis-call-contract.md`.
 */

export type StructuredOutputMode = 'prompt' | 'tool';

export interface AnalyzeRepoOptions {
  repoName: string;
  repoPath: string;
  repoDescription?: string;
  model: Model<Api>;
  modelRuntime: ModelRuntime;
  limiter: SharedLimiter;
  /** 'prompt' (default) = free-form JSON text + hardened parse. 'tool' =
   * one constrained-sampling `submit_analysis` tool call, text fallback. */
  structuredOutput?: StructuredOutputMode;
  /** research.md D14.8 — second call that drops ungrounded findings. */
  verifyGrounding?: boolean;
  onProgress?: (line: string) => void;
}

export type AnalyzeRepoResult =
  | { status: 'complete'; analysis: RepoAnalysis; retryCount: 0 | 1 }
  | { status: 'failed'; error: string; retryCount: 1 };

const MODEL_OUTPUT_SHAPE = `{
  "description": "string — 1-3 sentences on what this repository is/does",
  "languages": ["string", ...],
  "frameworks": ["string", ...],
  "served": {
    "httpRoutes": [{ "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS", "path": "/starts/with/slash", "filePath": "repo/relative/file" }],
    "grpcServices": ["package.v1.ServiceName"],
    "topics": [{ "name": "topic-or-queue", "direction": "publish|consume|unknown", "filePath": "repo/relative/file" }],
    "datastores": [{ "name": "db-or-table", "kind": "relational|document|keyvalue|blob|search|other" }]
  },
  "outbound": [{ "target": "other-system-name", "verb": "calls|depends_on|publishes|subscribes|reads_from|writes_to", "detail": "one sentence", "confidence": 0.0 }]
}`;

/**
 * research.md D14.2: names that are build/test/lint tooling, never the
 * application framework. Stripped from `frameworks` after the model responds
 * (the model kept reporting `vitest` / `typescript` as "the framework").
 * Matched case-insensitively, exact or as a scoped-package prefix.
 */
const NON_FRAMEWORK_DEPS = new Set(
  [
    'vitest',
    'jest',
    'mocha',
    'chai',
    'ava',
    'jasmine',
    'karma',
    'cypress',
    'playwright',
    '@playwright/test',
    'testing-library',
    '@testing-library/react',
    '@testing-library/dom',
    'supertest',
    'nock',
    'msw',
    'eslint',
    'prettier',
    'tslint',
    'stylelint',
    'typescript',
    'ts-node',
    'tsx',
    'tsup',
    'type-fest',
    'nodemon',
    'concurrently',
    'npm-run-all',
    'rimraf',
    'husky',
    'lint-staged',
    'turbo',
    'nx',
    'lerna',
    'webpack',
    'rollup',
    'esbuild',
    'parcel',
    'gulp',
    'grunt',
    'babel',
    '@babel/core',
    'swc',
    '@swc/core',
    'vite',
    'browserslist',
    'postcss',
    'autoprefixer',
    'commitlint',
    'semantic-release',
    'changesets',
    '@changesets/cli',
    'dotenv',
    'cross-env',
  ].map((s) => s.toLowerCase())
);

/**
 * research.md D14.9: operational / infra endpoints every service exposes.
 * They are not architectural interfaces and cause cross-service false
 * positives in the endpoint correlation pass, so they are stripped from
 * `served.httpRoutes` before the analysis is persisted.
 */
const OPERATIONAL_PATH_RE =
  /^\/(actuator($|\/)|health($|z|check$)|healthz$|readyz$|livez$|ready$|live$|metrics$|prometheus$|ping$|status$|version$|info$|favicon\.ico$|robots\.txt$|\.well-known($|\/))/i;

export function sanitizeServed<T extends { httpRoutes: Array<{ path: string }> }>(served: T): T {
  return {
    ...served,
    httpRoutes: served.httpRoutes.filter((r) => !OPERATIONAL_PATH_RE.test(r.path)),
  };
}

export function sanitizeFrameworks(frameworks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of frameworks) {
    const f = raw.trim();
    if (!f) continue;
    const lc = f.toLowerCase();
    const base = lc.startsWith('@types/') ? '@types' : lc.replace(/@[\d.^~>=<\s|-]+$/, ''); // drop a version suffix like "kafkajs@2"
    if (lc.startsWith('@types/') || NON_FRAMEWORK_DEPS.has(base) || NON_FRAMEWORK_DEPS.has(lc)) {
      continue;
    }
    if (!seen.has(lc)) {
      seen.add(lc);
      out.push(f);
    }
  }
  return out;
}

function section(title: string, files: Array<{ relPath: string; text: string }>): string {
  if (files.length === 0) return `## ${title}\n(none)\n`;
  return `## ${title}\n` + files.map((f) => `### ${f.relPath}\n${f.text}`).join('\n\n') + '\n';
}

function detectedSection(ctx: AnalysisContext): string {
  const { httpRoutes, topics } = ctx.detected;
  if (httpRoutes.length === 0 && topics.length === 0) return '';
  const lines = ['## Detected interface hints (from a crude literal scan — NOT authoritative)'];
  lines.push(
    'Confirm the real ones against the source above, drop false positives, add anything the scan missed, and set the correct direction/method:'
  );
  for (const r of httpRoutes) {
    lines.push(`- route: ${r.method ?? '?'} ${r.path}  (${r.relPath}:${r.line})`);
  }
  for (const t of topics) {
    lines.push(`- topic: ${t.name}  role=${t.role}  (${t.relPath}:${t.line})`);
  }
  return lines.join('\n') + '\n';
}

function dependencySection(ctx: AnalysisContext): string {
  if (ctx.dependencySplits.length === 0) return '';
  const lines = ['## Declared dependencies (frameworks come from RUNTIME deps, never dev deps)'];
  for (const d of ctx.dependencySplits) {
    lines.push(`### ${d.relPath}`);
    lines.push(`runtime: ${d.dependencies.join(', ') || '(none)'}`);
    if (d.peerDependencies.length > 0) lines.push(`peer: ${d.peerDependencies.join(', ')}`);
    lines.push(`dev (IGNORE for frameworks): ${d.devDependencies.join(', ') || '(none)'}`);
  }
  return lines.join('\n') + '\n';
}

const RETRY_PREAMBLE =
  'IMPORTANT: a previous attempt produced output that could not be used. ' +
  'Respond with ONLY the JSON object — no markdown code fences, no explanation, ' +
  'no text before or after it, no comments, no trailing commas.\n\n';

const GUIDANCE = [
  'Rules:',
  '- `frameworks` = the runtime/application frameworks the code is built on (Express, Gin, Spring Boot, React, Next.js, gRPC). NOT test runners, linters, bundlers, type stubs, or CLI tooling.',
  '- List a served interface only if you can point to the file it is defined in; put that path in `filePath`.',
  '- `served` = interfaces THIS repo exposes. `outbound` = systems this repo calls/depends on/publishes to.',
  '- Prefer the evidence in the source and the detected hints over guessing.',
].join('\n');

const EMPTY_SERVED: ModelAnalysis['served'] = {
  httpRoutes: [],
  grpcServices: [],
  topics: [],
  datastores: [],
};

const SalvageModelAnalysisSchema = z.object({
  description: z.string().catch(''),
  languages: z.array(z.string()).catch([]),
  frameworks: z.array(z.string()).catch([]),
  served: ServedInterfacesSchema.catch(EMPTY_SERVED),
  outbound: z.array(OutboundIntentSchema).catch([]),
});

function coerceModelAnalysis(raw: unknown): { model: ModelAnalysis; partial: boolean } {
  const strict = ModelAnalysisSchema.safeParse(raw);
  if (strict.success) return { model: strict.data, partial: false };

  const salvaged = SalvageModelAnalysisSchema.safeParse(raw);
  if (!salvaged.success) {
    throw new Error('model response was not a usable analysis object');
  }
  const s = salvaged.data;
  const hasSignal =
    s.description.trim().length > 0 || s.languages.length > 0 || s.frameworks.length > 0;
  if (!hasSignal) {
    throw new Error('model response did not contain a usable analysis');
  }
  return { model: s, partial: true };
}

export function renderPrompt(
  ctx: AnalysisContext,
  attempt: 0 | 1 = 0,
  mode: StructuredOutputMode = 'prompt'
): string {
  const responseInstruction =
    mode === 'tool'
      ? 'Call the `submit_analysis` tool exactly once with your findings. Do not reply with text.'
      : 'Respond with a SINGLE JSON object and nothing else, matching this exact shape (omit optional fields you cannot determine; use empty arrays where there is nothing):';
  return [
    attempt === 1 ? RETRY_PREAMBLE.trimEnd() : '',
    'You are analyzing ONE source-code repository. Use ONLY the material below. Do not ask questions.',
    responseInstruction,
    '',
    MODEL_OUTPUT_SHAPE,
    '',
    GUIDANCE,
    '',
    `## Repository`,
    `name: ${ctx.repoName}`,
    ctx.descriptionHint ? `hint: ${ctx.descriptionHint}` : '',
    '',
    section('READMEs', ctx.readmes),
    dependencySection(ctx),
    section('Manifests', ctx.manifests),
    `## Directory listing\n${ctx.listing.join('\n') || '(empty)'}\n`,
    section(
      'Selected source files',
      ctx.sourceExcerpts.map((s) => ({
        relPath: s.truncated ? `${s.relPath} (truncated)` : s.relPath,
        text: s.text,
      }))
    ),
    detectedSection(ctx),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Parse `text` as JSON, retrying once after light repair. Returns undefined on failure. */
function parseLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to repair
  }
  const repaired = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/[^\n]*/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

/**
 * Recover a JSON object from a model response tolerant of surrounding prose,
 * fences, trailing commas / comments, and a truncated (unclosed) object.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let slice: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) {
        slice = text.slice(start, i + 1);
        break;
      }
    }
  }
  if (slice === null) {
    const closers = stack
      .reverse()
      .map((b) => (b === '{' ? '}' : ']'))
      .join('');
    slice = text.slice(start) + closers;
  }

  const parsed = parseLenient(slice);
  return parsed !== undefined && typeof parsed === 'object' && parsed !== null ? parsed : null;
}

function textAccumulator(): { onEvent: (event: unknown) => void; get: () => string } {
  let text = '';
  return {
    onEvent: (event: unknown) => {
      const e = event as {
        type?: string;
        assistantMessageEvent?: { type?: string; delta?: string };
      };
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        text += e.assistantMessageEvent.delta ?? '';
      }
    },
    get: () => text,
  };
}

async function callModelForAnalysis(
  options: AnalyzeRepoOptions,
  prompt: string,
  mode: StructuredOutputMode
): Promise<unknown> {
  const agentDir = await mkdtemp(join(tmpdir(), 'arch-atlas-analyze-'));
  const acc = textAccumulator();
  const submit = mode === 'tool' ? createSubmitAnalysisTool() : null;

  const { session } = await createAgentSession({
    agentDir,
    model: options.model,
    modelRuntime: options.modelRuntime,
    ...(submit ? { customTools: [submit.tool], tools: ['submit_analysis'] } : { tools: [] }), // no orchestration either way (FR-001 / contract G2)
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({}),
  });
  session.subscribe(acc.onEvent);

  try {
    await session.prompt(prompt);
  } finally {
    session.dispose();
  }

  // tool mode: prefer the captured tool params; fall back to any JSON the model
  // emitted as text instead of calling the tool.
  if (submit) {
    const captured = submit.getResult();
    if (captured) return captured;
  }
  return extractJsonObject(acc.get());
}

async function runOnce(
  options: AnalyzeRepoOptions,
  ctx: AnalysisContext,
  attempt: 0 | 1
): Promise<RepoAnalysis> {
  const mode: StructuredOutputMode = options.structuredOutput ?? 'prompt';
  const raw = await callModelForAnalysis(options, renderPrompt(ctx, attempt, mode), mode);
  if (raw === null) {
    throw new Error('model response contained no parseable analysis');
  }
  const coerced = coerceModelAnalysis(raw);
  const { partial } = coerced;
  let model: ModelAnalysis = {
    ...coerced.model,
    frameworks: sanitizeFrameworks(coerced.model.frameworks),
    served: sanitizeServed(coerced.model.served),
  };

  if (options.verifyGrounding && !partial && ctx.totalBytes > 0) {
    options.onProgress?.('verifying against source...');
    model = await verifyGrounding(options, ctx, model, mode);
  }

  return RepoAnalysisSchema.parse({
    ...model,
    schemaVersion: '1.0',
    analyzedAt: new Date().toISOString(),
    repository: {
      name: options.repoName,
      path: options.repoPath,
      ...(options.repoDescription !== undefined ? { description: options.repoDescription } : {}),
    },
    analysisStatus: partial || ctx.totalBytes === 0 ? 'partial' : 'complete',
    retryCount: 0,
  });
}

/**
 * research.md D14.8: a second bounded call that keeps only what the source
 * supports. A verify hiccup (unparseable / invalid) is non-fatal — the
 * unverified analysis is returned unchanged.
 */
async function verifyGrounding(
  options: AnalyzeRepoOptions,
  ctx: AnalysisContext,
  model: ModelAnalysis,
  mode: StructuredOutputMode
): Promise<ModelAnalysis> {
  const prompt = [
    'Below is a draft analysis of a repository, followed by the source it was derived from.',
    'Return a corrected analysis in the SAME shape. Remove any httpRoute, grpcService, topic,',
    'datastore, or outbound entry that is NOT clearly supported by the provided source or',
    'manifests. Keep everything that IS supported. Do not add new entries. Keep description,',
    'languages, and frameworks unless plainly wrong.',
    mode === 'tool'
      ? 'Call `submit_analysis` once with the corrected analysis.'
      : 'Respond with ONLY the corrected JSON object.',
    '',
    '## Draft analysis',
    JSON.stringify(model, null, 2),
    '',
    section('Manifests', ctx.manifests),
    section(
      'Source files',
      ctx.sourceExcerpts.map((s) => ({ relPath: s.relPath, text: s.text }))
    ),
  ].join('\n');

  try {
    const raw = await callModelForAnalysis(options, prompt, mode);
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

/**
 * FR-007: one bounded call, retried exactly once on unparseable / schema-invalid
 * output, then reported as a failed repository.
 */
export async function analyzeRepo(options: AnalyzeRepoOptions): Promise<AnalyzeRepoResult> {
  return options.limiter.run(async () => {
    const ctx = gatherContext(options.repoName, options.repoPath, options.repoDescription);
    options.onProgress?.(
      `gathering context (${ctx.readmes.length + ctx.manifests.length + ctx.sourceExcerpts.length} files, ${Math.round(ctx.totalBytes / 1024)} KB, ${ctx.detected.httpRoutes.length} route hint(s))`
    );

    for (const attempt of [0, 1] as const) {
      try {
        options.onProgress?.(attempt === 0 ? 'calling model...' : 'retrying model call...');
        const analysis = await runOnce(options, ctx, attempt);
        return {
          status: 'complete',
          analysis: attempt === 1 ? { ...analysis, retryCount: 1 } : analysis,
          retryCount: attempt,
        };
      } catch (error) {
        if (attempt === 1) {
          return {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            retryCount: 1,
          };
        }
      }
    }
    return { status: 'failed', error: 'unreachable', retryCount: 1 };
  });
}
