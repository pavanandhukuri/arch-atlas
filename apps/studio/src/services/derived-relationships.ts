// Service for deriving cross-layer relationships and computing external elements

import type { ArchitectureModel, Relationship, Element } from '@arch-atlas/core-model';

/**
 * Given the full model and the set of element IDs visible on the current canvas,
 * return:
 *  - directRelationships: relationships where BOTH source and target are visible
 *  - derivedRelationships: synthetic relationships, sourced/targeted at the nearest
 *    visible ancestor (for cross-layer propagation)
 *  - externalElements: SYSTEM-level elements that are outside the current view but
 *    have a relationship to/from a visible element
 */
export function deriveViewRelationships(
  model: ArchitectureModel,
  visibleElementIds: Set<string>
): {
  directRelationships: Relationship[];
  derivedRelationships: Relationship[];
  externalElements: Element[];
} {
  const elementMap = new Map<string, Element>(model.elements.map(e => [e.id, e]));

  /** Walk up to the nearest visible ancestor, or null if none. */
  const findVisibleAncestor = (elementId: string): string | null => {
    if (visibleElementIds.has(elementId)) return elementId;
    const el = elementMap.get(elementId);
    if (!el?.parentId) return null;
    return findVisibleAncestor(el.parentId);
  };

  /**
   * Walk UP the hierarchy until we hit a 'system' or 'person' element.
   * Returns null if the element has no system ancestor (e.g. it IS the landscape).
   */
  const findSystemAncestor = (elementId: string): string | null => {
    const el = elementMap.get(elementId);
    if (!el) return null;
    if (el.kind === 'system' || el.kind === 'person') return el.id;
    if (!el.parentId) return null;
    return findSystemAncestor(el.parentId);
  };

  const directRelationships: Relationship[] = [];
  const derivedMap = new Map<string, Relationship>(); // key = "sourceId|targetId"
  const externalSystemIds = new Set<string>();

  for (const rel of model.relationships) {
    const sourceVisible = visibleElementIds.has(rel.sourceId);
    const targetVisible = visibleElementIds.has(rel.targetId);

    if (sourceVisible && targetVisible) {
      directRelationships.push(rel);
      continue;
    }

    const derivedSourceId = findVisibleAncestor(rel.sourceId);
    const derivedTargetId = findVisibleAncestor(rel.targetId);

    if (derivedSourceId && derivedTargetId) {
      // Both endpoints collapse to visible ancestors — standard cross-layer derivation
      if (derivedSourceId === derivedTargetId) continue;
      const key = `${derivedSourceId}|${derivedTargetId}`;
      if (!derivedMap.has(key)) {
        derivedMap.set(key, {
          ...rel,
          id: `derived-${derivedSourceId}-${derivedTargetId}`,
          sourceId: derivedSourceId,
          targetId: derivedTargetId,
          _originalId: rel.id,
        } as Relationship & { _originalId: string });
      }
      continue;
    }

    // Exactly one endpoint is visible; the other is in a different system tree.
    // Always represent the outside participant as their SYSTEM (or person) ancestor.
    const outsideId = derivedSourceId ? rel.targetId : rel.sourceId;
    const visibleId = derivedSourceId ?? derivedTargetId;
    if (!visibleId) continue; // Neither side is in this view at all

    const extSystemId = findSystemAncestor(outsideId);
    if (!extSystemId) continue; // Outside element has no system ancestor
    if (visibleElementIds.has(extSystemId)) continue; // That system is already in this view

    externalSystemIds.add(extSystemId);

    // Derive a relationship between the visible element and the external system
    const isSourceVisible = derivedSourceId !== null;
    const extSourceId = isSourceVisible ? visibleId : extSystemId;
    const extTargetId = isSourceVisible ? extSystemId : visibleId;
    const key = `${extSourceId}|${extTargetId}`;
    if (!derivedMap.has(key)) {
      derivedMap.set(key, {
        ...rel,
        id: `derived-${extSourceId}-${extTargetId}`,
        sourceId: extSourceId,
        targetId: extTargetId,
        _originalId: rel.id,
      } as Relationship & { _originalId: string });
    }
  }

  const externalElements = [...externalSystemIds]
    .map(id => elementMap.get(id))
    .filter((e): e is Element => e !== undefined);

  return {
    directRelationships,
    derivedRelationships: [...derivedMap.values()],
    externalElements,
  };
}

/**
 * Build a human-readable hierarchy path for an element
 * (e.g. "Landscape > System A > API Container").
 */
export function getElementPath(elementId: string, elementMap: Map<string, Element>): string {
  const parts: string[] = [];
  let current = elementMap.get(elementId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? elementMap.get(current.parentId) : undefined;
  }
  return parts.join(' > ');
}

/**
 * Build dropdown options for all selectable elements (systems, containers, components, persons).
 */
export function buildElementOptions(model: ArchitectureModel) {
  const elementMap = new Map<string, Element>(model.elements.map(e => [e.id, e]));
  const selectableKinds = new Set(['system', 'person', 'container', 'component']);

  return model.elements
    .filter(e => selectableKinds.has(e.kind))
    .map(e => ({
      value: e.id,
      label: e.name,
      sublabel: e.parentId ? getElementPath(e.parentId, elementMap) : undefined,
    }));
}
