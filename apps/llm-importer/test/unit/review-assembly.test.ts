import { describe, it, expect } from 'vitest';
import { assembleReviewFile } from '../../src/review/assemble-review.js';
import type { CrossRepositoryConnection } from '../../src/correlate/deterministic-correlator.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

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

describe('assembleReviewFile', () => {
  it('produces one candidate per connection with the mapped type and confidence', () => {
    const connection: CrossRepositoryConnection = {
      sourceRepo: 'a',
      sourceNodeId: 'x',
      targetRepo: 'b',
      targetNodeId: 'y',
      type: 'publishes',
      foundBy: 'deterministic',
      evidence: ['matched literal topic name'],
      weight: 0.6,
    };

    const review = assembleReviewFile([makeGraph('a'), makeGraph('b')], [connection]);

    expect(review.version).toBe('1.0');
    expect(review.source_repos).toEqual(['a', 'b']);
    expect(review.systems).toEqual([]); // human-assigned in Studio, never auto-guessed
    expect(review.candidates).toHaveLength(1);
    expect(review.candidates[0]).toMatchObject({
      id: 'cand_1',
      source: 'a',
      target: 'b',
      type: 'kafka', // publishes -> kafka
      confidence: 'high', // 0.6 -> medium base, bumped for deterministic corroboration
      status: 'pending',
      override_name: null,
      override_type: null,
    });
  });

  it('maps a transport:"grpc" calls connection to a grpc candidate, others to http (009)', () => {
    const grpcConn: CrossRepositoryConnection = {
      sourceRepo: 'storefront',
      sourceNodeId: 'x',
      targetRepo: 'catalog-service',
      targetNodeId: 'y',
      type: 'calls',
      foundBy: 'evidence',
      transport: 'grpc',
      evidence: ['storefront/client.go:21 constructs a go gRPC client for "CatalogService"'],
      weight: 0.8,
    };
    const httpConn: CrossRepositoryConnection = {
      sourceRepo: 'gateway',
      sourceNodeId: 'x',
      targetRepo: 'catalog-service',
      targetNodeId: 'y',
      type: 'calls',
      foundBy: 'evidence',
      evidence: ['gateway calls /v1/items'],
      weight: 0.8,
    };
    const review = assembleReviewFile(
      [makeGraph('storefront'), makeGraph('catalog-service'), makeGraph('gateway')],
      [grpcConn, httpConn]
    );
    expect(review.candidates[0]).toMatchObject({ source: 'storefront', type: 'grpc' });
    expect(review.candidates[1]).toMatchObject({ source: 'gateway', type: 'http' });
    // Reasoning + confidence bucket unaffected by the transport tag.
    expect(review.candidates[0]?.reasoning).toContain('CatalogService');
    expect(review.candidates[0]?.confidence).toBe(review.candidates[1]?.confidence);
  });

  it('maps agentic-fallback connections to low confidence (research.md D14.4)', () => {
    const connection: CrossRepositoryConnection = {
      sourceRepo: 'a',
      sourceNodeId: 'x',
      targetRepo: 'b',
      targetNodeId: 'y',
      type: 'calls',
      foundBy: 'agentic-fallback',
      evidence: ['inferred from naming'],
      weight: 0.95,
    };
    const review = assembleReviewFile([makeGraph('a'), makeGraph('b')], [connection]);
    expect(review.candidates[0]?.confidence).toBe('low'); // unverified guess, not medium/high
    expect(review.candidates[0]?.type).toBe('http'); // calls -> http
  });

  it('produces an empty candidates list when there are no connections', () => {
    const review = assembleReviewFile([makeGraph('a')], []);
    expect(review.candidates).toEqual([]);
    expect(review.source_repos).toEqual(['a']);
  });

  it('populates a `repos` block from the repo-meta map, one entry per source repo (US3)', () => {
    const meta = new Map([
      ['a', { name: 'a', description: 'service a', technology: 'TypeScript' }],
      // 'b' deliberately absent from the map
    ]);
    const review = assembleReviewFile([makeGraph('a'), makeGraph('b')], [], meta);
    expect(review.repos).toEqual([
      { name: 'a', description: 'service a', technology: 'TypeScript' },
      { name: 'b' },
    ]);
  });

  it('omits per-repo detail (but keeps names) when no meta map is given', () => {
    const review = assembleReviewFile([makeGraph('a')], []);
    expect(review.repos).toEqual([{ name: 'a' }]);
  });

  it('the produced file still satisfies Studio parseReviewYaml required-field checks (FR-016, non-breaking)', () => {
    const meta = new Map([['a', { name: 'a', description: 'x', technology: 'Go' }]]);
    const review = assembleReviewFile([makeGraph('a'), makeGraph('b')], [], meta);
    // Local port of the checks in apps/studio/src/lib/import/parse-review.ts —
    // it reads only these keys and ignores everything else (e.g. `repos`).
    const obj = JSON.parse(JSON.stringify(review)) as Record<string, unknown>;
    expect(typeof obj['version']).toBe('string');
    expect(typeof obj['generated_at']).toBe('string');
    expect(Array.isArray(obj['source_repos'])).toBe(true);
    expect(Array.isArray(obj['candidates'])).toBe(true);
    expect(Array.isArray(obj['systems'])).toBe(true);
    // The added key is present but is not one Studio's parser validates.
    expect(Array.isArray(obj['repos'])).toBe(true);
  });
});
