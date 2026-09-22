import { describe, it, expect } from 'vitest';
import { assembleReviewFile } from '../../src/review/assemble-review.js';
import type { CrossRepositoryConnection } from '../../src/correlate/deterministic-correlator.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const graph = (name: string): RepositoryKnowledgeGraph => ({
  schemaVersion: '1.0',
  analyzedAt: '2026-01-01T00:00:00.000Z',
  repository: { name, path: `/${name}` },
  nodes: [],
  edges: [],
  analysisStatus: 'complete',
  retryCount: 0,
});

const conn = (
  target: string,
  type: CrossRepositoryConnection['type'],
  over: Partial<CrossRepositoryConnection> = {}
): CrossRepositoryConnection => ({
  sourceRepo: 'svc',
  sourceNodeId: 'module:svc',
  targetRepo: target,
  targetNodeId: `module:${target}`,
  type,
  foundBy: 'evidence',
  evidence: ['because'],
  weight: 0.9,
  ...over,
});

const typeOf = (c: CrossRepositoryConnection): string | undefined =>
  assembleReviewFile([graph('svc')], [c]).candidates[0]?.type;

describe('assembleReviewFile — candidate type', () => {
  it('maps the graph verb to the wizard bucket (calls→http, publishes→kafka, reads/writes→database)', () => {
    expect(typeOf(conn('other', 'calls'))).toBe('http');
    expect(typeOf(conn('Kafka', 'publishes'))).toBe('kafka');
    expect(typeOf(conn('PostgreSQL', 'writes_to'))).toBe('database');
    expect(typeOf(conn('PostgreSQL', 'reads_from'))).toBe('database');
  });

  it('a gRPC-tagged calls connection is a grpc candidate', () => {
    expect(typeOf(conn('other', 'calls', { transport: 'grpc' }))).toBe('grpc');
  });

  it('object stores are http, not database — S3 must not read as "SQL" in Studio', () => {
    expect(typeOf(conn('Amazon S3', 'reads_from'))).toBe('http');
    expect(typeOf(conn('Amazon S3', 'writes_to', { foundBy: 'external-outbound' }))).toBe('http');
    expect(typeOf(conn('Google Cloud Storage', 'writes_to'))).toBe('http');
    expect(typeOf(conn('MinIO', 'writes_to'))).toBe('http');
  });

  it('the object-store rule is case-insensitive on the target name', () => {
    expect(typeOf(conn('amazon s3', 'writes_to'))).toBe('http');
  });

  it('real databases stay database', () => {
    expect(typeOf(conn('MongoDB', 'writes_to'))).toBe('database');
    expect(typeOf(conn('Redis', 'reads_from'))).toBe('database');
  });
});

describe('assembleReviewFile — shape', () => {
  it('every candidate starts pending, ids are sequential, systems pass through', () => {
    const review = assembleReviewFile(
      [graph('svc')],
      [conn('a', 'calls'), conn('b', 'calls')],
      undefined,
      [{ name: 'Core', repositories: ['svc'] }]
    );
    expect(review.candidates.map((c) => [c.id, c.status])).toEqual([
      ['cand_1', 'pending'],
      ['cand_2', 'pending'],
    ]);
    expect(review.systems).toEqual([{ name: 'Core', repositories: ['svc'] }]);
    expect(review.source_repos).toEqual(['svc']);
  });

  it('falls back to a generic reasoning when a connection carries no evidence', () => {
    const c = conn('other', 'depends_on', { evidence: [] });
    expect(assembleReviewFile([graph('svc')], [c]).candidates[0]?.reasoning).toBe(
      'depends_on relationship detected'
    );
  });
});
