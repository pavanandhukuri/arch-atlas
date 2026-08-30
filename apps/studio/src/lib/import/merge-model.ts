import type { ArchitectureModel, Element, Relationship } from '@arch-atlas/core-model';
import { computeLayout } from '@arch-atlas/layout';
import type { ElementConfig } from './types';

/**
 * Merge an imported model with a base diagram using EXPLICIT user-provided mappings.
 *
 * Resolution rules (in priority order):
 *   1. ElementConfig.baseElementId is a string → user explicitly mapped this element
 *      to an existing base element. Use the base element's ID in all relationships;
 *      do NOT add a duplicate element.
 *   2. ElementConfig.baseElementId is null → user confirmed "new element". Add it.
 *   3. ElementConfig.baseElementId is undefined → not yet resolved. Treat as new element
 *      (conservative: add rather than silently merge).
 *
 * There is NO automatic name/slug matching. Every mapping is either explicit from the
 * user, or defaults to "add as new". This preserves the integrity of the base diagram.
 */
export function mergeModels(
  base: ArchitectureModel,
  imported: ArchitectureModel,
  elementConfigs: ElementConfig[]
): ArchitectureModel {
  // Build a lookup: imported element id → resolved base element id (when explicitly mapped)
  const importedIdToBaseId = new Map<string, string>();

  // Build name→id for imported elements so we can cross-reference configs
  const importedNameToId = new Map<string, string>();
  for (const el of imported.elements) {
    importedNameToId.set(el.name, el.id);
    importedNameToId.set(el.id, el.id); // id is also a valid key
  }

  // Process each ElementConfig that has an explicit baseElementId
  for (const config of elementConfigs) {
    if (typeof config.baseElementId === 'string') {
      // User mapped this imported element to an existing base element
      const importedId = importedNameToId.get(config.id) ?? importedNameToId.get(config.name);
      if (importedId !== undefined) {
        importedIdToBaseId.set(importedId, config.baseElementId);
      }
    }
  }

  // Collect IDs of existing base elements so we know what already exists
  const baseElementIds = new Set(base.elements.map((e) => e.id));

  // New elements to add (those not mapped to an existing base element)
  const newElements: Element[] = [];
  for (const importedEl of imported.elements) {
    if (importedIdToBaseId.has(importedEl.id)) {
      // Explicitly mapped to a base element — do not add
      continue;
    }
    // New element — add with 'imp-' prefix to avoid ID collisions
    const newId = baseElementIds.has(importedEl.id) ? `imp-${importedEl.id}` : importedEl.id;

    // Remap parentId if it was mapped by a user decision
    let parentId = importedEl.parentId;
    if (parentId !== undefined) {
      parentId = importedIdToBaseId.get(parentId) ?? parentId;
      // Ensure new parent id collision is also avoided
      if (!baseElementIds.has(parentId) && parentId === importedEl.parentId) {
        parentId = baseElementIds.has(parentId) ? `imp-${parentId}` : parentId;
      }
    }

    newElements.push({
      ...importedEl,
      id: newId,
      ...(parentId !== undefined ? { parentId } : {}),
    });
    baseElementIds.add(newId);

    // Register the id remapping so relationships resolve correctly
    if (newId !== importedEl.id) {
      importedIdToBaseId.set(importedEl.id, newId);
    }
  }

  // Resolve relationship source/target IDs
  const existingRelSet = new Set(
    base.relationships.map((r) => `${r.sourceId}|${r.targetId}|${r.type}`)
  );

  const newRelationships: Relationship[] = [];
  for (const rel of imported.relationships) {
    const sourceId = importedIdToBaseId.get(rel.sourceId) ?? rel.sourceId;
    const targetId = importedIdToBaseId.get(rel.targetId) ?? rel.targetId;
    const dedupKey = `${sourceId}|${targetId}|${rel.type}`;
    if (existingRelSet.has(dedupKey)) continue;
    existingRelSet.add(dedupKey);
    newRelationships.push({
      ...rel,
      id: `imp-${rel.id}`,
      sourceId,
      targetId,
    });
  }

  const mergedElements = [...base.elements, ...newElements];
  const mergedRelationships = [...base.relationships, ...newRelationships];

  // Recompute layout on the first view, preserving existing node positions
  const baseViews = base.views.length > 0 ? base.views : imported.views;
  const [firstView, ...remainingViews] = baseViews;

  const mergedViews = base.views;
  if (firstView !== undefined) {
    const partialModel: ArchitectureModel = {
      ...base,
      elements: mergedElements,
      relationships: mergedRelationships,
    };
    const updatedLayout = computeLayout(partialModel, firstView, {
      algorithm: firstView.layout.algorithm,
      spacing: 200,
      padding: 60,
    });
    return {
      ...base,
      elements: mergedElements,
      relationships: mergedRelationships,
      views: [{ ...firstView, layout: updatedLayout }, ...remainingViews],
      metadata: { ...base.metadata, updatedAt: new Date().toISOString() },
    };
  }

  return {
    ...base,
    elements: mergedElements,
    relationships: mergedRelationships,
    views: mergedViews,
    metadata: { ...base.metadata, updatedAt: new Date().toISOString() },
  };
}
