import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasValidCachedArtifact,
  readKnowledgeGraph,
  writeKnowledgeGraph,
  listAllKnowledgeGraphs,
} from '../../src/graph/knowledge-graph-store.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

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

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'arch-atlas-store-test-'));
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('hasValidCachedArtifact (US3/FR-011 skip-if-cached)', () => {
  it('returns false when no artifact exists', async () => {
    expect(await hasValidCachedArtifact(outputDir, 'nope')).toBe(false);
  });

  it('returns true after a valid artifact is written', async () => {
    await writeKnowledgeGraph(outputDir, makeGraph('service-a'));
    expect(await hasValidCachedArtifact(outputDir, 'service-a')).toBe(true);
  });

  it('returns false for a corrupt/invalid artifact rather than throwing', async () => {
    await writeFile(join(outputDir, 'broken.knowledge-graph.json'), '{ not valid json', 'utf8');
    expect(await hasValidCachedArtifact(outputDir, 'broken')).toBe(false);
  });

  it('returns false for a well-formed-JSON file that does not match the schema', async () => {
    await writeFile(
      join(outputDir, 'wrong-shape.knowledge-graph.json'),
      JSON.stringify({ foo: 'bar' }),
      'utf8'
    );
    expect(await hasValidCachedArtifact(outputDir, 'wrong-shape')).toBe(false);
  });
});

describe('writeKnowledgeGraph / readKnowledgeGraph', () => {
  it('round-trips a valid graph', async () => {
    const path = await writeKnowledgeGraph(outputDir, makeGraph('service-a'));
    expect(path).toContain('service-a.knowledge-graph.json');
    const read = await readKnowledgeGraph(outputDir, 'service-a');
    expect(read.repository.name).toBe('service-a');
  });

  it('creates the output directory if it does not exist yet', async () => {
    const nested = join(outputDir, 'nested', 'deeper');
    await writeKnowledgeGraph(nested, makeGraph('service-a'));
    expect(await hasValidCachedArtifact(nested, 'service-a')).toBe(true);
  });

  it('refuses to persist an invalid graph', async () => {
    const invalid = {
      ...makeGraph('bad'),
      nodes: 'not-an-array',
    } as unknown as RepositoryKnowledgeGraph;
    await expect(writeKnowledgeGraph(outputDir, invalid)).rejects.toThrow();
  });
});

describe('listAllKnowledgeGraphs (FR-012 --aggregate-only)', () => {
  it('returns an empty array for a nonexistent directory rather than throwing', async () => {
    expect(await listAllKnowledgeGraphs(join(outputDir, 'does-not-exist'))).toEqual([]);
  });

  it('lists every valid artifact and skips non-artifact / corrupt files', async () => {
    await writeKnowledgeGraph(outputDir, makeGraph('service-a'));
    await writeKnowledgeGraph(outputDir, makeGraph('service-b'));
    await writeFile(join(outputDir, 'README.md'), 'not a graph', 'utf8');
    await writeFile(join(outputDir, 'corrupt.knowledge-graph.json'), '{ bad', 'utf8');

    const graphs = await listAllKnowledgeGraphs(outputDir);
    expect(graphs.map((g) => g.repository.name).sort()).toEqual(['service-a', 'service-b']);
  });
});
