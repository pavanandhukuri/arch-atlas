// Deterministic layout computation

import type { ArchitectureModel, View, LayoutState } from '@arch-atlas/core-model';

export interface LayoutOptions {
  algorithm: string;
  spacing?: number;
  padding?: number;
}

export function computeLayout(
  model: ArchitectureModel,
  _view: View,
  options: LayoutOptions
): LayoutState {
  // Simple deterministic layout: arrange elements in a grid
  const spacing = options.spacing ?? 150;
  const padding = options.padding ?? 50;

  // Layout ALL elements in the model (filtering should be done at higher level)
  const elements = model.elements;

  // Compute grid positions
  const nodes = elements.map((element, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      elementId: element.id,
      x: padding + col * spacing,
      y: padding + row * spacing,
      w: 120,
      h: 80,
    };
  });

  // Find relationships between elements
  const elementIds = new Set(elements.map(e => e.id));
  const edges = model.relationships
    .filter(rel => elementIds.has(rel.sourceId) && elementIds.has(rel.targetId))
    .map(rel => ({
      relationshipId: rel.id,
    }));

  return {
    algorithm: options.algorithm,
    nodes,
    edges,
  };
}
