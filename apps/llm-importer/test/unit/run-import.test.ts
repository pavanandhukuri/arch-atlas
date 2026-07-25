import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const runUnderstandMock = vi.fn();

vi.mock('../../src/analysis/run-understand.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/analysis/run-understand.js')>(
    '../../src/analysis/run-understand.js'
  );
  return { ...actual, runUnderstand: runUnderstandMock };
});

vi.mock('../../src/model-runtime/local-model-runtime.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/model-runtime/local-model-runtime.js')
  >('../../src/model-runtime/local-model-runtime.js');
  return {
    ...actual,
    buildLocalModelRuntime: vi.fn(() =>
      Promise.resolve({
        model: { id: 'llama3', provider: 'ollama' },
        modelRuntime: {},
      })
    ),
  };
});

const { runImport } = await import('../../src/analysis/run-import.js');
const { writeKnowledgeGraph } = await import('../../src/graph/knowledge-graph-store.js');

let outputDir: string;

function makeGraph(name: string): RepositoryKnowledgeGraph {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-01-01T00:00:00Z',
    repository: { name, path: `/${name}` },
    nodes: [],
    edges: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

function makeConfig(overrides: Partial<ImportConfig> = {}): ImportConfig {
  return {
    version: '2.0',
    localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
    output: { directory: outputDir, diagramFileName: 'architecture.arch.json' },
    analysis: { maxFilesPerRepo: 200, excludePatterns: [], forceRefresh: false, maxConcurrency: 2 },
    repositories: [{ path: '/service-a', name: 'service-a' }],
    ...overrides,
  };
}

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'arch-atlas-run-import-test-'));
  runUnderstandMock
    .mockReset()
    .mockResolvedValue({ status: 'complete', graph: makeGraph('service-a') });
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('runImport — US3 incremental re-import', () => {
  it('skips analysis for a repo with a valid cached artifact (FR-011)', async () => {
    await writeKnowledgeGraph(outputDir, makeGraph('service-a'));

    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });

    expect(runUnderstandMock).not.toHaveBeenCalled();
  });

  it('re-analyzes despite a cached artifact when --force-refresh is passed', async () => {
    await writeKnowledgeGraph(outputDir, makeGraph('service-a'));

    await runImport(makeConfig(), {
      forceRefresh: true,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });

    expect(runUnderstandMock).toHaveBeenCalledTimes(1);
  });

  it('runs zero analysis sessions with --aggregate-only, using only existing artifacts (FR-012)', async () => {
    await writeKnowledgeGraph(outputDir, makeGraph('service-a'));

    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: true,
      verbose: false,
    });

    expect(runUnderstandMock).not.toHaveBeenCalled();
    const diagramContents = await readFile(join(outputDir, 'architecture.arch.json'), 'utf8');
    expect(JSON.parse(diagramContents)).toHaveProperty('schemaVersion');
  });

  it('analyzes a repo with no cached artifact even without --force-refresh', async () => {
    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });
    expect(runUnderstandMock).toHaveBeenCalledTimes(1);
  });

  it('filters to only the repos named in --repos', async () => {
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });
    await runImport(config, {
      forceRefresh: false,
      repoNamesFilter: ['service-a'],
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });
    expect(runUnderstandMock).toHaveBeenCalledTimes(1);
  });
});

describe('runImport — US2 partial-failure handling (FR-010)', () => {
  it('continues and still writes a diagram when one repo fails and another succeeds', async () => {
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });
    runUnderstandMock.mockImplementation(({ repoName }: { repoName: string }) => {
      if (repoName === 'service-b')
        return { status: 'failed', error: 'simulated failure', retryCount: 1 };
      return { status: 'complete', graph: makeGraph(repoName) };
    });

    await runImport(config, {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: false,
      verbose: false,
    });

    const diagramContents = await readFile(join(outputDir, 'architecture.arch.json'), 'utf8');
    expect(JSON.parse(diagramContents)).toHaveProperty('elements');
  });
});
