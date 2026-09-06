import type { ArchitectureModel, Element, Relationship } from '@archatlas/core-model';

export type DiagramLevel = 'landscape' | 'system' | 'container' | 'component' | 'code';

const HIERARCHY: DiagramLevel[] = ['landscape', 'system', 'container', 'component', 'code'];

export function getChildLevel(level: DiagramLevel): DiagramLevel | null {
  const idx = HIERARCHY.indexOf(level);
  return idx < HIERARCHY.length - 1 ? (HIERARCHY[idx + 1] ?? null) : null;
}

export function getParentLevel(level: DiagramLevel): DiagramLevel | null {
  const idx = HIERARCHY.indexOf(level);
  return idx > 0 ? (HIERARCHY[idx - 1] ?? null) : null;
}

export function getVisibleElements(
  model: ArchitectureModel,
  level: DiagramLevel,
  focusedElementId: string | null
): Element[] {
  if (focusedElementId) {
    return model.elements.filter((e) => e.parentId === focusedElementId);
  }
  if (level === 'landscape') {
    return model.elements.filter((e) => e.kind === 'system' || e.kind === 'person');
  }
  return model.elements.filter((e) => !e.parentId);
}

/**
 * Given the full model and the set of element IDs visible on the current canvas,
 * return:
 *  - directRelationships: relationships where BOTH source and target are visible
 *  - derivedRelationships: synthetic relationships, sourced/targeted at the nearest
 *    visible ancestor (for cross-layer propagation). Each carries `_originalId`,
 *    the id of the real underlying relationship it was derived from — editors
 *    should write changes back to that relationship, not the synthetic one.
 *  - externalElements: system/person-level elements outside the current view that
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
  const elementMap = new Map<string, Element>(model.elements.map((e) => [e.id, e]));

  const findVisibleAncestor = (elementId: string): string | null => {
    if (visibleElementIds.has(elementId)) return elementId;
    const el = elementMap.get(elementId);
    if (!el?.parentId) return null;
    return findVisibleAncestor(el.parentId);
  };

  const findSystemAncestor = (elementId: string): string | null => {
    const el = elementMap.get(elementId);
    if (!el) return null;
    if (el.kind === 'system' || el.kind === 'person') return el.id;
    if (!el.parentId) return null;
    return findSystemAncestor(el.parentId);
  };

  const directRelationships: Relationship[] = [];
  const derivedMap = new Map<string, Relationship>();
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

    const outsideId = derivedSourceId ? rel.targetId : rel.sourceId;
    const visibleId = derivedSourceId ?? derivedTargetId;
    if (!visibleId) continue;

    const extSystemId = findSystemAncestor(outsideId);
    if (!extSystemId) continue;
    if (visibleElementIds.has(extSystemId)) continue;

    externalSystemIds.add(extSystemId);

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
    .map((id) => elementMap.get(id))
    .filter((e): e is Element => e !== undefined);

  return {
    directRelationships,
    derivedRelationships: [...derivedMap.values()],
    externalElements,
  };
}
