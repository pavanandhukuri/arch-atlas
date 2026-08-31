import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';
import { runImport, type RunImportOptions } from '../../src/analysis/run-import.js';
import { writeAnalysis } from '../../src/analysis/analysis-store.js';
import {
  EXTRA_CONNECTIONS_FILE,
  EXTRA_CONNECTIONS_VERSION,
} from '../../src/correlate/extra-connections.js';

let outputDir: string;

function makeAnalysis(name: string, over: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-31T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    description: `${name} summary`,
    languages: ['TypeScript'],
    frameworks: ['Express'],
    served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
    outbound: [],
    analysisStatus: 'complete',
    retryCount: 0,
    ...over,
  };
}

function makeConfig(over: Partial<ImportConfig> = {}): ImportConfig {
  return {
    version: '2.0',
    output: { directory: outputDir, diagramFileName: 'architecture.arch.json' },
    analysis: {
      maxFilesPerRepo: 200,
      excludePatterns: [],
      forceRefresh: false,
      maxConcurrency: 1,
      temperature: 0.1,
      verifyGrounding: false,
      structuredOutput: 'prompt',
    },
    repositories: [{ path: '/service-a', name: 'service-a' }],
    ...over,
  };
}

const OPTS: RunImportOptions = { verbose: false };

let errs: string[];
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'run-import-'));
  errs = [];
  errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.map(String).join(' '));
  });
});

afterEach(async () => {
  errSpy.mockRestore();
  await rm(outputDir, { recursive: true, force: true });
});

describe('runImport — model-free core (010)', () => {
  it('builds review + diagram from existing {repo}.analysis.json artifacts, no network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await writeAnalysis(outputDir, makeAnalysis('service-a'));

    await runImport(makeConfig(), OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { source_repos: string[] };
    expect(review.source_repos).toEqual(['service-a']);
    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(diagram).toHaveProperty('schemaVersion');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('names and skips a missing artifact, continues with the rest (FR-003)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });

    await runImport(config, OPTS);

    expect(errs.join('\n')).toMatch(/\[skip\] service-b: no analysis artifact/);
    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { elements: Array<{ name: string }> };
    expect(diagram.elements.some((e) => e.name === 'service-a')).toBe(true);
  });

  it('names and skips a malformed artifact (FR-003)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await writeFile(
      join(outputDir, 'service-b.analysis.json'),
      '{ "schemaVersion": "1.0" }',
      'utf8'
    );
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });

    await runImport(config, OPTS);
    expect(errs.join('\n')).toMatch(/\[skip\] service-b: invalid analysis artifact/);
  });

  it('prints a message and writes no diagram when there are zero valid artifacts', async () => {
    await runImport(makeConfig(), OPTS);
    expect(errs.join('\n')).toMatch(/No valid analysis artifacts found/);
    await expect(readFile(join(outputDir, 'architecture.arch.json'), 'utf8')).rejects.toThrow();
  });

  it('respects the --repos filter (FR-016)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await writeAnalysis(outputDir, makeAnalysis('service-b'));
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });

    await runImport(config, { verbose: false, repoNamesFilter: ['service-a'] });

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { source_repos: string[] };
    expect(review.source_repos).toEqual(['service-a']);
  });

  it('is unaffected by a localModel block in the config (FR-001 AS-4)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    const withModel = makeConfig({
      localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'x' },
    });
    await runImport(withModel, OPTS);
    const a = await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8');

    await rm(join(outputDir, 'architecture.review.yaml'));
    await runImport(makeConfig(), OPTS);
    const b = await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8');

    const strip = (s: string): string => s.replace(/"generated_at":\s*"[^"]+"/, '');
    expect(strip(a)).toBe(strip(b));
  });

  it('merges architecture.extra-connections.json as a low-confidence candidate (FR-013)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await writeAnalysis(outputDir, makeAnalysis('service-b'));
    await writeFile(
      join(outputDir, EXTRA_CONNECTIONS_FILE),
      JSON.stringify({
        schemaVersion: EXTRA_CONNECTIONS_VERSION,
        generatedAt: '2026-08-31T00:00:00.000Z',
        connections: [
          {
            sourceRepo: 'service-a',
            sourceNodeId: 'module:service-a',
            targetRepo: 'service-b',
            targetNodeId: 'module:service-b',
            type: 'calls',
            foundBy: 'agentic-fallback',
            evidence: ['inferred: both handle billing'],
            weight: 0.85,
          },
        ],
      }),
      'utf8'
    );
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });

    await runImport(config, OPTS);
    expect(errs.join('\n')).toMatch(/extra-connections: 1 loaded/);
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { candidates: Array<{ source: string; target: string; confidence: string }> };
    const cand = review.candidates.find(
      (c) => c.source === 'service-a' && c.target === 'service-b'
    );
    expect(cand?.confidence).toBe('low');
  });

  it('errors on a malformed architecture.extra-connections.json', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await writeFile(join(outputDir, EXTRA_CONNECTIONS_FILE), '{ not json', 'utf8');
    await expect(runImport(makeConfig(), OPTS)).rejects.toThrow();
  });

  it('carries description + technology onto container elements (008 US3)', async () => {
    await writeAnalysis(
      outputDir,
      makeAnalysis('service-a', { description: 'the accounts service', frameworks: ['NestJS'] })
    );
    await runImport(makeConfig(), OPTS);
    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { elements: Array<{ name: string; description?: string; technology?: string }> };
    const el = diagram.elements.find((e) => e.name === 'service-a');
    expect(el?.description).toBe('the accounts service');
    expect(el?.technology).toBe('NestJS');
  });

  it('is deterministic — two runs produce an identical review modulo generated_at', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await writeAnalysis(outputDir, makeAnalysis('service-b'));
    const config = makeConfig({
      repositories: [
        { path: '/service-a', name: 'service-a' },
        { path: '/service-b', name: 'service-b' },
      ],
    });
    await runImport(config, OPTS);
    const first = await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8');
    await runImport(config, OPTS);
    const second = await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8');
    const strip = (s: string): string => s.replace(/"generated_at":\s*"[^"]+"/, '');
    expect(strip(first)).toBe(strip(second));
  });
});
