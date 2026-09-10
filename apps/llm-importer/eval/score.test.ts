import { describe, it, expect } from 'vitest';
import {
  normalizeRoute,
  tokenOverlap,
  nameMatch,
  prf,
  jaccard,
  meanPairwiseJaccard,
  scoreRepoRun,
  scoreConnections,
  scoreExternalSystems,
  averagePrf,
  stddev,
} from './score.js';
import type { RepoAnalysis } from '../src/analysis/repo-analysis.schema.js';
import type { CrossRepositoryConnection } from '../src/correlate/deterministic-correlator.js';
import type { WorkspaceGroundTruth } from './types.js';

describe('normalizeRoute', () => {
  it('collapses params and origins and trailing slashes', () => {
    expect(normalizeRoute('/v1/users/:id')).toBe('/v1/users/*');
    expect(normalizeRoute('/v1/users/{userId}/')).toBe('/v1/users/*');
    expect(normalizeRoute('https://api.example.com/v1/orders')).toBe('/v1/orders');
    expect(normalizeRoute('v1/send')).toBe('/v1/send');
  });
});

describe('fuzzy matchers', () => {
  it('tokenOverlap catches framework name variants', () => {
    expect(tokenOverlap('ASP.NET Core', 'ASP.NET')).toBe(true);
    expect(tokenOverlap('node-postgres', 'PostgreSQL')).toBe(false);
    expect(tokenOverlap('Spring Boot 3', 'spring')).toBe(true);
    expect(tokenOverlap('Gin', 'Express')).toBe(false);
  });
  it('nameMatch is substring/normalized', () => {
    expect(nameMatch('cart-service', 'cartservice')).toBe(true);
    expect(nameMatch('CartService', 'cartservice')).toBe(true);
    expect(nameMatch('frontend', 'checkoutservice')).toBe(false);
    // external systems are matched by canonical name — ground truth is authored
    // to the same spelling the external-systems pass emits ("Amazon S3", not "S3")
    expect(nameMatch('Amazon S3', 'amazon s3')).toBe(true);
    expect(nameMatch('Keycloak', 'keycloak')).toBe(true);
  });
});

