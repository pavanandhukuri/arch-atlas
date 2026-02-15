// Validation rule: Hierarchy constraints

import type { ArchitectureModel, Element, ElementKind } from '../types';
import type { ValidationError } from '../errors';
import { createError } from '../errors';

const HIERARCHY_RULES: Record<ElementKind, ElementKind | null> = {
  landscape: null, // No parent
  system: 'landscape',
  container: 'system',
  component: 'container',
  code: 'component',
};

export function validateHierarchy(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const elementMap = new Map<string, Element>(model.elements.map(e => [e.id, e]));

  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element) continue;

    const expectedParentKind = HIERARCHY_RULES[element.kind];

    // Check if element should have a parent
    if (expectedParentKind === null) {
      if (element.parentId) {
        errors.push(
          createError(
            'INVALID_HIERARCHY',
            `${element.kind} element "${element.id}" should not have a parent`,
            `elements[${i}].parentId`
          )
        );
      }
      continue;
    }

    // Check code-level element has codeRef
    if (element.kind === 'code' && !element.codeRef) {
      errors.push(
        createError(
          'MISSING_CODE_REF',
          `Code element "${element.id}" must have a codeRef`,
          `elements[${i}].codeRef`
        )
      );
    }

    // Check non-code elements don't have codeRef
    if (element.kind !== 'code' && element.codeRef) {
      errors.push(
        createError(
          'INVALID_CODE_REF',
          `${element.kind} element "${element.id}" should not have a codeRef`,
          `elements[${i}].codeRef`
        )
      );
    }

    // Check if element has required parent
    if (!element.parentId) {
      errors.push(
        createError(
          'INVALID_HIERARCHY',
          `${element.kind} element "${element.id}" must have a parent of kind "${expectedParentKind}"`,
          `elements[${i}].parentId`
        )
      );
      continue;
    }

    // Check if parent exists and has correct kind
    const parent = elementMap.get(element.parentId);
    if (parent && parent.kind !== expectedParentKind) {
      errors.push(
        createError(
          'INVALID_HIERARCHY',
          `${element.kind} element "${element.id}" parent must be ${expectedParentKind}, but got ${parent.kind}`,
          `elements[${i}].parentId`
        )
      );
    }
  }

  return errors;
}
