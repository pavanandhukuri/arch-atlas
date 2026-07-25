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

  it('maps agentic-fallback connections to a capped confidence', () => {
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
    expect(review.candidates[0]?.confidence).toBe('medium'); // capped, not high
    expect(review.candidates[0]?.type).toBe('http'); // calls -> http
  });

  it('produces an empty candidates list when there are no connections', () => {
    const review = assembleReviewFile([makeGraph('a')], []);
    expect(review.candidates).toEqual([]);
    expect(review.source_repos).toEqual(['a']);
  });
});
