import { describe, it, expect } from 'vitest';
import { filterToTrimmedSchema, GraphNodeSchema, GraphEdgeSchema } from '../../src/graph/schema.js';

describe('filterToTrimmedSchema', () => {
  it('keeps nodes/edges whose types are in the trimmed schema', () => {
    const rawNodes = [
      { id: 'file:src/a.ts', type: 'file', name: 'a.ts', summary: 'entry point' },
      { id: 'service:svc', type: 'service', name: 'svc', summary: 'the service' },
    ];
    const rawEdges = [
      { source: 'file:src/a.ts', target: 'service:svc', type: 'calls', weight: 0.9 },
    ];

    const result = filterToTrimmedSchema(rawNodes, rawEdges);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.droppedNodeCount).toBe(0);
    expect(result.droppedEdgeCount).toBe(0);
  });

  it('drops design/knowledge-base node types not in the trimmed schema (research.md D10)', () => {
    const rawNodes = [
      { id: 'file:a.ts', type: 'file', name: 'a.ts', summary: 'ok' },
      { id: 'page:home', type: 'page', name: 'Home', summary: 'a Figma page — should be dropped' },
      {
        id: 'token:color-1',
        type: 'token',
        name: 'primary',
        summary: 'a design token — should be dropped',
      },
      {
        id: 'article:notes',
        type: 'article',
        name: 'Notes',
        summary: 'a knowledge-base article — should be dropped',
      },
    ];

    const result = filterToTrimmedSchema(rawNodes, []);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe('file:a.ts');
    expect(result.droppedNodeCount).toBe(3);
  });

  it('drops semantic edge types not in the trimmed schema', () => {
    const rawNodes = [
      { id: 'a', type: 'file', name: 'a', summary: '' },
      { id: 'b', type: 'file', name: 'b', summary: '' },
    ];
    const rawEdges = [
      { source: 'a', target: 'b', type: 'calls', weight: 0.5 },
      { source: 'a', target: 'b', type: 'similar_to', weight: 0.3 }, // dropped: not in GRAPH_EDGE_TYPES
    ];
    const result = filterToTrimmedSchema(rawNodes, rawEdges);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.type).toBe('calls');
    expect(result.droppedEdgeCount).toBe(1);
  });

  it('drops dangling edges referencing a node id that was filtered out', () => {
    const rawNodes = [
      { id: 'file:a.ts', type: 'file', name: 'a.ts', summary: '' },
      { id: 'page:home', type: 'page', name: 'Home', summary: '' }, // dropped
    ];
    const rawEdges = [{ source: 'file:a.ts', target: 'page:home', type: 'calls', weight: 0.7 }];

    const result = filterToTrimmedSchema(rawNodes, rawEdges);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0); // target no longer exists after filtering
    expect(result.droppedEdgeCount).toBe(1);
  });

  it('drops structurally invalid entries without throwing', () => {
    const rawNodes = [{ id: 'ok', type: 'file', name: 'ok', summary: '' }, { notAValidNode: true }];
    const result = filterToTrimmedSchema(rawNodes, []);
    expect(result.nodes).toHaveLength(1);
    expect(result.droppedNodeCount).toBe(1);
  });
});

describe('GraphNodeSchema / GraphEdgeSchema', () => {
  it('requires weight to be within [0, 1]', () => {
    expect(
      GraphEdgeSchema.safeParse({ source: 'a', target: 'b', type: 'calls', weight: 1.5 }).success
    ).toBe(false);
    expect(
      GraphEdgeSchema.safeParse({ source: 'a', target: 'b', type: 'calls', weight: -0.1 }).success
    ).toBe(false);
    expect(
      GraphEdgeSchema.safeParse({ source: 'a', target: 'b', type: 'calls', weight: 0.5 }).success
    ).toBe(true);
  });

  it('requires a non-empty node name', () => {
    expect(
      GraphNodeSchema.safeParse({ id: 'a', type: 'file', name: '', summary: '' }).success
    ).toBe(false);
  });
});
