import { describe, it, expect } from 'vitest';
import type { Element, Relationship } from '@archatlas/core-model';
import { placeExternalElements, type BoundaryNode } from '@archatlas/viewer-components';

const ext = (id: string): Element => ({ id, kind: 'system', name: id, isExternal: true });
const rel = (source: string, target: string): Relationship => ({
  id: `${source}->${target}`,
  sourceId: source,
  targetId: target,
  type: 'calls',
});
// two boundary nodes at x=200..320 and x=480..600, at different heights
const boundary: BoundaryNode[] = [
  { elementId: 'api', x: 200, y: 100, w: 120, h: 80 },
  { elementId: 'db', x: 480, y: 500, w: 120, h: 80 },
];
const one = (id: string, rels: Relationship[], b = boundary) => {
  const placed = placeExternalElements([ext(id)], rels, b)[0];
  if (!placed) throw new Error('not placed');
  return placed;
};

describe('placeExternalElements — externals follow the flow', () => {
  it('puts an external that CALLS INTO the boundary on its left', () => {
    const p = one('user', [rel('user', 'api')]);
    expect(p.x + p.w).toBeLessThanOrEqual(200); // entirely left of the boundary's leftmost node
  });

  it('puts an external the boundary CALLS OUT TO on its right', () => {
    const p = one('keycloak', [rel('api', 'keycloak')]);
    expect(p.x).toBeGreaterThanOrEqual(600); // right of the boundary's rightmost edge
  });

  it('an external that does both goes to whichever side has more relationships', () => {
    expect(one('x', [rel('x', 'api'), rel('x', 'db'), rel('api', 'x')]).x).toBeLessThan(200);
    expect(one('y', [rel('y', 'api'), rel('api', 'y'), rel('db', 'y')]).x).toBeGreaterThanOrEqual(
      600
    );
  });

  it('a tie goes left (callers on the left is the diagram-wide convention)', () => {
    expect(one('z', [rel('z', 'api'), rel('api', 'z')]).x).toBeLessThan(200);
  });

  it('sits level with the boundary element it connects to', () => {
    const p = one('user', [rel('user', 'api')]);
    // api's vertical centre = 100 + 40 = 140; external is 130 tall
    expect(p.y + p.h / 2).toBeCloseTo(140, 5);
    const q = one('store', [rel('db', 'store')]);
    expect(q.y + q.h / 2).toBeCloseTo(540, 5);
  });

  it('centres on the average height when connected to several boundary elements', () => {
    const p = one('user', [rel('user', 'api'), rel('user', 'db')]);
    expect(p.y + p.h / 2).toBeCloseTo((140 + 540) / 2, 5);
  });

  it('an external with no relationship to anything visible keeps the old default: left', () => {
    const p = one('orphan', []);
    expect(p.x + p.w).toBeLessThanOrEqual(200);
  });

  it('ignores relationships that only involve other externals or unknown elements', () => {
    const p = one('a', [rel('a', 'somebody-else'), rel('other-ext', 'a')]);
    expect(p.x + p.w).toBeLessThanOrEqual(200);
  });

  it('separates externals sharing a side so none overlap, even if they want the same height', () => {
    const placed = placeExternalElements(
      [ext('a'), ext('b'), ext('c')],
      [rel('a', 'api'), rel('b', 'api'), rel('c', 'api')],
      boundary
    );
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const [p, q] = [placed[i], placed[j]];
        if (!p || !q) throw new Error('missing');
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap, `${p.elementId} vs ${q.elementId}`).toBe(false);
      }
    }
    expect(new Set(placed.map((p) => p.x)).size).toBe(1); // one column
  });

  it('lets a left-side and right-side external share a height (different columns)', () => {
    const [caller, callee] = placeExternalElements(
      [ext('user'), ext('idp')],
      [rel('user', 'api'), rel('api', 'idp')],
      boundary
    );
    expect(caller?.y).toBeCloseTo(callee?.y ?? NaN, 5);
    expect((caller?.x ?? 0) < (callee?.x ?? 0)).toBe(true);
  });

  it('returns one node per external, in the input order', () => {
    const out = placeExternalElements(
      [ext('b'), ext('a'), ext('c')],
      [rel('a', 'api'), rel('api', 'c')],
      boundary
    );
    expect(out.map((n) => n.elementId)).toEqual(['b', 'a', 'c']);
  });

  it('is deterministic', () => {
    const args = [
      [ext('a'), ext('b'), ext('c')],
      [rel('a', 'api'), rel('api', 'b'), rel('c', 'db')],
      boundary,
    ] as const;
    expect(placeExternalElements(...args)).toEqual(placeExternalElements(...args));
  });

  it('handles no externals and an empty boundary without throwing', () => {
    expect(placeExternalElements([], [], boundary)).toEqual([]);
    expect(placeExternalElements([ext('a')], [], [])).toHaveLength(1);
  });
});
