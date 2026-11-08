import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';
import type { ComponentAnalysis } from '../../src/analysis/component-analysis.schema.js';
import { runImport, type RunImportOptions } from '../../src/analysis/run-import.js';
import { writeAnalysis, writeComponents } from '../../src/analysis/analysis-store.js';
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

function makeComponents(name: string, over: Partial<ComponentAnalysis> = {}): ComponentAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-31T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    components: [{ name: 'Controller', kind: 'controller', description: 'handles requests' }],
    relationships: [],
    analysisStatus: 'complete',
    retryCount: 0,
    ...over,
  };
}

function makeConfig(over: Partial<ImportConfig> = {}): ImportConfig {
  return {
    version: '2.0',
    output: { directory: outputDir },
    repositories: [{ path: '/service-a', name: 'service-a' }],
    ...over,
  };
}

const OPTS: RunImportOptions = { verbose: false };

let errs: string[];

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'run-import-'));
  errs = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errs.push(a.map(String).join(' '));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(outputDir, { recursive: true, force: true });
});

describe('runImport — model-free core (010)', () => {
  it('builds the review artifact from existing {repo}.analysis.json artifacts, no network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await writeAnalysis(outputDir, makeAnalysis('service-a'));

    await runImport(makeConfig(), OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { source_repos: string[] };
    expect(review.source_repos).toEqual(['service-a']);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('writes no architecture.arch.json — only Studio, after review, builds one with real relationships', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await runImport(makeConfig(), OPTS);
    await expect(readFile(join(outputDir, 'architecture.arch.json'), 'utf8')).rejects.toThrow();
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
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { source_repos: string[] };
    expect(review.source_repos).toEqual(['service-a']);
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

  it('prints a message and writes no review artifact when there are zero valid artifacts', async () => {
    await runImport(makeConfig(), OPTS);
    expect(errs.join('\n')).toMatch(/No valid analysis artifacts found/);
    await expect(readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')).rejects.toThrow();
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

  it("carries description + technology onto the review artifact's repos[] (008 US3)", async () => {
    await writeAnalysis(
      outputDir,
      makeAnalysis('service-a', {
        description: 'the accounts service',
        languages: ['TypeScript'],
        frameworks: ['NestJS'],
      })
    );
    await runImport(makeConfig(), OPTS);
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { repos: Array<{ name: string; description?: string; technology?: string }> };
    const meta = review.repos.find((r) => r.name === 'service-a');
    expect(meta?.description).toBe('the accounts service');
    expect(meta?.technology).toBe('TypeScript / NestJS');
  });

  it('technology label: language headline + first non-noise framework, else language alone', async () => {
    await writeAnalysis(
      outputDir,
      makeAnalysis('service-a', {
        languages: ['Go'],
        frameworks: ['net/http', 'gorilla/websocket'],
      })
    );
    await writeAnalysis(
      outputDir,
      makeAnalysis('service-b', { languages: ['Java'], frameworks: ['Spring Boot', 'Liquibase'] })
    );
    await runImport(
      makeConfig({
        repositories: [
          { path: '/service-a', name: 'service-a' },
          { path: '/service-b', name: 'service-b' },
        ],
      }),
      OPTS
    );
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { repos: Array<{ name: string; technology?: string }> };
    const tech = (n: string): string | undefined =>
      review.repos.find((r) => r.name === n)?.technology;
    expect(tech('service-a')).toBe('Go'); // every framework is transport noise → language only
    expect(tech('service-b')).toBe('Java / Spring Boot');
  });

  it('carries import.yaml\'s "systems" onto the review artifact, pre-grouping repos (Studio LOAD_REVIEW consumes this directly)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('multimodal-app-sdk-go'));
    await writeAnalysis(outputDir, makeAnalysis('multimodal-app-sdk-kmp'));
    const config = makeConfig({
      repositories: [
        { path: '/multimodal-app-sdk-go', name: 'multimodal-app-sdk-go' },
        { path: '/multimodal-app-sdk-kmp', name: 'multimodal-app-sdk-kmp' },
      ],
      systems: [
        { name: 'UDS SDK', repositories: ['multimodal-app-sdk-go', 'multimodal-app-sdk-kmp'] },
      ],
    });

    await runImport(config, OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { systems: Array<{ name: string; repositories: string[] }> };
    expect(review.systems).toEqual([
      { name: 'UDS SDK', repositories: ['multimodal-app-sdk-go', 'multimodal-app-sdk-kmp'] },
    ]);
  });

  it('resolves systems[].repositories against the path-derived name when a repo has no explicit "name"', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    const config = makeConfig({
      repositories: [{ path: '/anything/service-a' }], // no `name` — derived from the path
      systems: [{ name: 'Core', repositories: ['service-a'] }],
    });

    await runImport(config, OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { systems: Array<{ name: string; repositories: string[] }> };
    expect(review.systems).toEqual([{ name: 'Core', repositories: ['service-a'] }]);
  });

  it('warns and drops a systems[] entry that names a repo not among the imported repositories, without failing the import', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    const config = makeConfig({
      systems: [{ name: 'Core', repositories: ['service-a', 'typo-d-service'] }],
    });

    await runImport(config, OPTS);

    expect(errs.join('\n')).toMatch(
      /\[warn\] system "Core": repository "typo-d-service" not found/
    );
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { systems: Array<{ name: string; repositories: string[] }> };
    expect(review.systems).toEqual([{ name: 'Core', repositories: ['service-a'] }]);
  });

  it('drops a systems[] entry entirely when none of its repositories resolved', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    const config = makeConfig({ systems: [{ name: 'Ghost', repositories: ['nope'] }] });

    await runImport(config, OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { systems: unknown[] };
    expect(review.systems).toEqual([]);
  });

  it('leaves systems empty when import.yaml declares none (backward compatible)', async () => {
    await writeAnalysis(outputDir, makeAnalysis('service-a'));
    await runImport(makeConfig(), OPTS);

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { systems: unknown[] };
    expect(review.systems).toEqual([]);
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

  describe('015-component-analysis-default: folding {repo}.components.json into repos[]', () => {
    it("carries a repository's components + componentRelationships onto its repos[] entry", async () => {
      await writeAnalysis(outputDir, makeAnalysis('service-a'));
      await writeComponents(
        outputDir,
        makeComponents('service-a', {
          components: [
            { name: 'Controller', kind: 'controller', description: 'handles requests' },
            { name: 'Repository', kind: 'repository', description: 'reads the db' },
          ],
          relationships: [{ source: 'Controller', target: 'Repository', description: 'queries' }],
        })
      );

      await runImport(makeConfig(), OPTS);

      const review = JSON.parse(
        await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
      ) as {
        repos: Array<{
          name: string;
          components?: Array<{ name: string }>;
          componentRelationships?: Array<{ source: string; target: string }>;
        }>;
      };
      const meta = review.repos.find((r) => r.name === 'service-a');
      expect(meta?.components).toEqual([
        { name: 'Controller', kind: 'controller', description: 'handles requests' },
        { name: 'Repository', kind: 'repository', description: 'reads the db' },
      ]);
      expect(meta?.componentRelationships).toEqual([
        { source: 'Controller', target: 'Repository', description: 'queries' },
      ]);
    });

    it('a repository with no components.json has no components field and is not skipped (FR-008 near-empty is still valid elsewhere, missing is fine here)', async () => {
      await writeAnalysis(outputDir, makeAnalysis('service-a'));

      await runImport(makeConfig(), OPTS);

      const review = JSON.parse(
        await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
      ) as { repos: Array<{ name: string; components?: unknown }> };
      const meta = review.repos.find((r) => r.name === 'service-a');
      expect(meta?.components).toBeUndefined();
      expect(review.repos).toHaveLength(1);
    });

    it('warns and omits components for a malformed {repo}.components.json, without failing the import', async () => {
      await writeAnalysis(outputDir, makeAnalysis('service-a'));
      await writeFile(
        join(outputDir, 'service-a.components.json'),
        '{ "schemaVersion": "1.0" }',
        'utf8'
      );

      await runImport(makeConfig(), OPTS);

      expect(errs.join('\n')).toMatch(/\[warn\] service-a: invalid components artifact/);
      const review = JSON.parse(
        await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
      ) as { repos: Array<{ name: string; components?: unknown }>; source_repos: string[] };
      expect(review.source_repos).toEqual(['service-a']);
      expect(review.repos.find((r) => r.name === 'service-a')?.components).toBeUndefined();
    });

    it("re-running import refreshes a repository's components rather than duplicating them (FR-009)", async () => {
      await writeAnalysis(outputDir, makeAnalysis('service-a'));
      await writeComponents(
        outputDir,
        makeComponents('service-a', {
          components: [{ name: 'Old', kind: 'module', description: 'stale' }],
        })
      );
      await runImport(makeConfig(), OPTS);

      await writeComponents(
        outputDir,
        makeComponents('service-a', {
          components: [{ name: 'New', kind: 'module', description: 'fresh' }],
        })
      );
      await runImport(makeConfig(), OPTS);

      const review = JSON.parse(
        await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
      ) as { repos: Array<{ name: string; components?: Array<{ name: string }> }> };
      expect(review.repos.find((r) => r.name === 'service-a')?.components).toEqual([
        { name: 'New', kind: 'module', description: 'fresh' },
      ]);
    });

    it('each repository only gets its own components.json — no cross-repo leakage', async () => {
      await writeAnalysis(outputDir, makeAnalysis('service-a'));
      await writeAnalysis(outputDir, makeAnalysis('service-b'));
      await writeComponents(outputDir, makeComponents('service-a'));
      const config = makeConfig({
        repositories: [
          { path: '/service-a', name: 'service-a' },
          { path: '/service-b', name: 'service-b' },
        ],
      });

      await runImport(config, OPTS);

      const review = JSON.parse(
        await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
      ) as { repos: Array<{ name: string; components?: unknown }> };
      expect(review.repos.find((r) => r.name === 'service-a')?.components).toBeDefined();
      expect(review.repos.find((r) => r.name === 'service-b')?.components).toBeUndefined();
    });
  });
});
