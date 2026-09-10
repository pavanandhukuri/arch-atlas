import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCorrelationGraph } from '../src/analysis/to-correlation-graph.js';
import { correlateDeterministically } from '../src/correlate/deterministic-correlator.js';
import { loadGoldenSet } from './load.js';
import { scoreConnections, scoreExternalSystems } from './score.js';
import { BaselineSchema } from './schema.js';

/**
 * The `fixtures` golden set is the CI gate. This runs the real correlation
 * pipeline over its committed analyses and pins the scores — so a change to a
 * correlation pass that moves the numbers fails here (and in `eval -- --check`)
 * rather than silently.
 */
describe('correlation eval — fixtures golden set', () => {
  const { config, groundTruth, analyses } = loadGoldenSet('fixtures');
  const repoNames = config.repos.map((r) => r.name);
  const graphs = analyses.map(toCorrelationGraph);
  const { connections } = correlateDeterministically(graphs);

  it('recovers every true cross-repo connection (recall 1.0) with one known name-mention FP', () => {
    const s = scoreConnections(connections, groundTruth);
    expect(s.recall).toBe(1);
    expect(s.fn).toBe(0);
    // user-service -> gateway: the name-mention pass matches "through the API
    // gateway" in user-service's outbound detail. Known imprecision, pinned.
    expect(s.fp).toBe(1);
    expect(s.precision).toBeCloseTo(7 / 8, 5);
  });

  it('recovers both external systems (Amazon S3, Keycloak) at recall 1.0, precision 1.0', () => {
    const s = scoreExternalSystems(connections, groundTruth.externalSystems, repoNames);
    expect(s.tp).toBe(2);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
  });

  it('SC-002: dropping the external-systems pass output collapses external recall to 0', () => {
    const withoutExternalPass = connections.filter((c) => c.foundBy !== 'external-outbound');
    const s = scoreExternalSystems(withoutExternalPass, groundTruth.externalSystems, repoNames);
    expect(s.recall).toBe(0);
    expect(s.tp).toBe(0);
  });

  it('matches the committed baseline.json', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const baseline = BaselineSchema.parse(
      JSON.parse(readFileSync(join(here, 'baseline.json'), 'utf8'))
    );
    const conn = scoreConnections(connections, groundTruth);
    const ext = scoreExternalSystems(connections, groundTruth.externalSystems, repoNames);
    const b = baseline['fixtures'];
    if (!b) throw new Error('baseline.json has no "fixtures" entry');
    expect(conn.precision).toBeCloseTo(b.connections.precision, 3);
    expect(conn.recall).toBeCloseTo(b.connections.recall, 3);
    expect(ext.recall).toBeCloseTo(b.externalSystems.recall, 3);
    expect(ext.f1).toBeCloseTo(b.externalSystems.f1, 3);
  });
});
