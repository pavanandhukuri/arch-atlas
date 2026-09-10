import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCorrelationGraph } from '../src/analysis/to-correlation-graph.js';
import { correlateDeterministically } from '../src/correlate/deterministic-correlator.js';
import { diffBaseline } from './baseline.js';
import { listGoldenSets, loadGoldenSet } from './load.js';
import { scoreConnections, scoreExternalSystems } from './score.js';
import { BaselineSchema } from './schema.js';
import type { CorrelationReport } from './types.js';

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

  it('is discoverable as a golden set', () => {
    expect(listGoldenSets()).toContain('fixtures');
  });

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

  it('still passes `eval -- --check` against the committed baseline.json', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const baseline = BaselineSchema.parse(
      JSON.parse(readFileSync(join(here, 'baseline.json'), 'utf8'))
    );
    const report: CorrelationReport = {
      set: 'fixtures',
      generatedAt: '',
      connections: scoreConnections(connections, groundTruth),
      externalSystems: scoreExternalSystems(connections, groundTruth.externalSystems, repoNames),
      expected: { connections: [], externalSystems: [] },
      predicted: { connections: [], externalSystems: [] },
    };
    const diff = diffBaseline([report], baseline);
    expect(diff.missing).toEqual([]);
    expect(diff.movements.filter((m) => m.regressed)).toEqual([]);
    expect(diff.ok).toBe(true);
  });
});
