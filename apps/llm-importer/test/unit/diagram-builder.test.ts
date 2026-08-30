import { describe, it, expect } from 'vitest';
import { buildDiagram } from '../../src/export/diagram-builder.js';
import type { ReviewFile } from '../../src/review/review-file.js';

function makeReview(overrides: Partial<ReviewFile>): ReviewFile {
  return {
    version: '1.0',
    generated_at: '2026-01-01T00:00:00Z',
    source_repos: ['service-a', 'service-b'],
    systems: [],
    candidates: [],
    ...overrides,
  };
}

describe('buildDiagram', () => {
  it('creates one element per source repo even with no accepted candidates', () => {
    const diagram = buildDiagram(makeReview({}));
    expect(diagram.elements).toHaveLength(2);
    expect(diagram.elements.map((e) => e.name).sort()).toEqual(['service-a', 'service-b']);
    expect(diagram.relationships).toHaveLength(0);
  });

  it('only includes relationships for accepted candidates, not pending/rejected ones', () => {
    const review = makeReview({
      candidates: [
        {
          id: 'cand_1',
          source: 'service-a',
          target: 'service-b',
          type: 'http',
          reasoning: 'calls',
          confidence: 'high',
          status: 'accepted',
          override_name: null,
          override_type: null,
        },
        {
          id: 'cand_2',
          source: 'service-a',
          target: 'service-b',
          type: 'database',
          reasoning: 'unverified guess',
          confidence: 'low',
          status: 'pending',
          override_name: null,
          override_type: null,
        },
      ],
    });

    const diagram = buildDiagram(review);
    expect(diagram.relationships).toHaveLength(1);
    expect(diagram.relationships[0]).toMatchObject({
      type: 'calls',
      sourceId: 'service-a',
      targetId: 'service-b',
    });
  });

  it('produces a valid schemaVersion, metadata, and a single system-level view', () => {
    const diagram = buildDiagram(makeReview({}), 'My Architecture');
    expect(diagram.schemaVersion).toBe('1.0.0');
    expect(diagram.metadata.title).toBe('My Architecture');
    expect(diagram.views).toHaveLength(1);
    expect(diagram.views[0]?.layout.nodes.length).toBeGreaterThan(0);
  });

  it('deduplicates relationships with the same source/target/type, keeping only one', () => {
    const dupeCandidate = {
      id: 'cand_1',
      source: 'service-a',
      target: 'service-b',
      type: 'http' as const,
      reasoning: 'calls',
      confidence: 'high' as const,
      status: 'accepted' as const,
      override_name: null,
      override_type: null,
    };
    const review = makeReview({ candidates: [dupeCandidate, { ...dupeCandidate, id: 'cand_2' }] });
    const diagram = buildDiagram(review);
    expect(diagram.relationships).toHaveLength(1);
  });

  it('honors override_name and override_type on a candidate', () => {
    const review = makeReview({
      source_repos: ['service-a', 'service-b'],
      candidates: [
        {
          id: 'cand_1',
          source: 'service-a',
          target: 'service-b',
          type: 'http',
          reasoning: 'calls',
          confidence: 'high',
          status: 'accepted',
          override_name: 'renamed-service-a',
          override_type: 'custom-relationship-type',
        },
      ],
    });
    const diagram = buildDiagram(review);
    expect(diagram.relationships[0]?.type).toBe('custom-relationship-type');
    // override_name changes which element id the relationship's source
    // resolves to, not the source repo element list itself.
    expect(diagram.relationships[0]?.sourceId).toBe('renamed-service-a');
  });

  it('slug() falls back to "elem" for a name with no alphanumeric characters', () => {
    const diagram = buildDiagram(makeReview({ source_repos: ['!!!'] }));
    expect(diagram.elements.map((e) => e.id)).toContain('elem');
  });

  it('reuses an existing element (from source_repos) rather than creating a duplicate for a candidate referencing it', () => {
    const review = makeReview({
      source_repos: ['service-a', 'service-b'],
      candidates: [
        {
          id: 'cand_1',
          source: 'service-a',
          target: 'service-b',
          type: 'grpc',
          reasoning: 'calls',
          confidence: 'medium',
          status: 'accepted',
          override_name: null,
          override_type: null,
        },
      ],
    });
    const diagram = buildDiagram(review);
    // Exactly 2 elements — the candidate's source/target reused the
    // already-created source_repos elements, not fresh duplicates.
    expect(diagram.elements).toHaveLength(2);
    expect(diagram.relationships[0]?.type).toBe('calls'); // grpc -> calls
  });

  it('carries description + technology from the repo-meta map onto source-repo containers (US3)', () => {
    const meta = new Map([
      [
        'service-a',
        { name: 'service-a', description: 'the accounts service', technology: 'NestJS' },
      ],
    ]);
    const diagram = buildDiagram(
      makeReview({ source_repos: ['service-a', 'service-b'] }),
      'T',
      meta
    );
    const a = diagram.elements.find((e) => e.name === 'service-a');
    const b = diagram.elements.find((e) => e.name === 'service-b');
    expect(a?.description).toBe('the accounts service');
    expect(a?.technology).toBe('NestJS');
    // service-b had no meta entry — still a valid element, just no extra fields.
    expect(b?.description).toBeUndefined();
    expect(b?.technology).toBeUndefined();
  });

  it('falls back to review.repos when no meta map is passed (aggregate-only path)', () => {
    const review = makeReview({
      source_repos: ['service-a'],
      repos: [{ name: 'service-a', description: 'from the review file', technology: 'Go' }],
    });
    const diagram = buildDiagram(review);
    const a = diagram.elements.find((e) => e.name === 'service-a');
    expect(a?.description).toBe('from the review file');
    expect(a?.technology).toBe('Go');
  });

  it('does not enrich elements introduced only as candidate targets (external systems)', () => {
    const meta = new Map([
      ['ext-system', { name: 'ext-system', description: 'should not leak', technology: 'X' }],
    ]);
    const review = makeReview({
      source_repos: ['service-a'],
      candidates: [
        {
          id: 'cand_1',
          source: 'service-a',
          target: 'ext-system',
          type: 'http',
          reasoning: 'calls',
          confidence: 'high',
          status: 'accepted',
          override_name: null,
          override_type: null,
        },
      ],
    });
    const diagram = buildDiagram(review, 'T', meta);
    const ext = diagram.elements.find((e) => e.name === 'ext-system');
    expect(ext?.description).toBeUndefined();
    expect(ext?.technology).toBeUndefined();
  });

  it('does not emit a self-loop relationship', () => {
    const review = makeReview({
      source_repos: ['service-a'],
      candidates: [
        {
          id: 'cand_1',
          source: 'service-a',
          target: 'service-a',
          type: 'http',
          reasoning: 'self reference, should be skipped',
          confidence: 'low',
          status: 'accepted',
          override_name: null,
          override_type: null,
        },
      ],
    });
    const diagram = buildDiagram(review);
    expect(diagram.relationships).toHaveLength(0);
  });
});
