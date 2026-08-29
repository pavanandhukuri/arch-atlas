import { mkdtemp, readFile, rm, mkdir, copyFile, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';
import { buildResourceLoader, loadAndVerifyResources } from './resource-loader.js';
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

/** Same-session "keep going" prompts per attempt before the FR-010a outer
 * retry kicks in. Each nudge reuses the session's full context, so it costs
 * one turn — an outer retry costs the whole analysis from scratch. */
const MAX_CONTINUE_NUDGES = 3;

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * uds-sdk live-run finding: a local model can silently abandon the vendored
 * skill mid-run and hand-write a shortcut `.ua/knowledge-graph.json` instead
 * of actually executing SKILL.md's Phase 1-7 pipeline — the file-exists
 * check the nudge loop uses can't tell a fabricated graph from a genuine
 * one, so a hand-rolled, largely-templated graph was silently accepted as a
 * successful analysis (and left stray script files in the analyzed repo).
 *
 * SKILL.md's own Phase 7 (SAVE) contract gives a reliable, deterministic
 * signal instead of guessing from graph *content*: a genuine `--full` run
 * always writes `meta.json` (step 3), always preserves
 * `intermediate/scan-result.json` (step 4 — kept on purpose for incremental
 * runs, issue #293), and always moves the rest of `intermediate/` into a
 * `.trash-<epoch>/` directory during cleanup (step 4, issue #301) —
 * regardless of repo size, since Phase 1 SCAN and Phase 7 SAVE both run
 * unconditionally under `--full`. A hand-rolled substitute reproduces none
 * of this. Only called when knowledge-graph.json itself exists — a plain
 * missing graph already gets its own clear "file not found" error below.
 */
async function verifyGenuineAnalysis(repoPath: string): Promise<void> {
  const uaDir = uaDirPath(repoPath);
  const missing: string[] = [];

  if (!(await fileExists(join(uaDir, 'meta.json')))) {
    missing.push('meta.json');
  }
  if (!(await fileExists(join(uaDir, 'intermediate', 'scan-result.json')))) {
    missing.push('intermediate/scan-result.json');
  }

  let hasTrashDir = false;
  try {
    const entries = await readdir(uaDir);
    hasTrashDir = entries.some((entry) => entry.startsWith('.trash-'));
  } catch {
    // uaDir unreadable — treated the same as "no trash dir found" below.
  }
  if (!hasTrashDir) {
    missing.push('.trash-<epoch>/');
  }

  if (missing.length > 0) {
    throw new Error(
      `knowledge-graph.json exists but the skill's genuine-analysis markers are missing (${missing.join(', ')}) — ` +
        'the agent likely fabricated a shortcut instead of running the vendored skill (uds-sdk live-run finding).'
    );
  }
}

async function runOnce(options: RunUnderstandOptions): Promise<RepositoryKnowledgeGraph> {
  const agentDir = await mkdtemp(join(tmpdir(), 'arch-atlas-agent-'));
  // Shared between loader and session so resource discovery and the session
  // see the same (hermetic, in-memory) settings — never the host's ~/.pi.
  const settingsManager = SettingsManager.inMemory({});
  const resourceLoader = buildResourceLoader({ cwd: options.repoPath, agentDir, settingsManager });
  // MUST happen before createAgentSession: pi only reloads loaders it creates
  // itself. Without this the session has no skills and no extensions — the
  // FR-015 secret-exclusion extension included (T062 live-run finding).
  await loadAndVerifyResources(resourceLoader);

  const { session } = await createAgentSession({
    cwd: options.repoPath,
    agentDir,
    model: options.model,
    modelRuntime: options.modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(options.repoPath),
    settingsManager,
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

    // Headless persistence (T062 live-run finding): local models routinely
    // end their turn after *reading* the skill — a plan or summary instead of
    // execution — leaving no graph on disk. A same-session nudge is far
    // cheaper than the FR-010a outer retry (which discards all context and
    // starts over), so spend a few of these before giving up on the attempt.
    for (let nudge = 0; nudge < MAX_CONTINUE_NUDGES; nudge++) {
      if (await fileExists(uaKnowledgeGraphPath(options.repoPath))) break;
      options.onProgress?.(
        `skill incomplete — nudging session to continue (${nudge + 1}/${MAX_CONTINUE_NUDGES})`
      );
      await session.prompt(
        'The skill run is NOT complete: `.ua/knowledge-graph.json` does not exist yet. ' +
          'This is a headless session — there is no user to confirm anything with. ' +
          'Continue executing the remaining skill phases now, starting from where you stopped. ' +
          'Execute the tools and scripts the skill specifies; do not summarize, plan, or ask questions.'
      );
    }
  } finally {
    session.dispose();
  }

  if (await fileExists(uaKnowledgeGraphPath(options.repoPath))) {
    await verifyGenuineAnalysis(options.repoPath);
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
