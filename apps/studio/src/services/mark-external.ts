import type { ArchitectureModel } from '@archatlas/core-model';

/**
 * Ids of every descendant (children, grandchildren, ...) of `elementId` within `model`,
 * found by walking `parentId` links breadth-first. Used both to warn the user before an
 * external-marking deletion (spec 003 FR-004/005) and to actually perform it.
 */
export function collectDescendantIds(model: ArchitectureModel, elementId: string): string[] {
  const toDelete = new Set<string>();
  const queue = model.elements.filter((e) => e.parentId === elementId).map((e) => e.id);
  queue.forEach((id) => toDelete.add(id));
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined) break;
    model.elements
      .filter((e) => e.parentId === id)
      .forEach((child) => {
        if (!toDelete.has(child.id)) {
          toDelete.add(child.id);
          queue.push(child.id);
        }
      });
  }
  return [...toDelete];
}

export interface MarkExternalResult {
  model: ArchitectureModel;
  /** Ids of elements deleted as a side effect (empty when un-marking, or when the element had
   *  no descendants to begin with). */
  deletedElementIds: string[];
}

/**
 * Computes the model that results from marking `elementId` external or internal.
 *
 * Marking external deletes the element's entire descendant subtree (containers, components,
 * code) along with any relationships/view layout referencing them — a system with containers
 * can no longer show them once it's external. The caller is responsible for warning the user
 * and getting confirmation before calling this with `isExternal: true` when
 * `collectDescendantIds` is non-empty (spec 003 FR-004/005/007) — this function performs the
 * deletion unconditionally once called.
 *
 * Marking internal (isExternal: false) does not restore anything (spec 003 FR-006): the
 * element's container view starts empty, exactly as it is immediately after this call.
 */
export function applyMarkExternal(
  model: ArchitectureModel,
  elementId: string,
  isExternal: boolean
): MarkExternalResult {
  if (!isExternal) {
    return {
      model: {
        ...model,
        elements: model.elements.map((e) => (e.id === elementId ? { ...e, isExternal: false } : e)),
      },
      deletedElementIds: [],
    };
  }

  const deletedElementIds = collectDescendantIds(model, elementId);
  const toDelete = new Set(deletedElementIds);

  const updatedElements = model.elements
    .filter((e) => !toDelete.has(e.id))
    .map((e) => (e.id === elementId ? { ...e, isExternal: true, formatting: undefined } : e));
  const updatedRelationships = model.relationships.filter(
    (r) => !toDelete.has(r.sourceId) && !toDelete.has(r.targetId)
  );
  const updatedViews = model.views.map((v) => ({
    ...v,
    layout: {
      ...v.layout,
      nodes: v.layout.nodes.filter((n) => !toDelete.has(n.elementId)),
      edges: v.layout.edges.filter((edge) =>
        updatedRelationships.some((r) => r.id === edge.relationshipId)
      ),
    },
  }));

  return {
    model: {
      ...model,
      elements: updatedElements,
      relationships: updatedRelationships,
      views: updatedViews,
    },
    deletedElementIds,
  };
}
