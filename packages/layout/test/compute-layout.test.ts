import { describe, it, expect, beforeEach } from 'vitest';
import { computeLayout, type LayoutOptions } from '../src/compute-layout';
import type {
  ArchitectureModel,
  Element,
  LayoutState,
  Relationship,
  View,
} from '@archatlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Layout computation determinism', () => {
  let model: ArchitectureModel;
  let view: View;

  beforeEach(() => {
    model = minimalModel as ArchitectureModel;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    view = model.views[0]!;
  });

  it('should produce identical layout for identical inputs', () => {
    const layout1 = computeLayout(model, view, { algorithm: 'deterministic-v1' });
    const layout2 = computeLayout(model, view, { algorithm: 'deterministic-v1' });

    expect(layout1.nodes).toEqual(layout2.nodes);
    expect(layout1.edges).toEqual(layout2.edges);
    expect(layout1.algorithm).toBe(layout2.algorithm);
  });

  it('should compute valid node positions', () => {
    const layout = computeLayout(model, view, { algorithm: 'deterministic-v1' });

    expect(layout.nodes.length).toBeGreaterThan(0);
    layout.nodes.forEach((node) => {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.elementId).toBeTruthy();
    });
  });

  it('should respect provided layout options', () => {
    const options: LayoutOptions = {
      algorithm: 'deterministic-v1',
      spacing: 100,
    };

    const layout = computeLayout(model, view, options);
    expect(layout.algorithm).toBe('deterministic-v1');
  });
});

// ── relationship-aware layered layout ────────────────────────────────────────

const el = (id: string, over: Partial<Element> = {}): Element => ({
  id,
  kind: 'container',
  name: id,
  ...over,
});
const rel = (source: string, target: string, id = `${source}->${target}`): Relationship => ({
  id,
  sourceId: source,
  targetId: target,
  type: 'calls',
});
const modelOf = (elements: Element[], relationships: Relationship[] = []): ArchitectureModel => ({
  schemaVersion: '1.0.0',
  metadata: { title: 't' },
  elements,
  relationships,
  constraints: [],
  views: [],
});
const EMPTY_VIEW: View = {
  id: 'v',
  level: 'system',
  title: 'v',
  layout: { algorithm: 'x', nodes: [], edges: [] },
};
const OPTS: LayoutOptions = { algorithm: 'deterministic-v1', spacing: 200, padding: 80 };
const layoutOf = (m: ArchitectureModel) => computeLayout(m, EMPTY_VIEW, OPTS);
const pos = (m: ArchitectureModel, id: string) => {
  const n = layoutOf(m).nodes.find((x) => x.elementId === id);
  if (!n) throw new Error(`no node for ${id}`);
  return n;
};

function overlaps(a: { x: number; y: number; w?: number; h?: number }, b: typeof a): boolean {
  return (
    a.x < b.x + (b.w ?? 0) &&
    b.x < a.x + (a.w ?? 0) &&
    a.y < b.y + (b.h ?? 0) &&
    b.y < a.y + (a.h ?? 0)
  );
}

function expectNoOverlaps(nodes: LayoutState['nodes']): void {
  nodes.forEach((a, i) => {
    nodes.slice(i + 1).forEach((b) => {
      expect(overlaps(a, b), `${a.elementId} vs ${b.elementId}`).toBe(false);
    });
  });
}

