import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasValidCachedAnalysis,
  readAnalysis,
  writeAnalysis,
  listAllAnalyses,
} from '../../src/analysis/analysis-store.js';
import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';

let outputDir: string;

function makeAnalysis(name: string): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-30T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    description: `${name} does things`,
    languages: ['TypeScript'],
    frameworks: [],
    served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
    outbound: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'arch-atlas-analysis-store-'));
});
afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('writeAnalysis / readAnalysis', () => {
  it('round-trips a valid analysis under {name}.analysis.json', async () => {
    const path = await writeAnalysis(outputDir, makeAnalysis('svc-a'));
    expect(path).toContain('svc-a.analysis.json');
    const read = await readAnalysis(outputDir, 'svc-a');
    expect(read.repository.name).toBe('svc-a');
  });

  it('creates the output directory if missing', async () => {
    const nested = join(outputDir, 'a', 'b');
    await writeAnalysis(nested, makeAnalysis('svc-a'));
    expect(await hasValidCachedAnalysis(nested, 'svc-a')).toBe(true);
  });

  it('refuses to persist an invalid analysis', async () => {
    const bad = { ...makeAnalysis('bad'), served: 'nope' } as unknown as RepoAnalysis;
    await expect(writeAnalysis(outputDir, bad)).rejects.toThrow();
  });
});

describe('hasValidCachedAnalysis', () => {
  it('false when nothing is written', async () => {
    expect(await hasValidCachedAnalysis(outputDir, 'nope')).toBe(false);
  });
  it('true after a valid write', async () => {
    await writeAnalysis(outputDir, makeAnalysis('svc-a'));
    expect(await hasValidCachedAnalysis(outputDir, 'svc-a')).toBe(true);
  });
  it('false for corrupt JSON', async () => {
    await writeFile(join(outputDir, 'broken.analysis.json'), '{ not json', 'utf8');
    expect(await hasValidCachedAnalysis(outputDir, 'broken')).toBe(false);
  });
  it('false for well-formed JSON that fails the schema', async () => {
    await writeFile(join(outputDir, 'wrong.analysis.json'), JSON.stringify({ foo: 1 }), 'utf8');
    expect(await hasValidCachedAnalysis(outputDir, 'wrong')).toBe(false);
  });
});

describe('listAllAnalyses', () => {
  it('empty array for a missing directory', async () => {
    expect(await listAllAnalyses(join(outputDir, 'nope'))).toEqual([]);
  });

  it('lists valid *.analysis.json and skips other / corrupt files', async () => {
    await writeAnalysis(outputDir, makeAnalysis('svc-a'));
    await writeAnalysis(outputDir, makeAnalysis('svc-b'));
    await writeFile(join(outputDir, 'README.md'), 'x', 'utf8');
    await writeFile(join(outputDir, 'corrupt.analysis.json'), '{bad', 'utf8');
    const all = await listAllAnalyses(outputDir);
    expect(all.map((a) => a.repository.name).sort()).toEqual(['svc-a', 'svc-b']);
  });

  it('ignores 007-era *.knowledge-graph.json files and logs an upgrade notice', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(
      join(outputDir, 'old.knowledge-graph.json'),
      JSON.stringify({ schemaVersion: '1.0' }),
      'utf8'
    );
    const all = await listAllAnalyses(outputDir);
    expect(all).toEqual([]);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/knowledge-graph\.json/);
    warn.mockRestore();
  });
});
