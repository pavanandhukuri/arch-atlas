import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportConfig } from '../../src/config/config.schema.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { runImport } from '../../src/analysis/run-import.js';

/**
 * 010 proof gate (FR-001 / SC-001 / SC-006): a full `import` run over the
 * committed `test/fixtures/analyses/*.json` — as if some producer had made them —
 * with NO model and NO network. Downstream correlation, review assembly and
 * `.arch.json` export run for real against the fixture source on disk.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const REPOS = ['user-service', 'notification-service', 'audit-service', 'gateway'] as const;

let outputDir: string;

/** Copy the pre-canned analyses into outputDir, patching repository.path to the real fixture tree. */
async function seedAnalyses(only?: readonly string[]): Promise<void> {
  for (const name of only ?? REPOS) {
    const raw = JSON.parse(
      await readFile(join(FIXTURES, 'analyses', `${name}.analysis.json`), 'utf8')
    ) as unknown;
    const analysis = RepoAnalysisSchema.parse(raw);
    analysis.repository.path = join(FIXTURES, 'repos', name);
    await writeFile(
      join(outputDir, `${name}.analysis.json`),
      JSON.stringify(analysis, null, 2),
      'utf8'
    );
  }
}

function config(over: Partial<ImportConfig> = {}): ImportConfig {
  return {
    version: '2.0',
    output: { directory: outputDir, diagramFileName: 'architecture.arch.json' },
    repositories: REPOS.map((name) => ({ name, path: join(FIXTURES, 'repos', name) })),
    ...over,
  };
}

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'model-free-'));
});
afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('model-free import pipeline', () => {
  it('produces the review + diagram with the known cross-repo edges and makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await seedAnalyses();

    await runImport(config(), { verbose: false });

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as {
      candidates: Array<{ source: string; target: string }>;
      repos: Array<{ name: string; technology?: string }>;
    };
    const edgeSet = new Set(review.candidates.map((c) => `${c.source} -> ${c.target}`));

    expect(edgeSet.has('user-service -> notification-service')).toBe(true); // gateway-prefixed HTTP
    expect(edgeSet.has('gateway -> notification-service')).toBe(true);
    expect(edgeSet.has('gateway -> user-service')).toBe(true);
    expect(edgeSet.has('gateway -> audit-service')).toBe(true);
    // topicPass: audit-service's fixture source consumes Go's idiomatic capitalized
    // `Topic: "user-created"` struct field — was silently missed before topics.ts's
    // KAFKA_TOPIC_RE gained the case-insensitive flag (found via the repo-analysis skill
    // eval, which surfaced this exact gap against real Go source).
    expect(edgeSet.has('user-service -> audit-service')).toBe(true);

    expect([...edgeSet].sort()).toMatchInlineSnapshot(`
      [
        "gateway -> audit-service",
        "gateway -> notification-service",
        "gateway -> user-service",
        "user-service -> audit-service",
        "user-service -> gateway",
        "user-service -> notification-service",
      ]
    `);

    expect(review.repos.find((r) => r.name === 'audit-service')?.technology).toBe('kafka-go');

    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { schemaVersion: string; elements: Array<{ name: string; technology?: string }> };
    expect(diagram.schemaVersion).toBe('1.0.0');
    expect(diagram.elements.find((e) => e.name === 'gateway')?.technology).toBe('Express');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('skips one missing + one corrupt artifact and still builds the diagram (FR-003)', async () => {
    await seedAnalyses(['user-service', 'gateway']);
    await writeFile(
      join(outputDir, 'audit-service.analysis.json'),
      '{ "schemaVersion": "1.0" }',
      'utf8'
    );
    // notification-service artifact left absent

    const errs: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
      errs.push(a.map(String).join(' '));
    });
    await runImport(config(), { verbose: false });
    spy.mockRestore();

    expect(errs.join('\n')).toMatch(/\[skip\] notification-service: no analysis artifact/);
    expect(errs.join('\n')).toMatch(/\[skip\] audit-service: invalid analysis artifact/);
    const diagram = JSON.parse(
      await readFile(join(outputDir, 'architecture.arch.json'), 'utf8')
    ) as { elements: Array<{ name: string }> };
    expect(diagram.elements.map((e) => e.name).sort()).toContain('user-service');
  });
});
