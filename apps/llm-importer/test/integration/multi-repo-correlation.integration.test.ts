import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { correlateDeterministically } from '../../src/correlate/deterministic-correlator.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

async function fixtureGraph(repoName: string, realPath = false): Promise<RepositoryKnowledgeGraph> {
  const raw = JSON.parse(
    await readFile(join(FIXTURES_DIR, 'analyses', `${repoName}.analysis.json`), 'utf8')
  ) as unknown;
  const analysis = RepoAnalysisSchema.parse(raw);
  if (realPath) analysis.repository.path = join(FIXTURES_DIR, 'repos', repoName);
  return toCorrelationGraph(analysis);
}

describe('multi-repo correlation over pre-canned analysis fixtures (no model)', () => {
  it('finds the user-service -> notification-service topic connection from graph text', async () => {
    const graphs = [await fixtureGraph('user-service'), await fixtureGraph('notification-service')];
    const { connections } = correlateDeterministically(graphs);
    expect(
      connections.some(
        (c) => c.sourceRepo === 'user-service' && c.targetRepo === 'notification-service'
      )
    ).toBe(true);
  });

  it('finds evidence-grounded connections when repo paths are real', async () => {
    const graphs = [
      await fixtureGraph('user-service', true),
      await fixtureGraph('notification-service', true),
    ];
    const { connections, passSummaries } = correlateDeterministically(graphs);

    const gatewayCall = connections.find(
      (c) =>
        c.foundBy === 'evidence' &&
        c.type === 'calls' &&
        c.sourceRepo === 'user-service' &&
        c.targetRepo === 'notification-service'
    );
    expect(gatewayCall).toBeDefined();
    expect(gatewayCall?.evidence[0]).toContain('/api/notifications/v1/send');
    expect(passSummaries.some((s) => s.startsWith('endpoint:'))).toBe(true);

    const again = correlateDeterministically(graphs);
    expect(JSON.stringify(again.connections)).toBe(JSON.stringify(connections));
  });
});
