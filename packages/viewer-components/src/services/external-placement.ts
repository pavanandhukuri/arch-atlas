import type { Element, Relationship } from '@archatlas/core-model';

export interface PlacedNode {
  elementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoundaryNode {
  elementId: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

const EXTERNAL_W = 200;
const EXTERNAL_H = 130;
/** Clear space between the boundary's nodes and the externals beside them. */
const SIDE_GAP = 80;
/** Minimum vertical clear space between two externals stacked on the same side. */
const STACK_GAP = 40;
const DEFAULT_BOUNDARY_W = 120;
const DEFAULT_BOUNDARY_H = 80;

/**
 * Where to put the external systems around a system-context boundary.
 *
 * They used to be one column to the left of the boundary in list order,
 * whatever they connected to. Now they follow the flow of the diagram, which
 * also reads left-to-right (callers on the left of what they call):
 *
 *  - an external that calls INTO the boundary (it is the relationship's source)
 *    goes on the LEFT — a user, an upstream system;
 *  - an external the boundary calls OUT to (it is the target) goes on the RIGHT
 *    — a database, an identity provider, a third-party API;
 *  - an external that does both goes to whichever side has more relationships,
 *    the left on a tie.
 *
 * Vertically each sits level with the boundary elements it connects to, then
 * externals sharing a side are nudged apart so they don't overlap. An external
 * with no relationship to a visible element keeps the old default (left).
 * Deterministic: everything is ordered by target height, then by input order.
 *
 * `relationships` are the view's direct + derived relationships; only those
 * between an external and a visible element matter here.
 */
export function placeExternalElements(
  externals: readonly Element[],
  relationships: readonly Relationship[],
  boundaryNodes: readonly BoundaryNode[]
): PlacedNode[] {
  if (externals.length === 0) return [];

  const boundaryById = new Map(boundaryNodes.map((n) => [n.elementId, n]));
  const minX = boundaryNodes.length > 0 ? Math.min(...boundaryNodes.map((n) => n.x)) : 300;
  const maxRight =
    boundaryNodes.length > 0
      ? Math.max(...boundaryNodes.map((n) => n.x + (n.w ?? DEFAULT_BOUNDARY_W)))
      : minX + DEFAULT_BOUNDARY_W;
  const leftX = minX - SIDE_GAP - EXTERNAL_W;
  const rightX = maxRight + SIDE_GAP;

  interface Want {
    el: Element;
    index: number;
    side: 'left' | 'right';
    targetY: number;
  }

  const wants: Want[] = externals.map((el, index) => {
    let calls = 0; // the external is the source: it calls into the boundary
    let called = 0; // the external is the target: the boundary calls it
    const ys: number[] = [];
    for (const rel of relationships) {
      const otherId =
        rel.sourceId === el.id ? rel.targetId : rel.targetId === el.id ? rel.sourceId : null;
      if (otherId === null) continue;
      const other = boundaryById.get(otherId);
      if (!other) continue;
      if (rel.sourceId === el.id) calls++;
      else called++;
      ys.push(other.y + (other.h ?? DEFAULT_BOUNDARY_H) / 2);
    }
    const side = called > calls ? 'right' : 'left';
    const centreY =
      ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 50 + index * (EXTERNAL_H + 50);
    return { el, index, side, targetY: centreY - EXTERNAL_H / 2 };
  });

  const placed = new Map<string, PlacedNode>();
  for (const side of ['left', 'right'] as const) {
    const column = wants
      .filter((w) => w.side === side)
      .sort((a, b) => a.targetY - b.targetY || a.index - b.index);
    let nextFreeY = -Infinity;
    for (const w of column) {
      const y = Math.max(w.targetY, nextFreeY);
      nextFreeY = y + EXTERNAL_H + STACK_GAP;
      placed.set(w.el.id, {
        elementId: w.el.id,
        x: side === 'left' ? leftX : rightX,
        y,
        w: EXTERNAL_W,
        h: EXTERNAL_H,
      });
    }
  }

  // Preserve the caller's order in the output.
  return externals.map((el) => placed.get(el.id) as PlacedNode);
}
