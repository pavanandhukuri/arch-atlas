// Service for building element navigation helpers used by the Studio editor.
// Cross-layer relationship derivation (deriveViewRelationships) lives in
// @arch-atlas/viewer-components — it's shared with the read-only DiagramViewer
// used by the shareable viewer, the import wizard preview, and the standalone
// viewer app, so there's a single implementation instead of two copies drifting.

import type { ArchitectureModel, Element } from '@arch-atlas/core-model';

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
  const elementMap = new Map<string, Element>(model.elements.map((e) => [e.id, e]));
  const selectableKinds = new Set(['system', 'person', 'container', 'component']);

  return model.elements
    .filter((e) => selectableKinds.has(e.kind))
    .map((e) => ({
      value: e.id,
      label: e.name,
      sublabel: e.parentId ? getElementPath(e.parentId, elementMap) : undefined,
    }));
}
