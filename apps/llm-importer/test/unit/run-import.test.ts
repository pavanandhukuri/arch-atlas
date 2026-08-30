import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';

const analyzeRepoMock = vi.fn();

vi.mock('../../src/analysis/analyze-repo.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/analysis/analyze-repo.js')>(
    '../../src/analysis/analyze-repo.js'
  );
  return { ...actual, analyzeRepo: analyzeRepoMock };
});

vi.mock('../../src/model-runtime/local-model-runtime.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/model-runtime/local-model-runtime.js')
  >('../../src/model-runtime/local-model-runtime.js');
  return {
    ...actual,
    buildLocalModelRuntime: vi.fn(() =>
      Promise.resolve({ model: { id: 'llama3', provider: 'ollama' }, modelRuntime: {} })
    ),
  };
});

const { runImport } = await import('../../src/analysis/run-import.js');
const { writeAnalysis } = await import('../../src/analysis/analysis-store.js');

let outputDir: string;

function makeAnalysis(name: string): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-30T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    description: `${name} summary`,
    languages: ['TypeScript'],
    frameworks: ['Express'],
    served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
    outbound: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

function makeConfig(overrides: Partial<ImportConfig> = {}): ImportConfig {
  return {
    version: '2.0',
    localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
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
    repositories: [{ path: '/service-a', name: 'service-a' }],
    ...overrides,
  };
}

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'arch-atlas-run-import-test-'));
  analyzeRepoMock
    .mockReset()
    .mockImplementation(({ repoName }: { repoName: string }) =>
      Promise.resolve({ status: 'complete', analysis: makeAnalysis(repoName), retryCount: 0 })
    );
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('runImport — US1 bounded analysis wiring', () => {
  it('writes {repo}.analysis.json and prints the progress lines', async () => {
    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errs.push(a.join(' '));
    });

    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: false,
      verbose: false,
    });
    spy.mockRestore();

    const written = JSON.parse(
      await readFile(join(outputDir, 'service-a.analysis.json'), 'utf8')
    ) as { repository: { name: string } };
    expect(written.repository.name).toBe('service-a');
    expect(errs.join('\n')).toMatch(/\[done\] service-a: Express ·/);
  });

  it('adds a repo to failures and writes no artifact when analyzeRepo fails', async () => {
    analyzeRepoMock.mockResolvedValue({
      status: 'failed',
      error: 'model output failed schema validation after retry',
      retryCount: 1,
    });

    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });

    await expect(readFile(join(outputDir, 'service-a.analysis.json'), 'utf8')).rejects.toThrow();
  });
});

describe('runImport — US3 incremental re-import', () => {
  it('skips analysis for a repo with a valid cached artifact (FR-012)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });
    expect(analyzeRepoMock).not.toHaveBeenCalled();
  });

  it('re-analyzes despite a cached artifact when --force-refresh is passed', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await runImport(makeConfig(), {
      forceRefresh: true,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });
    expect(analyzeRepoMock).toHaveBeenCalledTimes(1);
  });

  it('runs zero analysis calls with --aggregate-only, using only existing artifacts (FR-012)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: true,
      verbose: false,
    });
    expect(analyzeRepoMock).not.toHaveBeenCalled();
    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(diagram).toHaveProperty('schemaVersion');
  });

  it('analyzes a repo with no cached artifact even without --force-refresh', async () => {
    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: true,
      aggregateOnly: false,
      verbose: false,
    });
    expect(analyzeRepoMock).toHaveBeenCalledTimes(1);
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
    expect(analyzeRepoMock).toHaveBeenCalledTimes(1);
  });
});

describe('runImport — US2 partial-failure handling (FR-014)', () => {
  it('continues and still writes a diagram when one repo fails and another succeeds', async () => {
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });
    analyzeRepoMock.mockImplementation(({ repoName }: { repoName: string }) =>
      repoName === 'service-b'
        ? Promise.resolve({ status: 'failed', error: 'simulated failure', retryCount: 1 })
        : Promise.resolve({ status: 'complete', analysis: makeAnalysis(repoName), retryCount: 0 })
    );

    await runImport(config, {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: false,
      verbose: false,
    });

    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(diagram).toHaveProperty('elements');
  });

  it('carries description + technology onto container elements (US3)', async () => {
    analyzeRepoMock.mockImplementation(({ repoName }: { repoName: string }) => {
      const a = makeAnalysis(repoName);
      a.description = 'the accounts service';
      a.frameworks = ['NestJS'];
      return Promise.resolve({ status: 'complete', analysis: a, retryCount: 0 });
    });

    await runImport(makeConfig(), {
      forceRefresh: false,
      analyzeOnly: false,
      aggregateOnly: false,
      verbose: false,
    });

    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { elements: Array<{ name: string; description?: string; technology?: string }> };
    const el = diagram.elements.find((e) => e.name === 'service-a');
    expect(el?.description).toBe('the accounts service');
    expect(el?.technology).toBe('NestJS');
  });
});
