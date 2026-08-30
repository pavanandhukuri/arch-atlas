import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import { RepoAnalysisSchema, type RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';

/**
 * 008 Phase 6 (proof gate, FR-017): the full pipeline over the expanded
 * multi-language fixture workspace, with the bounded model call stubbed to
 * return the pre-canned analyses. Everything downstream — the evidence
 * correlator, review assembly, and `.arch.json` export — runs for real against
 * the fixture source on disk. Snapshots the cross-repo connection set so the
 * proof doc can compare it to the 007 pipeline's known-correct set.
 *
 * No local model, no Python — runs in ordinary CI.
 */

const analyzeRepoMock = vi.fn();
vi.mock('../../src/analysis/analyze-repo.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/analysis/analyze-repo.js')>(
    '../../src/analysis/analyze-repo.js'
  );
  return { ...actual, analyzeRepo: analyzeRepoMock };
});

// The agentic fallback (unchanged from 007, separately tested) needs a live
// model runtime — out of scope for this "no model" proof. Stub it to empty so
// the test measures only the deterministic evidence pipeline.
vi.mock('../../src/correlate/agentic-correlator.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/correlate/agentic-correlator.js')>(
    '../../src/correlate/agentic-correlator.js'
  );
  return { ...actual, correlateAgentically: vi.fn(() => Promise.resolve([])) };
});
vi.mock('../../src/model-runtime/local-model-runtime.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/model-runtime/local-model-runtime.js')
  >('../../src/model-runtime/local-model-runtime.js');
  return {
    ...actual,
    buildLocalModelRuntime: vi.fn(() =>
      Promise.resolve({ model: { id: 'stub', provider: 'ollama' }, modelRuntime: {} })
    ),
  };
});

const { runImport } = await import('../../src/analysis/run-import.js');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const REPOS = ['user-service', 'notification-service', 'audit-service', 'gateway'] as const;

async function cannedAnalysis(name: string, realPath: string): Promise<RepoAnalysis> {
  const raw = JSON.parse(
    await readFile(join(FIXTURES, 'analyses', `${name}.analysis.json`), 'utf8')
  ) as unknown;
  const analysis = RepoAnalysisSchema.parse(raw);
  analysis.repository.path = realPath;
  return analysis;
}

let outputDir: string;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'arch-atlas-e2e-'));
  analyzeRepoMock.mockImplementation(
    async ({ repoName, repoPath }: { repoName: string; repoPath: string }) => ({
      status: 'complete' as const,
      analysis: await cannedAnalysis(repoName, repoPath),
      retryCount: 0 as const,
    })
  );
});
afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

function config(): ImportConfig {
  return {
    version: '2.0',
    localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'stub' },
    output: { directory: outputDir, diagramFileName: 'architecture.arch.json' },
    analysis: {
      maxFilesPerRepo: 200,
      excludePatterns: [],
      forceRefresh: false,
      maxConcurrency: 2,
      temperature: 0.1,
      verifyGrounding: false,
      structuredOutput: 'prompt',
    },
    repositories: REPOS.map((name) => ({ name, path: join(FIXTURES, 'repos', name) })),
  };
}

describe('pipeline e2e over the expanded fixture workspace (stubbed model)', () => {
  it('produces analyses, a review artifact, and a valid diagram with the known cross-repo edges', async () => {
    await runImport(config(), {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: false,
      verbose: false,
    });

    // One analysis artifact per repo.
    for (const name of REPOS) {
      const a = JSON.parse(await readFile(join(outputDir, `${name}.analysis.json`), 'utf8')) as {
        repository: { name: string };
      };
      expect(a.repository.name).toBe(name);
    }

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as {
      candidates: Array<{ source: string; target: string; type: string; reasoning: string }>;
      repos: Array<{ name: string; technology?: string }>;
    };

    const edgeSet = new Set(review.candidates.map((c) => `${c.source} -> ${c.target}`));
    // Known cross-repo connections the correlator should recover from fixture source:
    expect(edgeSet.has('user-service -> notification-service')).toBe(true); // gateway-prefixed HTTP
    expect(edgeSet.has('gateway -> notification-service')).toBe(true);
    expect(edgeSet.has('gateway -> user-service')).toBe(true);
    expect(edgeSet.has('gateway -> audit-service')).toBe(true);

    // Snapshot for the proof doc (order-independent). `user-service -> gateway`
    // is the name-mention pass reacting to "…through the API gateway" in the
    // analysis prose — a low-confidence extra, not a known edge.
    const snapshot = [...edgeSet].sort();
    expect(snapshot).toMatchInlineSnapshot(`
      [
        "gateway -> audit-service",
        "gateway -> notification-service",
        "gateway -> user-service",
        "user-service -> gateway",
        "user-service -> notification-service",
      ]
    `);

    // US3: the review carries per-repo technology.
    expect(review.repos.find((r) => r.name === 'audit-service')?.technology).toBe('kafka-go');

    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { schemaVersion: string; elements: Array<{ name: string; technology?: string }> };
    expect(diagram.schemaVersion).toBe('1.0.0');
    expect(diagram.elements.find((e) => e.name === 'gateway')?.technology).toBe('Express');
  });
});
