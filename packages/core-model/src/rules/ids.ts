// Validation rule: ID uniqueness

import type { ArchitectureModel } from '../types';
import type { ValidationError } from '../errors';
import { createError } from '../errors';

export function validateIds(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenIds = new Set<string>();

  // Check element IDs
  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element) continue;
    
    if (seenIds.has(element.id)) {
      errors.push(
        createError(
          'DUPLICATE_ID',
          `Element ID "${element.id}" is not unique`,
          `elements[${i}].id`
        )
      );
    } else {
      seenIds.add(element.id);
    }
  }

  // Check relationship IDs
  for (let i = 0; i < model.relationships.length; i++) {
    const relationship = model.relationships[i];
    if (!relationship) continue;
    
    if (seenIds.has(relationship.id)) {
      errors.push(
        createError(
          'DUPLICATE_ID',
          `Relationship ID "${relationship.id}" is not unique`,
          `relationships[${i}].id`
        )
      );
    } else {
      seenIds.add(relationship.id);
    }
  }

  return errors;
}