describe('relationship-aware layout', () => {
  it('places a caller to the left of what it calls, along a chain', () => {
    const m = modelOf([el('a'), el('b'), el('c')], [rel('a', 'b'), rel('b', 'c')]);
    expect(pos(m, 'a').x).toBeLessThan(pos(m, 'b').x);
    expect(pos(m, 'b').x).toBeLessThan(pos(m, 'c').x);
  });

  it('is independent of declaration order (a callee declared first is still on the right)', () => {
    const m = modelOf([el('db'), el('svc'), el('gw')], [rel('gw', 'svc'), rel('svc', 'db')]);
    expect(pos(m, 'gw').x).toBeLessThan(pos(m, 'svc').x);
    expect(pos(m, 'svc').x).toBeLessThan(pos(m, 'db').x);
  });

  it('puts a fan-out in one shared column, one row each', () => {
    const m = modelOf(
      [el('gw'), el('a'), el('b'), el('c')],
      [rel('gw', 'a'), rel('gw', 'b'), rel('gw', 'c')]
    );
    const xs = ['a', 'b', 'c'].map((id) => pos(m, id).x);
    expect(new Set(xs).size).toBe(1);
    expect(xs[0]).toBeGreaterThan(pos(m, 'gw').x);
    expect(new Set(['a', 'b', 'c'].map((id) => pos(m, id).y)).size).toBe(3);
  });

  it('a node reached by two paths sits right of BOTH callers (longest path)', () => {
    const m = modelOf([el('a'), el('b'), el('c')], [rel('a', 'b'), rel('b', 'c'), rel('a', 'c')]);
    expect(pos(m, 'c').x).toBeGreaterThan(pos(m, 'b').x);
  });

  it('terminates on a cycle and still gives every node its own slot', () => {
    const m = modelOf([el('a'), el('b'), el('c')], [rel('a', 'b'), rel('b', 'c'), rel('c', 'a')]);
    const nodes = layoutOf(m).nodes;
    expect(nodes).toHaveLength(3);
    expectNoOverlaps(nodes);
  });

  it('a self-relationship and a relationship to an unknown element are ignored', () => {
    const m = modelOf([el('a'), el('b')], [rel('a', 'a'), rel('a', 'ghost'), rel('a', 'b')]);
    expect(pos(m, 'a').x).toBeLessThan(pos(m, 'b').x);
    expect(layoutOf(m).nodes).toHaveLength(2);
  });

  it('keeps unconnected elements out of the way — in a block right of the connected part', () => {
    const m = modelOf([el('a'), el('b'), el('lonely1'), el('lonely2')], [rel('a', 'b')]);
    const connectedRight = Math.max(pos(m, 'a').x, pos(m, 'b').x) + 120;
    expect(pos(m, 'lonely1').x).toBeGreaterThanOrEqual(connectedRight);
    expect(pos(m, 'lonely2').x).toBeGreaterThanOrEqual(connectedRight);
  });

  it('with no relationships at all, falls back to a plain grid (3 across, like before)', () => {
    const m = modelOf([el('a'), el('b'), el('c'), el('d')]);
    const ys = new Set(['a', 'b', 'c'].map((id) => pos(m, id).y));
    expect(ys.size).toBe(1); // first three share a row
    expect(pos(m, 'd').y).toBeGreaterThan(pos(m, 'a').y); // fourth wraps
  });

  it('wraps a very wide layer into several columns instead of one tall strip', () => {
    const targets = Array.from({ length: 14 }, (_, i) => el(`t${i}`));
    const m = modelOf(
      [el('hub'), ...targets],
      targets.map((t) => rel('hub', t.id))
    );
    const nodes = layoutOf(m).nodes.filter((n) => n.elementId.startsWith('t'));
    const perColumn = new Map<number, number>();
    for (const n of nodes) perColumn.set(n.x, (perColumn.get(n.x) ?? 0) + 1);
    expect(Math.max(...perColumn.values())).toBeLessThanOrEqual(6);
    expect(perColumn.size).toBeGreaterThan(1);
  });

  it('gives every element exactly one node and no two nodes overlap (mixed, nested model)', () => {
    const m = modelOf(
      [
        el('s1', { kind: 'system' }),
        el('s2', { kind: 'system' }),
        el('p', { kind: 'person' }),
        el('a1', { parentId: 's1' }),
        el('a2', { parentId: 's1' }),
        el('b1', { parentId: 's2' }),
        el('b2', { parentId: 's2' }),
      ],
      [rel('p', 's1'), rel('a1', 'a2'), rel('a2', 'b1'), rel('b1', 'b2')]
    );
    const nodes = layoutOf(m).nodes;
    expect(nodes.map((n) => n.elementId).sort()).toEqual(m.elements.map((e) => e.id).sort());
    expectNoOverlaps(nodes);
  });

  it('lays out the containers of one system by THEIR relationships', () => {
    const m = modelOf(
      [
        el('sys', { kind: 'system' }),
        el('api', { parentId: 'sys' }),
        el('worker', { parentId: 'sys' }),
        el('db', { parentId: 'sys' }),
      ],
      [rel('api', 'worker'), rel('worker', 'db')]
    );
    expect(pos(m, 'api').x).toBeLessThan(pos(m, 'worker').x);
    expect(pos(m, 'worker').x).toBeLessThan(pos(m, 'db').x);
  });

  it('orders TOP-level systems by the relationships between their containers (bubbled up)', () => {
    const m = modelOf(
      [
        el('s2', { kind: 'system' }),
        el('s1', { kind: 'system' }),
        el('a', { parentId: 's1' }),
        el('b', { parentId: 's2' }),
      ],
      [rel('a', 'b')] // container a (in s1) calls container b (in s2)
    );
    expect(pos(m, 's1').x).toBeLessThan(pos(m, 's2').x);
  });

  it('handles an empty model', () => {
    expect(layoutOf(modelOf([])).nodes).toEqual([]);
  });

  it('is deterministic for a non-trivial graph', () => {
    const m = modelOf(
      [el('a'), el('b'), el('c'), el('d'), el('e')],
      [rel('a', 'c'), rel('b', 'c'), rel('c', 'd'), rel('c', 'e'), rel('e', 'a')]
    );
    expect(layoutOf(m)).toEqual(layoutOf(m));
  });

  it('honours the padding option for the top-left of the first group', () => {
    const m = modelOf([el('a'), el('b')], [rel('a', 'b')]);
    const nodes = layoutOf(m).nodes;
    expect(Math.min(...nodes.map((n) => n.x))).toBe(80);
  });
});

