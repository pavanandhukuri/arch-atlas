// Validation rule: Reference integrity

import type { ArchitectureModel } from '../types';
import type { ValidationError } from '../errors';
import { createError } from '../errors';

export function validateReferences(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const elementIds = new Set(model.elements.map(e => e.id));
  const relationshipIds = new Set(model.relationships.map(r => r.id));

  // Check relationship endpoints exist
  for (let i = 0; i < model.relationships.length; i++) {
    const rel = model.relationships[i];
    if (!rel) continue;

    if (!elementIds.has(rel.sourceId)) {
      errors.push(
        createError(
          'INVALID_REFERENCE',
          `Relationship source "${rel.sourceId}" does not exist`,
          `relationships[${i}].sourceId`
        )
      );
    }

    if (!elementIds.has(rel.targetId)) {
      errors.push(
        createError(
          'INVALID_REFERENCE',
          `Relationship target "${rel.targetId}" does not exist`,
          `relationships[${i}].targetId`
        )
      );
    }
  }

  // Check parentId references exist
  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element) continue;
    
    if (element.parentId && !elementIds.has(element.parentId)) {
      errors.push(
        createError(
          'INVALID_REFERENCE',
          `Parent "${element.parentId}" does not exist`,
          `elements[${i}].parentId`
        )
      );
    }
  }

  // Check layout node references
  for (let i = 0; i < model.views.length; i++) {
    const view = model.views[i];
    if (!view?.layout) continue;

    for (let j = 0; j < view.layout.nodes.length; j++) {
      const node = view.layout.nodes[j];
      if (!node) continue;
      
      if (!elementIds.has(node.elementId)) {
        errors.push(
          createError(
            'INVALID_REFERENCE',
            `Layout node references missing element "${node.elementId}"`,
            `views[${i}].layout.nodes[${j}].elementId`
          )
        );
      }
    }

    // Check layout edge references
    for (let j = 0; j < view.layout.edges.length; j++) {
      const edge = view.layout.edges[j];
      if (!edge) continue;
      
      if (!relationshipIds.has(edge.relationshipId)) {
        errors.push(
          createError(
            'INVALID_REFERENCE',
            `Layout edge references missing relationship "${edge.relationshipId}"`,
            `views[${i}].layout.edges[${j}].relationshipId`
          )
        );
      }
    }
  }

  return errors;
}
