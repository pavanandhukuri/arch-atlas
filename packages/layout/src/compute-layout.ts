// Deterministic layout computation

import type {
  ArchitectureModel,
  Element,
  LayoutNode,
  View,
  LayoutState,
} from '@archatlas/core-model';

export interface LayoutOptions {
  algorithm: string;
  spacing?: number;
  padding?: number;
}

const NODE_W = 120;
const NODE_H = 80;
/** A layer taller than this wraps into extra columns instead of one long strip. */
const MAX_PER_COLUMN = 6;

type Pair = readonly [string, string];

// Map lookups that can't miss for the ids used here, but `noUncheckedIndexedAccess`
// makes every `.get()` possibly-undefined. Kept as two helpers instead of a
// fallback at each call site.
const num = (m: Map<string, number>, k: string): number => m.get(k) ?? 0;
const list = (m: Map<string, string[]>, k: string): string[] => m.get(k) ?? [];

/**
 * Layered ("who calls whom") layout, kept deliberately simple and fully
 * deterministic — no randomness, no iteration to convergence, no dependency on
 * the previous layout:
 *
 *  - Elements are laid out per *parent group* (the systems/persons at the top
 *    level, the containers inside one system, …) since only one group is ever
 *    on screen at once. Groups are stacked vertically so no two nodes anywhere
 *    share a position.
 *  - Within a group, relationships (bubbled up to the group's members, exactly
 *    as the viewer does) decide the columns: a node sits one column right of
 *    its CLOSEST caller (shortest path, not longest) — a fan-out shares a
 *    column, and a node called from several callers at different depths
 *    clusters with the nearest one instead of being pushed out to its
 *    deepest caller. A caller further away then points sideways or backward
 *    into that column rather than forcing the target rightward — traded
 *    deliberately for keeping obviously-related nodes (like a gateway's
 *    direct dependents) next to each other. Cycles are broken by ignoring
 *    the edge that closes them.
 *  - Nodes in a column are ordered by the average position of their neighbours
 *    to cut down on crossing arrows.
 *  - Elements with no relationship inside the group go in a plain grid to the
 *    right, out of the way of the connected part.
 *
 * Positions are only ever ASSIGNED, never overwritten: any element that already
 * has a node in `view.layout.nodes` keeps it exactly (a user's drags survive
 * adding an element, merging an import, …). Only elements without a position are
 * laid out — as their own block starting below the existing content, so they
 * can't land on top of a fixed node. Give an empty view for a from-scratch layout.
 */
export function computeLayout(
  model: ArchitectureModel,
  view: View,
  options: LayoutOptions
): LayoutState {
  const spacing = options.spacing ?? 150;
  const padding = options.padding ?? 50;
  const colPitch = spacing + 80; // layers need extra horizontal room for arrows/labels
  const rowPitch = spacing;

  // Layout ALL elements in the model (filtering should be done at higher level)
  const elements = model.elements;
  const byId = new Map(elements.map((e) => [e.id, e]));

  // Positions that already exist are kept as-is; only the rest are computed.
  const existing = new Map<string, LayoutNode>();
  for (const n of view.layout.nodes) {
    if (byId.has(n.elementId) && !existing.has(n.elementId)) existing.set(n.elementId, n);
  }
  const missing = elements.filter((e) => !existing.has(e.id));

  // Group the missing elements by parent, groups in first-appearance order.
  const groups = new Map<string, Element[]>();
  for (const el of missing) {
    const key = el.parentId ?? '';
    const g = groups.get(key);
    if (g) g.push(el);
    else groups.set(key, [el]);
  }

  // Where the new block starts: the top-left corner when nothing is fixed yet,
  // otherwise aligned with — and just below — everything already placed.
  let originX = padding;
  let yOffset = padding;
  if (existing.size > 0) {
    const fixed = [...existing.values()];
    originX = Math.min(...fixed.map((n) => n.x));
    yOffset = Math.max(...fixed.map((n) => n.y + (n.h ?? NODE_H))) + rowPitch;
  }

  const computed = new Map<string, LayoutNode>();
  for (const members of groups.values()) {
    const placed = layoutGroup(members, model, byId);
    let maxBottom = 0;
    for (const p of placed) {
      computed.set(p.id, {
        elementId: p.id,
        x: originX + p.col * colPitch,
        y: yOffset + p.row * rowPitch,
        w: NODE_W,
        h: NODE_H,
      });
      maxBottom = Math.max(maxBottom, p.row * rowPitch + NODE_H);
    }
    yOffset += maxBottom + rowPitch;
  }

  // One node per element, in model order.
  const nodes: LayoutState['nodes'] = elements.flatMap((e) => {
    const node = existing.get(e.id) ?? computed.get(e.id);
    return node ? [node] : [];
  });

  // Find relationships between elements
  const elementIds = new Set(elements.map((e) => e.id));
  const edges = model.relationships
    .filter((rel) => elementIds.has(rel.sourceId) && elementIds.has(rel.targetId))
    .map((rel) => ({
      relationshipId: rel.id,
    }));

  return {
    algorithm: options.algorithm,
    nodes,
    edges,
  };
}

