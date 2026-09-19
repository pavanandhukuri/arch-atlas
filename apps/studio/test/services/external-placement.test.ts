import { describe, it, expect } from 'vitest';
import type { Element, Relationship } from '@archatlas/core-model';
import {
  placeExternalElements,
  type BoundaryNode,
  type PlacedNode,
} from '@archatlas/viewer-components';

const ext = (id: string): Element => ({ id, kind: 'system', name: id, isExternal: true });
const rel = (source: string, target: string): Relationship => ({
  id: `${source}->${target}`,
  sourceId: source,
  targetId: target,
  type: 'calls',
});

// Boundary spans y = 100 .. 580 (midline 340) and x = 200 .. 600.
//   api  — upper half, left        db — lower half, right
//   mid  — upper half, middle      low — lower half, left
const boundary: BoundaryNode[] = [
  { elementId: 'api', x: 200, y: 100, w: 120, h: 80 },
  { elementId: 'mid', x: 340, y: 120, w: 120, h: 80 },
  { elementId: 'low', x: 200, y: 500, w: 120, h: 80 },
  { elementId: 'db', x: 480, y: 500, w: 120, h: 80 },
];
const MIN_Y = 100;
const MAX_BOTTOM = 580;
const PAD = 24; // the boundary rectangle is drawn this far outside its nodes

const one = (id: string, rels: Relationship[], b: BoundaryNode[] = boundary): PlacedNode => {
  const placed = placeExternalElements([ext(id)], rels, b)[0];
  if (!placed) throw new Error('not placed');
  return placed;
};
const centreX = (p: PlacedNode): number => p.x + p.w / 2;
const above = (p: PlacedNode): boolean => p.y + p.h <= MIN_Y - PAD;
const below = (p: PlacedNode): boolean => p.y >= MAX_BOTTOM + PAD;

const overlap = (p: PlacedNode, q: PlacedNode): boolean =>
  p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

describe('placeExternalElements — above or below, over the first caller', () => {
  it('puts an external connected to an upper-half element ABOVE the boundary', () => {
    expect(above(one('idp', [rel('api', 'idp')]))).toBe(true);
  });

  it('puts an external connected to a lower-half element BELOW the boundary', () => {
    expect(below(one('store', [rel('db', 'store')]))).toBe(true);
  });

  it('never overlaps the boundary rectangle, on either side', () => {
    for (const p of [one('a', [rel('api', 'a')]), one('b', [rel('db', 'b')])]) {
      expect(above(p) || below(p)).toBe(true);
    }
  });

  it('is centred horizontally over the element it connects to', () => {
    expect(centreX(one('idp', [rel('api', 'idp')]))).toBeCloseTo(200 + 60, 5);
    expect(centreX(one('store', [rel('db', 'store')]))).toBeCloseTo(480 + 60, 5);
  });

  it('direction does not matter — an external calling IN is placed the same as one called OUT to', () => {
    expect(one('u', [rel('u', 'api')])).toEqual({ ...one('u', [rel('api', 'u')]) });
  });

  it('anchors on the LEFT-most element when it connects to several (the flow starts there)', () => {
    const p = one('shared', [rel('mid', 'shared'), rel('api', 'shared')]);
    expect(centreX(p)).toBeCloseTo(200 + 60, 5); // api (x=200) is left of mid (x=340)
  });

  it('decides top/bottom by the average height of everything it connects to', () => {
    // api (centre 140) + low (centre 540) + db (centre 540): mean ≈ 407 > midline 340 → bottom
    expect(below(one('x', [rel('api', 'x'), rel('low', 'x'), rel('db', 'x')]))).toBe(true);
    // api + mid (both ≈ 140-160) + db (540): mean ≈ 280 < 340 → top
    expect(above(one('y', [rel('api', 'y'), rel('mid', 'y'), rel('db', 'y')]))).toBe(true);
  });

  it('an external with no relationship to anything visible goes on top, over the left edge', () => {
    const p = one('orphan', []);
    expect(above(p)).toBe(true);
    expect(p.x).toBe(200);
  });

  it('ignores relationships that only involve other externals or unknown elements', () => {
    const p = one('a', [rel('a', 'somebody-else'), rel('other-ext', 'a')]);
    expect(above(p)).toBe(true);
    expect(p.x).toBe(200);
  });

  it('spreads externals that share a first caller side by side, in one row, without overlap', () => {
    const placed = placeExternalElements(
      [ext('a'), ext('b'), ext('c')],
      [rel('api', 'a'), rel('api', 'b'), rel('api', 'c')],
      boundary
    );
    expect(new Set(placed.map((p) => p.y)).size).toBe(1); // same row
    placed.forEach((p, i) =>
      placed.slice(i + 1).forEach((q) => {
        expect(overlap(p, q), `${p.elementId} vs ${q.elementId}`).toBe(false);
      })
    );
  });

  it('uses BOTH rows when its externals belong to different halves of the boundary', () => {
    const [top, bottom] = placeExternalElements(
      [ext('idp'), ext('store')],
      [rel('api', 'idp'), rel('db', 'store')],
      boundary
    );
    expect(top && above(top)).toBe(true);
    expect(bottom && below(bottom)).toBe(true);
  });

  it('orders a row by anchor position, left to right', () => {
    const [right, left] = placeExternalElements(
      [ext('right'), ext('left')],
      [rel('mid', 'right'), rel('api', 'left')],
      boundary
    );
    expect(left && right && left.x < right.x).toBe(true);
  });

  it('returns one node per external, in the input order', () => {
    const out = placeExternalElements(
      [ext('b'), ext('a'), ext('c')],
      [rel('api', 'a'), rel('db', 'c')],
      boundary
    );
    expect(out.map((n) => n.elementId)).toEqual(['b', 'a', 'c']);
  });

  it('is deterministic', () => {
    const args = [
      [ext('a'), ext('b'), ext('c')],
      [rel('api', 'a'), rel('db', 'b'), rel('low', 'c')],
      boundary,
    ] as const;
    expect(placeExternalElements(...args)).toEqual(placeExternalElements(...args));
  });

  it('handles no externals and an empty boundary without throwing', () => {
    expect(placeExternalElements([], [], boundary)).toEqual([]);
    expect(placeExternalElements([ext('a')], [], [])).toHaveLength(1);
  });
});
