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
/**
 * Clear vertical space between the outermost boundary node and an external:
 * the boundary rectangle is drawn 24px outside its nodes, and the rest is air
 * for the arrows and their labels.
 */
const VERTICAL_GAP = 84;
/** Minimum horizontal clear space between two externals in the same row. */
const ROW_GAP = 40;
const DEFAULT_BOUNDARY_W = 120;
const DEFAULT_BOUNDARY_H = 80;

/**
 * Where to put the external systems around a system-context boundary.
 *
 * Each external goes ABOVE or BELOW the boundary, directly over the element it
 * connects to — so its arrow is short and doesn't have to cross the rest of the
 * diagram to get there (the old one-column-on-the-left placement did):
 *
 *  - Horizontally it is centred over the first element it connects to: the
 *    left-most one, since the diagram flows left to right and that is where
 *    the interaction starts.
 *  - It goes on TOP if the elements it connects to sit in the upper half of the
 *    boundary, on the BOTTOM if in the lower half (their average height decides,
 *    the bottom on a tie). That spreads externals across both sides in step with
 *    the elements they belong to.
 *  - Externals in the same row are ordered by that anchor and nudged apart so
 *    none overlap.
 *
 * An external with no relationship to a visible element goes on top, over the
 * boundary's left edge. Deterministic: ties break by input order.
 *
 * `relationships` are the view's direct + derived relationships; only those
 * between an external and a visible element matter here (in either direction).
 */
export function placeExternalElements(
  externals: readonly Element[],
  relationships: readonly Relationship[],
  boundaryNodes: readonly BoundaryNode[]
): PlacedNode[] {
  if (externals.length === 0) return [];

  const width = (n: BoundaryNode): number => n.w ?? DEFAULT_BOUNDARY_W;
  const height = (n: BoundaryNode): number => n.h ?? DEFAULT_BOUNDARY_H;

  const boundaryById = new Map(boundaryNodes.map((n) => [n.elementId, n]));
  const minX = boundaryNodes.length > 0 ? Math.min(...boundaryNodes.map((n) => n.x)) : 300;
  const minY = boundaryNodes.length > 0 ? Math.min(...boundaryNodes.map((n) => n.y)) : 100;
  const maxBottom =
    boundaryNodes.length > 0
      ? Math.max(...boundaryNodes.map((n) => n.y + height(n)))
      : minY + DEFAULT_BOUNDARY_H;
  const midY = (minY + maxBottom) / 2;

  interface Want {
    el: Element;
    index: number;
    side: 'top' | 'bottom';
    /** Left edge the external would like: centred over its first connected element. */
    desiredX: number;
  }

  const wants: Want[] = externals.map((el, index) => {
    const connected: BoundaryNode[] = [];
    for (const rel of relationships) {
      const otherId =
        rel.sourceId === el.id ? rel.targetId : rel.targetId === el.id ? rel.sourceId : null;
      const other = otherId === null ? undefined : boundaryById.get(otherId);
      if (other && !connected.includes(other)) connected.push(other);
    }

    if (connected.length === 0) {
      return { el, index, side: 'top', desiredX: minX };
    }

    // "First" = furthest left (the flow starts there), then highest, then by id.
    const first = [...connected].sort(
      (a, b) => a.x - b.x || a.y - b.y || a.elementId.localeCompare(b.elementId)
    )[0] as BoundaryNode;
    const meanY = connected.reduce((sum, n) => sum + n.y + height(n) / 2, 0) / connected.length;
    return {
      el,
      index,
      side: meanY < midY ? 'top' : 'bottom',
      desiredX: first.x + width(first) / 2 - EXTERNAL_W / 2,
    };
  });

  const placed = new Map<string, PlacedNode>();
  for (const side of ['top', 'bottom'] as const) {
    const row = wants
      .filter((w) => w.side === side)
      .sort((a, b) => a.desiredX - b.desiredX || a.index - b.index);
    const y = side === 'top' ? minY - VERTICAL_GAP - EXTERNAL_H : maxBottom + VERTICAL_GAP;
    let nextFreeX = -Infinity;
    for (const w of row) {
      const x = Math.max(w.desiredX, nextFreeX);
      nextFreeX = x + EXTERNAL_W + ROW_GAP;
      placed.set(w.el.id, { elementId: w.el.id, x, y, w: EXTERNAL_W, h: EXTERNAL_H });
    }
  }

  // Preserve the caller's order in the output.
  return externals.map((el) => placed.get(el.id) as PlacedNode);
}