/** A node's slot in grid units (may be fractional, e.g. to centre a short column); the caller applies the pitch. */
interface Placed {
  id: string;
  col: number;
  row: number;
}

function layoutGroup(
  members: Element[],
  model: ArchitectureModel,
  byId: Map<string, Element>
): Placed[] {
  const memberIds = new Set(members.map((m) => m.id));
  const order = new Map(members.map((m, i) => [m.id, i]));

  // Nearest ancestor-or-self that is a member of this group.
  const owner = (id: string): string | null => {
    let cur = byId.get(id);
    for (let guard = 0; cur && guard < 1000; guard++) {
      if (memberIds.has(cur.id)) return cur.id;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };

  // Directed edges between members, deduped, in model order.
  const edgeKeys = new Set<string>();
  const edges: Pair[] = [];
  for (const rel of model.relationships) {
    const a = owner(rel.sourceId);
    const b = owner(rel.targetId);
    if (!a || !b || a === b) continue;
    const key = `${a}\u0000${b}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push([a, b]);
  }

  const connected = new Set<string>();
  for (const [a, b] of edges) {
    connected.add(a);
    connected.add(b);
  }
  const connectedIds = members.filter((m) => connected.has(m.id)).map((m) => m.id);
  const isolatedIds = members.filter((m) => !connected.has(m.id)).map((m) => m.id);

  const placed: Placed[] = [];
  let usedCols = 0;

  if (connectedIds.length > 0) {
    const dag = breakCycles(connectedIds, edges, order);
    const layerOf = assignLayers(connectedIds, dag, order);
    const layers = orderLayers(connectedIds, dag, layerOf, order);

    // Wrap tall layers into extra columns; centre each column against the tallest.
    const columns: string[][] = [];
    for (const layer of layers) {
      for (let i = 0; i < layer.length; i += MAX_PER_COLUMN) {
        columns.push(layer.slice(i, i + MAX_PER_COLUMN));
      }
    }
    const tallest = Math.max(...columns.map((c) => c.length));
    columns.forEach((column, colIdx) => {
      const topRow = (tallest - column.length) / 2;
      column.forEach((id, i) => placed.push({ id, col: colIdx, row: topRow + i }));
    });
    usedCols = columns.length;
  }

  if (isolatedIds.length > 0) {
    const n = isolatedIds.length;
    const cols = Math.min(n, Math.max(3, Math.ceil(Math.sqrt(n))));
    const startCol = usedCols > 0 ? usedCols + 0.5 : 0;
    isolatedIds.forEach((id, i) => {
      placed.push({ id, col: startCol + (i % cols), row: Math.floor(i / cols) });
    });
  }

  return placed;
}

/** Drop the edges that close a cycle (found by DFS in model order) so the rest is a DAG. */
function breakCycles(ids: string[], edges: Pair[], order: Map<string, number>): Pair[] {
  const out = new Map<string, string[]>();
  for (const id of ids) out.set(id, []);
  for (const [a, b] of edges) out.get(a)?.push(b);
  for (const list of out.values()) list.sort((x, y) => num(order, x) - num(order, y));

  const state = new Map<string, 1 | 2>(); // 1 = on the DFS stack, 2 = finished
  const back = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const next of list(out, id)) {
      const s = state.get(next);
      if (s === 1) back.add(`${id}\u0000${next}`);
      else if (s === undefined) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) visit(id);

  return edges.filter(([a, b]) => !back.has(`${a}\u0000${b}`));
}

/**
 * Shortest-path layering: a node sits one layer to the right of its CLOSEST
 * caller, not its furthest. By the time a node is dequeued (Kahn's
 * algorithm), every predecessor's layer is already final, so this is exactly
 * `1 + min(predecessor layers)`. A predecessor further away than that then
 * points sideways (same layer) or backward into the node's column instead of
 * dragging the node rightward — the deliberate trade for clustering a node
 * with its nearest/most direct caller (e.g. a gateway's fan-out) even when
 * some other caller reaches it through a longer path.
 */
function assignLayers(ids: string[], dag: Pair[], order: Map<string, number>): Map<string, number> {
  const preds = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) {
    preds.set(id, []);
    indeg.set(id, 0);
  }
  const succs = new Map<string, string[]>();
  for (const id of ids) succs.set(id, []);
  for (const [a, b] of dag) {
    preds.get(b)?.push(a);
    succs.get(a)?.push(b);
    indeg.set(b, num(indeg, b) + 1);
  }

  const layer = new Map<string, number>();
  // Kahn's algorithm, always taking the earliest-declared ready node → deterministic.
  const ready = ids.filter((id) => indeg.get(id) === 0);
  ready.sort((x, y) => num(order, x) - num(order, y));
  while (ready.length > 0) {
    const id = ready.shift() as string;
    const predLayers = list(preds, id).map((p) => num(layer, p));
    const l = predLayers.length === 0 ? 0 : Math.min(...predLayers) + 1;
    layer.set(id, l);
    for (const s of list(succs, id)) {
      const d = num(indeg, s) - 1;
      indeg.set(s, d);
      if (d === 0) {
        ready.push(s);
        ready.sort((x, y) => num(order, x) - num(order, y));
      }
    }
  }
  return layer;
}

/** Group by layer, then sweep a few times ordering each layer by the mean position of its neighbours. */
function orderLayers(
  ids: string[],
  dag: Pair[],
  layerOf: Map<string, number>,
  order: Map<string, number>
): string[][] {
  const depth = Math.max(0, ...ids.map((id) => num(layerOf, id)));
  const layers: string[][] = Array.from({ length: depth + 1 }, () => []);
  for (const id of [...ids].sort((x, y) => num(order, x) - num(order, y))) {
    layers[num(layerOf, id)]?.push(id);
  }

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const id of ids) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const [a, b] of dag) {
    succs.get(a)?.push(b);
    preds.get(b)?.push(a);
  }

  const position = new Map<string, number>();
  const refresh = (): void => {
    for (const layer of layers) layer.forEach((id, i) => position.set(id, i));
  };
  refresh();

  const sweep = (from: number, to: number, step: 1 | -1, neighbours: Map<string, string[]>) => {
    for (let l = from; l !== to; l += step) {
      const layer = layers[l];
      if (!layer) continue;
      const bary = new Map<string, number>();
      for (const id of layer) {
        const ns = list(neighbours, id);
        bary.set(
          id,
          ns.length === 0
            ? num(position, id)
            : ns.reduce((sum, n) => sum + num(position, n), 0) / ns.length
        );
      }
      // Array.prototype.sort is stable, so equal barycentres keep their current order.
      layer.sort((x, y) => num(bary, x) - num(bary, y));
      layer.forEach((id, i) => position.set(id, i));
    }
  };

  for (let pass = 0; pass < 3; pass++) {
    sweep(1, layers.length, 1, preds);
    sweep(layers.length - 2, -1, -1, succs);
  }
  return layers;
}