// ── existing positions are preserved; only missing ones are assigned ─────────

const viewWith = (nodes: LayoutState['nodes']): View => ({
  ...EMPTY_VIEW,
  layout: { algorithm: 'x', nodes, edges: [] },
});

const nodeIn = (nodes: LayoutState['nodes'], id: string) => {
  const n = nodes.find((x) => x.elementId === id);
  if (!n) throw new Error(`no node for ${id}`);
  return n;
};

describe('position preservation', () => {
  const dragged = [
    { elementId: 'a', x: 1234, y: 567, w: 120, h: 80 },
    { elementId: 'b', x: -40, y: 900, w: 120, h: 80 },
  ];

  it('keeps every existing node exactly where it is when an element is added', () => {
    const m = modelOf([el('a'), el('b'), el('c')], [rel('a', 'b')]);
    const out = computeLayout(m, viewWith(dragged), OPTS).nodes;
    expect(out.find((n) => n.elementId === 'a')).toEqual(dragged[0]);
    expect(out.find((n) => n.elementId === 'b')).toEqual(dragged[1]);
  });

  it('still keeps them after new RELATIONSHIPS that would have re-flowed a fresh layout', () => {
    // a fresh layout would put b left of a for this edge; the user's positions win
    const m = modelOf([el('a'), el('b')], [rel('b', 'a')]);
    const out = computeLayout(m, viewWith(dragged), OPTS).nodes;
    expect(out.map((n) => [n.elementId, n.x, n.y])).toEqual([
      ['a', 1234, 567],
      ['b', -40, 900],
    ]);
  });

  it('places only the missing element, below everything already placed and never on top of it', () => {
    const m = modelOf([el('a'), el('b'), el('c')]);
    const out = computeLayout(m, viewWith(dragged), OPTS).nodes;
    expect(nodeIn(out, 'c').y).toBeGreaterThan(900 + 80); // below b's bottom edge
    expectNoOverlaps(out);
  });

  it('lays out several new elements by their own relationships, as a block', () => {
    const m = modelOf([el('a'), el('b'), el('n1'), el('n2')], [rel('n1', 'n2')]);
    const out = computeLayout(m, viewWith(dragged), OPTS).nodes;
    expect(nodeIn(out, 'n1').x).toBeLessThan(nodeIn(out, 'n2').x); // flow still applies among the new ones
    expectNoOverlaps(out);
  });

  it('drops the node of an element that no longer exists in the model', () => {
    const m = modelOf([el('a')]);
    const out = computeLayout(m, viewWith(dragged), OPTS).nodes;
    expect(out.map((n) => n.elementId)).toEqual(['a']);
  });

  it("keeps an existing node's own size and other fields untouched", () => {
    const custom = [{ elementId: 'a', x: 5, y: 6, w: 333, h: 44, collapsed: true }];
    const out = computeLayout(modelOf([el('a'), el('b')]), viewWith(custom), OPTS).nodes;
    expect(out.find((n) => n.elementId === 'a')).toEqual(custom[0]);
  });

  it('with every element already positioned, computes nothing new', () => {
    const m = modelOf([el('a'), el('b')], [rel('a', 'b')]);
    expect(computeLayout(m, viewWith(dragged), OPTS).nodes).toEqual(dragged);
  });

  it('an empty view still gives a full from-scratch layout (imports, previews)', () => {
    const m = modelOf([el('a'), el('b')], [rel('a', 'b')]);
    const out = computeLayout(m, EMPTY_VIEW, OPTS).nodes;
    expect(out).toHaveLength(2);
    expect(nodeIn(out, 'a').x).toBeLessThan(nodeIn(out, 'b').x);
  });

  it('is deterministic when preserving', () => {
    const m = modelOf([el('a'), el('b'), el('c'), el('d')], [rel('c', 'd')]);
    expect(computeLayout(m, viewWith(dragged), OPTS)).toEqual(
      computeLayout(m, viewWith(dragged), OPTS)
    );
  });
});
