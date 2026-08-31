import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepoAnalysis } from '@arch-atlas/llm-importer';

const analyzeRepoLocalMock = vi.fn();
const firstArg = (): Record<string, unknown> =>
  ((analyzeRepoLocalMock.mock.calls as unknown as unknown[][])[0]?.[0] ?? {}) as Record<
    string,
    unknown
  >;
const checkReachableMock = vi.fn();

vi.mock('../../src/analyze-repo.js', () => ({ analyzeRepoLocal: analyzeRepoLocalMock }));
vi.mock('../../src/reachability.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/reachability.js')>(
    '../../src/reachability.js'
  );
  return { ...actual, checkLocalModelReachable: checkReachableMock };
});

const { runAnalyze } = await import('../../src/cli.js');
const { LocalModelUnreachableError } = await import('../../src/reachability.js');

let outDir: string;
let configPath: string;

function analysis(name: string): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-31T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    description: name,
    languages: ['Go'],
    frameworks: ['Gin'],
    served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
    outbound: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'runner-cli-'));
  configPath = join(outDir, 'import.yaml');
  await writeFile(
    configPath,
    [
      "version: '2.0'",
      'localModel:',
      '  provider: ollama',
      '  endpoint: http://localhost:11434/v1',
      '  modelId: llama3',
      'output:',
      `  directory: ${outDir}`,
      'repositories:',
      '  - { path: /repos/a, name: a }',
      '  - { path: /repos/b, name: b }',
    ].join('\n'),
    'utf8'
  );
  analyzeRepoLocalMock
    .mockReset()
    .mockImplementation(({ repoName }: { repoName: string }) =>
      Promise.resolve({ status: 'complete', analysis: analysis(repoName) })
    );
  checkReachableMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(outDir, { recursive: true, force: true });
});

describe('runAnalyze', () => {
  it('writes one {repo}.analysis.json per repo, exit 0', async () => {
    const code = await runAnalyze(configPath, {});
    expect(code).toBe(0);
    const files = (await readdir(outDir)).filter((f) => f.endsWith('.analysis.json')).sort();
    expect(files).toEqual(['a.analysis.json', 'b.analysis.json']);
  });

  it('fails fast with exit 2 and writes nothing when the endpoint is unreachable (LR5)', async () => {
    checkReachableMock.mockRejectedValue(
      new LocalModelUnreachableError('http://localhost:11434/v1', new Error('ECONNREFUSED'))
    );
    const code = await runAnalyze(configPath, {});
    expect(code).toBe(2);
    expect(analyzeRepoLocalMock).not.toHaveBeenCalled();
    const files = (await readdir(outDir)).filter((f) => f.endsWith('.analysis.json'));
    expect(files).toEqual([]);
  });

  it('logs a per-repo failure and continues the batch (LR3)', async () => {
    analyzeRepoLocalMock.mockImplementation(({ repoName }: { repoName: string }) =>
      repoName === 'a'
        ? Promise.resolve({ status: 'failed', error: 'bad output' })
        : Promise.resolve({ status: 'complete', analysis: analysis(repoName) })
    );
    const code = await runAnalyze(configPath, {});
    expect(code).toBe(0);
    const files = (await readdir(outDir)).filter((f) => f.endsWith('.analysis.json'));
    expect(files).toEqual(['b.analysis.json']);
  });

  it('respects --repos', async () => {
    await runAnalyze(configPath, { repos: 'a' });
    expect(analyzeRepoLocalMock).toHaveBeenCalledOnce();
    expect(firstArg()).toMatchObject({
      repoName: 'a',
    });
  });

  it('skips a repo with a valid cached artifact unless --force-refresh', async () => {
    await writeFile(join(outDir, 'a.analysis.json'), JSON.stringify(analysis('a')), 'utf8');
    await runAnalyze(configPath, {});
    expect(analyzeRepoLocalMock).toHaveBeenCalledOnce(); // only b
    analyzeRepoLocalMock.mockClear();
    await runAnalyze(configPath, { forceRefresh: true });
    expect(analyzeRepoLocalMock).toHaveBeenCalledTimes(2); // a and b
  });

  it('reads context bundles with --from-bundles instead of a repo path', async () => {
    for (const n of ['a', 'b']) {
      await writeFile(
        join(outDir, `${n}.context.json`),
        JSON.stringify({
          schemaVersion: '1.0',
          generatedAt: '2026-08-31T00:00:00.000Z',
          repoName: n,
          repoPath: `/repos/${n}`,
          readmes: [],
          manifests: [],
          dependencySplits: [],
          listing: [],
          sourceExcerpts: [],
          detected: { httpRoutes: [], topics: [] },
          totalBytes: 0,
        }),
        'utf8'
      );
    }
    await runAnalyze(configPath, { fromBundles: outDir });
    const arg = firstArg();
    expect(arg).toHaveProperty('input');
    const input = arg.input as { bundle: { repoName: string } };
    expect(input.bundle.repoName).toBe('a');
  });
});
