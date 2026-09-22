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
 * `bookshop` (examples/bookshop, the public demo workspace) is the eval's one
 * golden set: real polyglot code, not the disposable ad-hoc fixtures the
 * old harness carried before this. Local-only benchmark now — see
 * eval/README.md for why it doesn't gate CI.
 */
describe('correlation eval — bookshop golden set (the public demo workspace)', () => {
  const { config, groundTruth, analyses, workspaceDir } = loadGoldenSet('bookshop');
  const repoNames = config.repos.map((r) => r.name);
  const { connections } = correlateDeterministically(analyses.map(toCorrelationGraph));

  it('is discoverable as a golden set, loaded in place — its committed analyses, no copies', () => {
    expect(listGoldenSets()).toContain('bookshop');
    expect(workspaceDir).toMatch(/examples\/bookshop\/repos$/);
    expect(analyses.map((a) => a.repository.name).sort()).toEqual([...repoNames].sort());
    // the analyses record a placeholder path; the loader re-points each at the real source tree
    for (const a of analyses) expect(a.repository.path).toContain(`repos/${a.repository.name}`);
  });

  it('recovers every true connection with no false positives (precision 1.0, recall 1.0)', () => {
    const s = scoreConnections(connections, groundTruth);
    expect(s.recall).toBe(1);
    expect(s.fn).toBe(0);
    expect(s.fp).toBe(0);
    expect(s.precision).toBe(1);
    // The web app only ever calls the gateway — it must NOT also show as
    // calling the backends directly. This is the regression endpointPass's
    // mount-point-prefix tier (routeIsPrefixOfLiteral) exists to prevent: the
    // web app's literal "/api/books" both IS the gateway's own registered
    // route AND (via the coarser gateway-prefix-suffix heuristic) matches the
    // backend's own "/books" route.
    const edges = new Set(connections.map((c) => `${c.sourceRepo} -> ${c.targetRepo}`));
    expect(edges.has('bookshop-web -> catalog-service')).toBe(false);
    expect(edges.has('bookshop-web -> order-service')).toBe(false);
  });

  it('recovers all six external systems', () => {
    const s = scoreExternalSystems(connections, groundTruth.externalSystems, repoNames);
    expect(s.tp).toBe(6);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
  });

  it('SC-002: dropping the external-systems pass output loses the externals only IT ever finds', () => {
    // Kafka/Keycloak/PostgreSQL are also declared as docker-compose services in this
    // workspace, so the compose pass recovers those three independently — a realistic
    // mix, not every external having exactly one route to being found. Amazon S3,
    // SendGrid and Stripe are pure remote APIs with no compose entry: the
    // external-systems pass (reading the analysis's own outbound intents) is their
    // ONLY route in, so dropping it must specifically cost those three.
    const withoutExternalPass = connections.filter((c) => c.foundBy !== 'external-outbound');
    const s = scoreExternalSystems(withoutExternalPass, groundTruth.externalSystems, repoNames);
    expect(s.recall).toBeCloseTo(0.5, 5);
    expect(s.tp).toBe(3);
    const stillRecovered = new Set(withoutExternalPass.map((c) => c.targetRepo));
    expect(stillRecovered.has('Amazon S3')).toBe(false);
    expect(stillRecovered.has('Stripe')).toBe(false);
    expect(stillRecovered.has('SendGrid')).toBe(false);
  });

  it('finds the source-level evidence, not just the analysis intents (Kafka topic + gateway routes)', () => {
    const bySource = (source: string, target: string) =>
      connections.filter((c) => c.sourceRepo === source && c.targetRepo === target);
    expect(
      bySource('order-service', 'notification-service').some((c) => c.foundBy === 'evidence')
    ).toBe(true);
    expect(bySource('api-gateway', 'catalog-service').some((c) => c.foundBy === 'evidence')).toBe(
      true
    );
  });

  it('still matches the committed baseline.json (run `eval -- --update-baseline` after a deliberate change)', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const baseline = BaselineSchema.parse(
      JSON.parse(readFileSync(join(here, 'baseline.json'), 'utf8'))
    );
    const report: CorrelationReport = {
      set: 'bookshop',
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
