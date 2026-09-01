import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { correlateDeterministically } from '../../src/correlate/deterministic-correlator.js';
import { assembleReviewFile } from '../../src/review/assemble-review.js';
import { buildDiagram } from '../../src/export/diagram-builder.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

async function fixtureGraph(repoName: string): Promise<RepositoryKnowledgeGraph> {
  const raw = JSON.parse(
    await readFile(join(FIXTURES_DIR, 'analyses', `${repoName}.analysis.json`), 'utf8')
  ) as unknown;
  const analysis = RepoAnalysisSchema.parse(raw);
  // Point at the real fixture tree so the evidence walk runs (grpc client refs).
  analysis.repository.path = join(FIXTURES_DIR, 'repos', repoName);
  return toCorrelationGraph(analysis);
}

describe('gRPC cross-repo correlation over the storefront / catalog-service fixture pair', () => {
  it('draws exactly the directed storefront -> catalog-service gRPC calls connection', async () => {
    const graphs = [await fixtureGraph('storefront'), await fixtureGraph('catalog-service')];
    const { connections, passSummaries } = correlateDeterministically(graphs);

    const grpc = connections.filter((c) => c.transport === 'grpc');
    expect(grpc).toHaveLength(1);
    expect(grpc[0]).toMatchObject({
      sourceRepo: 'storefront',
      targetRepo: 'catalog-service',
      type: 'calls',
      foundBy: 'evidence',
    });
    expect(grpc[0]?.evidence[0]).toContain('internal/catalog/client.go');
    expect(grpc[0]?.evidence[0]).toContain('CatalogService');

    // No reverse-direction connection from this evidence.
    expect(
      connections.some((c) => c.sourceRepo === 'catalog-service' && c.targetRepo === 'storefront')
    ).toBe(false);

    // FR-015: the pass reports a progress line.
    expect(passSummaries.some((s) => s.startsWith('grpc: 1 connection'))).toBe(true);

    // Determinism.
    const again = correlateDeterministically(graphs);
    expect(JSON.stringify(again.connections)).toBe(JSON.stringify(connections));
  });

  it('surfaces the connection as a grpc candidate and a calls relationship (US3)', async () => {
    const graphs = [await fixtureGraph('storefront'), await fixtureGraph('catalog-service')];
    const { connections } = correlateDeterministically(graphs);

    const review = assembleReviewFile(graphs, connections);
    const cand = review.candidates.find(
      (c) => c.source === 'storefront' && c.target === 'catalog-service'
    );
    expect(cand?.type).toBe('grpc');

    // Accept it and build the diagram — grpc maps to a `calls` relationship.
    review.candidates = review.candidates.map((c) => ({ ...c, status: 'accepted' as const }));
    const model = buildDiagram(review, 'gRPC fixture');
    const rel = model.relationships.find(
      (r) => r.sourceId === 'storefront' && r.targetId === 'catalog-service'
    );
    expect(rel?.type).toBe('calls');
  });
});
