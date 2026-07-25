import { mkdtemp, readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';
import { buildResourceLoader } from './resource-loader.js';
import {
  filterToTrimmedSchema,
  RepositoryKnowledgeGraphSchema,
  type RepositoryKnowledgeGraph,
} from '../graph/schema.js';
import type { SharedLimiter } from '../concurrency/shared-limiter.js';

export interface RunUnderstandOptions {
  repoName: string;
  repoPath: string;
  repoDescription?: string;
  model: Model<Api>;
  modelRuntime: ModelRuntime;
  limiter: SharedLimiter;
  verbose?: boolean;
  onProgress?: (line: string) => void;
}

export type RunUnderstandResult =
  | { status: 'complete'; graph: RepositoryKnowledgeGraph }
  | { status: 'failed'; error: string; retryCount: 0 | 1 };

/**
 * The UA data directory the skill writes to — always relative to the
 * analyzed repo itself (SKILL.md Phase 0 step 1.7), not something we can
 * redirect without patching path-resolution logic we chose not to touch
 * (research.md D4 adaptation 3 — lower drift risk to copy-then-clean than to
 * patch $UA_DIR resolution).
 */
function uaKnowledgeGraphPath(repoPath: string): string {
  return join(repoPath, '.ua', 'knowledge-graph.json');
}
function uaDirPath(repoPath: string): string {
  return join(repoPath, '.ua');
}

async function runOnce(options: RunUnderstandOptions): Promise<RepositoryKnowledgeGraph> {
  const agentDir = await mkdtemp(join(tmpdir(), 'arch-atlas-agent-'));
  const resourceLoader = buildResourceLoader({ cwd: options.repoPath, agentDir });

  const { session } = await createAgentSession({
    cwd: options.repoPath,
    agentDir,
    model: options.model,
    modelRuntime: options.modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(options.repoPath),
    settingsManager: SettingsManager.inMemory({}),
  });

  try {
    session.subscribe((event) => {
      if (!options.verbose) return;
      // Field names verified against @earendil-works/pi-coding-agent's real
      // .d.ts (ToolExecutionStartEvent/ToolExecutionEndEvent): flat
      // {type, toolCallId, toolName, args|result, isError}, not nested under
      // a `.toolCall`/`.message` property as an earlier draft assumed.
      // `args`/`result` are `any` in pi's own types (genuinely tool-dependent
      // shape) — never logged verbatim here (constitution Principle IV: "log
      // safely, redaction by default" — a repo's file content could end up
      // in a read/grep tool's args or result).
      if (event.type === 'tool_execution_start') {
        options.onProgress?.(`→ ${event.toolName}`);
      }
      if (event.type === 'tool_execution_end') {
        options.onProgress?.(event.isError ? `✗ ${event.toolName} (error)` : `✓ ${event.toolName}`);
      }
    });

    // research.md D2/D4: run UA's vendored, headless-patched skill natively —
    // pi invokes skills as `/skill:<name>` (verified against pi's own RPC
    // docs), not `/<name>` as UA's own Claude-Code-oriented self-documentation
    // describes. `--full` forces the unconditional full-analysis branch in
    // SKILL.md Phase 0's decision table, avoiding its "ask the user" branch
    // for an unchanged-commit-hash graph — not viable in a headless session.
    await session.prompt('/skill:understand --full');
  } finally {
    session.dispose();
  }

  const rawGraphText = await readFile(uaKnowledgeGraphPath(options.repoPath), 'utf8');
  const raw: unknown = JSON.parse(rawGraphText);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('knowledge-graph.json did not contain a JSON object');
  }
  const rawObj = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(rawObj.nodes) ? rawObj.nodes : [];
  const rawEdges = Array.isArray(rawObj.edges) ? rawObj.edges : [];
  const { nodes, edges } = filterToTrimmedSchema(rawNodes, rawEdges);

  const projectMeta = (rawObj.project ?? {}) as Record<string, unknown>;
  const graph: RepositoryKnowledgeGraph = RepositoryKnowledgeGraphSchema.parse({
    schemaVersion: '1.0',
    analyzedAt: new Date().toISOString(),
    repository: {
      name: options.repoName,
      path: options.repoPath,
      ...(options.repoDescription !== undefined && { description: options.repoDescription }),
      ...(typeof projectMeta.description === 'string' && !options.repoDescription
        ? { description: projectMeta.description }
        : {}),
    },
    nodes,
    edges,
    analysisStatus: 'complete',
    retryCount: 0,
  });

  // research.md D4 adaptation 3: copy the artifact out of the analyzed repo,
  // then remove .ua/ — it's disposable intermediate output, not something we
  // leave behind in the user's actual repository checkout.
  return graph;
}

async function cleanupUaDir(repoPath: string): Promise<void> {
  await rm(uaDirPath(repoPath), { recursive: true, force: true });
}

/**
 * FR-010a: retry exactly once on failure (invalid/unparseable output, or the
 * agent session throwing), then report a failure rather than retrying
 * indefinitely or halting the whole run.
 */
export async function runUnderstand(options: RunUnderstandOptions): Promise<RunUnderstandResult> {
  return options.limiter.run(async () => {
    for (const attempt of [0, 1] as const) {
      try {
        const graph = await runOnce(options);
        await cleanupUaDir(options.repoPath);
        if (attempt === 1) {
          return { status: 'complete', graph: { ...graph, retryCount: 1 } };
        }
        return { status: 'complete', graph };
      } catch (error) {
        await cleanupUaDir(options.repoPath).catch(() => undefined);
        if (attempt === 1) {
          return {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            retryCount: 1,
          };
        }
        // fall through to retry
      }
    }
    // Unreachable — the loop above always returns on attempt 1 — but keeps
    // the function's control flow exhaustive for the type checker.
    return { status: 'failed', error: 'unreachable', retryCount: 1 };
  });
}

export async function ensureOutputDir(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
}

// Re-exported for run-import.ts's aggregate-only path, which copies an
// already-produced artifact without re-running analysis.
export async function copyKnowledgeGraphArtifact(
  fromRepoPath: string,
  toPath: string
): Promise<void> {
  await copyFile(uaKnowledgeGraphPath(fromRepoPath), toPath);
}
