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
  averagePrf,
  stddev,
} from './score.js';
import type { RepoAnalysis } from '@arch-atlas/llm-importer';
import type { CrossRepositoryConnection } from '@arch-atlas/llm-importer';
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
    expect(tokenOverlap('node-postgres', 'PostgreSQL')).toBe(false); // no shared token
    expect(tokenOverlap('Spring Boot 3', 'spring')).toBe(true);
    expect(tokenOverlap('Gin', 'Express')).toBe(false);
  });
  it('nameMatch is substring/normalized', () => {
    expect(nameMatch('cart-service', 'cartservice')).toBe(true);
    expect(nameMatch('CartService', 'cartservice')).toBe(true);
    expect(nameMatch('frontend', 'checkoutservice')).toBe(false);
  });
});

describe('prf', () => {
  it('perfect match', () => {
    const r = prf(['a', 'b'], ['a', 'b'], nameMatch);
    expect(r).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
  it('partial recall, one false positive', () => {
    const r = prf(['a', 'x'], ['a', 'b'], nameMatch);
    expect(r.recall).toBe(0.5);
    expect(r.precision).toBe(0.5);
  });
  it('both empty scores 1', () => {
    expect(prf([], [], nameMatch)).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });
  it('nothing predicted but things expected → recall 0', () => {
    expect(prf([], ['a'], nameMatch)).toMatchObject({ recall: 0, precision: 0 });
  });
});

describe('jaccard / consistency', () => {
  it('jaccard of set overlap', () => {
    expect(jaccard(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(2 / 4);
    expect(jaccard([], [])).toBe(1);
  });
  it('meanPairwiseJaccard = 1 for identical runs, < 1 when they diverge', () => {
    expect(
      meanPairwiseJaccard([
        ['a', 'b'],
        ['a', 'b'],
        ['a', 'b'],
      ])
    ).toBe(1);
    expect(meanPairwiseJaccard([['a', 'b'], ['a'], ['b']])).toBeLessThan(1);
    expect(meanPairwiseJaccard([['a']])).toBe(1); // single run
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
        frameworks: ['ASP.NET Core', 'Kafka'], // Kafka is not real here
        served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
      }),
      {
        role: 'cart',
        languages: ['C#'],
        frameworks: ['ASP.NET'],
        served: { grpcServices: ['CartService'] },
      }
    );
    expect(s.frameworks?.precision).toBe(0.5); // 1 of 2 predicted is right
    expect(s.grpcServices?.recall).toBe(0); // missed it entirely
  });
});

describe('scoreConnections', () => {
  const gt: WorkspaceGroundTruth = {
    repos: {},
    connections: [
      { from: 'frontend', to: 'cartservice' },
      { from: 'frontend', to: 'checkoutservice' },
      { from: 'checkoutservice', to: 'cartservice' },
    ],
  };
  const conn = (from: string, to: string): CrossRepositoryConnection => ({
    sourceRepo: from,
    sourceNodeId: 'x',
    targetRepo: to,
    targetNodeId: 'y',
    type: 'calls',
    foundBy: 'evidence',
    evidence: [],
    weight: 0.8,
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
