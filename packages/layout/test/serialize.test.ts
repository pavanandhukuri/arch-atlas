import { describe, it, expect } from 'vitest';
import { serializeLayoutState, deserializeLayoutState, cloneLayoutState } from '../src/serialize';
import type { LayoutState } from '@arch-atlas/core-model';

const sampleLayout: LayoutState = {
  algorithm: 'deterministic-v1',
  nodes: [{ elementId: 'elem-1', x: 10, y: 20, w: 100, h: 50 }],
  edges: [{ relationshipId: 'rel-1' }],
};

describe('serializeLayoutState', () => {
  it('serializes layout to a JSON string', () => {
    const result = serializeLayoutState(sampleLayout);
    expect(typeof result).toBe('string');
    expect(JSON.parse(result)).toEqual(sampleLayout);
  });

  it('produces pretty-printed JSON', () => {
    const result = serializeLayoutState(sampleLayout);
    expect(result).toContain('\n');
  });
});

describe('deserializeLayoutState', () => {
  it('round-trips through serialize/deserialize', () => {
    const json = serializeLayoutState(sampleLayout);
    const result = deserializeLayoutState(json);
    expect(result).toEqual(sampleLayout);
  });
});

describe('cloneLayoutState', () => {
  it('returns a deep copy, not the same reference', () => {
    const clone = cloneLayoutState(sampleLayout);
    expect(clone).toEqual(sampleLayout);
    expect(clone).not.toBe(sampleLayout);
    expect(clone.nodes).not.toBe(sampleLayout.nodes);
  });

  it('mutations to the clone do not affect the original', () => {
    const clone = cloneLayoutState(sampleLayout);
    clone.nodes[0]!.x = 999;
    expect(sampleLayout.nodes[0]!.x).toBe(10);
  });
});
