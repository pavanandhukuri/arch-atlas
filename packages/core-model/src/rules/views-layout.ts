// Validation rule: Views and layout requirements

import type { ArchitectureModel } from '../types';
import type { ValidationError } from '../errors';
import { createError } from '../errors';

export function validateViewsLayout(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < model.views.length; i++) {
    const view = model.views[i];
    if (!view) continue;

    // Runtime guard: layout is required by the TypeScript type but external JSON
    // files may omit it. Emit a validation error so callers can surface the problem.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!view.layout) {
      errors.push(
        createError(
          'MISSING_LAYOUT',
          `View "${view.id}" is missing required layout. Add a layout object with algorithm, nodes, and edges.`,
          `views[${i}].layout`
        )
      );
    }
  }

  return errors;
}