describe('prf', () => {
  it('perfect match → all 1.0', () => {
    expect(prf(['a', 'b'], ['a', 'b'], nameMatch)).toMatchObject({
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });
  it('1 TP / 1 FP / 1 FN → precision, recall and f1 all 0.5', () => {
    const r = prf(['a', 'x'], ['a', 'b'], nameMatch);
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(1);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(0.5);
    expect(r.f1).toBe(0.5);
  });
  it('both empty → 1.0 (no divide-by-zero)', () => {
    expect(prf([], [], nameMatch)).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
  it('nothing predicted, things expected → recall 0, precision 0', () => {
    expect(prf([], ['a'], nameMatch)).toMatchObject({ recall: 0, precision: 0, f1: 0 });
  });
});

describe('jaccard / consistency', () => {
  it('set overlap', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(2 / 4);
    expect(jaccard([], [])).toBe(1);
  });
  it('meanPairwiseJaccard = 1 for identical runs, < 1 when they diverge, 1 for a single run', () => {
    expect(
      meanPairwiseJaccard([
        ['a', 'b'],
        ['a', 'b'],
      ])
    ).toBe(1);
    expect(meanPairwiseJaccard([['a', 'b'], ['a'], ['b']])).toBeLessThan(1);
    expect(meanPairwiseJaccard([['a']])).toBe(1);
  });
});

function analysis(overrides: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: 'now',
    repository: { name: 'cartservice', path: '/p' },
    description: 'x',
    languages: ['C#'],
    frameworks: ['ASP.NET Core', 'gRPC'],
    served: {
      httpRoutes: [],
      grpcServices: ['hipstershop.CartService'],
      topics: [],
      datastores: [{ name: 'redis', kind: 'keyvalue' }],
    },
    outbound: [{ target: 'redis', verb: 'writes_to', detail: 'stores cart' }],
    analysisStatus: 'complete',
    retryCount: 0,
    ...overrides,
  };
}

describe('scoreRepoRun', () => {
  it('scores a good analysis near 1 with lenient matching', () => {
    const s = scoreRepoRun(analysis(), {
      role: 'shopping cart storage',
      languages: ['C#'],
      frameworks: ['ASP.NET', 'gRPC'],
      served: { grpcServices: ['CartService'], datastores: ['Redis'] },
      outbound: ['redis'],
    });
    expect(s.frameworks?.f1).toBe(1);
    expect(s.grpcServices?.f1).toBe(1);
    expect(s.datastores?.f1).toBe(1);
    expect(s.languages?.f1).toBe(1);
  });

  it('penalises a hallucinated framework and a missed grpc service', () => {
    const s = scoreRepoRun(
      analysis({
        frameworks: ['ASP.NET Core', 'Kafka'],
        served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
      }),
      {
        role: 'cart',
        languages: ['C#'],
        frameworks: ['ASP.NET'],
        served: { grpcServices: ['CartService'] },
      }
    );
    expect(s.frameworks?.precision).toBe(0.5);
    expect(s.grpcServices?.recall).toBe(0);
  });
});

const conn = (
  from: string,
  to: string,
  over: Partial<CrossRepositoryConnection> = {}
): CrossRepositoryConnection => ({
  sourceRepo: from,
  sourceNodeId: 'x',
  targetRepo: to,
  targetNodeId: 'y',
  type: 'calls',
  foundBy: 'evidence',
  evidence: [],
  weight: 0.8,
  ...over,
});

describe('scoreConnections', () => {
  const gt: WorkspaceGroundTruth = {
    repos: {},
    externalSystems: [],
    connections: [
      { from: 'frontend', to: 'cartservice' },
      { from: 'frontend', to: 'checkoutservice' },
      { from: 'checkoutservice', to: 'cartservice' },
    ],
  };

  it('directed: right endpoints but reversed direction does NOT match', () => {
    const r = scoreConnections([conn('cartservice', 'frontend')], gt);
    expect(r.tp).toBe(0);
    expect(r.recall).toBe(0);
  });
  it('directed precision/recall', () => {
    const r = scoreConnections([conn('frontend', 'cartservice'), conn('frontend', 'x')], gt);
    expect(r.recall).toBeCloseTo(1 / 3);
    expect(r.precision).toBe(0.5);
  });
  it('undirected mode ignores direction', () => {
    const r = scoreConnections([conn('cartservice', 'frontend')], gt, { directed: false });
    expect(r.recall).toBeCloseTo(1 / 3);
    expect(r.precision).toBe(1);
  });
});

describe('scoreExternalSystems', () => {
  const repos = ['sdk-go', 'sdk-kmp', 'notification-service'];

  it('scores recall of expected externals against non-repo connection targets', () => {
    const conns = [
      conn('sdk-go', 'notification-service'), // a workspace repo — ignored
      conn('sdk-go', 'Keycloak', { foundBy: 'external-outbound' }),
      conn('sdk-go', 'Amazon S3', { foundBy: 'external-outbound' }),
    ];
    const r = scoreExternalSystems(conns, ['Keycloak', 'Amazon S3', 'AWS KMS'], repos);
    expect(r.tp).toBe(2);
    expect(r.fn).toBe(1); // AWS KMS not recovered
    expect(r.recall).toBeCloseTo(2 / 3);
    expect(r.precision).toBe(1);
  });

  it('dedupes the same external named by several repos', () => {
    const conns = [
      conn('sdk-go', 'Keycloak', { foundBy: 'external-outbound' }),
      conn('sdk-kmp', 'Keycloak', { foundBy: 'external-outbound' }),
    ];
    const r = scoreExternalSystems(conns, ['Keycloak'], repos);
    expect(r.tp).toBe(1);
    expect(r.recall).toBe(1);
  });

  it('an external the correlation invented but ground truth omits is a false positive', () => {
    const conns = [conn('sdk-go', 'Stripe', { foundBy: 'external-outbound' })];
    const r = scoreExternalSystems(conns, ['Keycloak'], repos);
    expect(r.fp).toBe(1);
    expect(r.recall).toBe(0);
    expect(r.precision).toBe(0);
  });

  it('no externals expected and none produced → 1.0', () => {
    const r = scoreExternalSystems([conn('sdk-go', 'notification-service')], [], repos);
    expect(r).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
});

describe('aggregation', () => {
  it('averagePrf and stddev', () => {
    const avg = averagePrf([
      { tp: 1, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 },
      { tp: 0, fp: 1, fn: 1, precision: 0, recall: 0, f1: 0 },
    ]);
    expect(avg.f1).toBe(0.5);
    expect(stddev([1, 0])).toBeCloseTo(0.5);
    expect(stddev([1])).toBe(0);
  });
});
