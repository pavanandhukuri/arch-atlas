// Main validation entrypoint

import type { ArchitectureModel } from './types';
import type { ValidationError } from './errors';
import { validateIds } from './rules/ids';
import { validateReferences } from './rules/references';
import { validateHierarchy } from './rules/hierarchy';
import { validateViewsLayout } from './rules/views-layout';

export function validateModel(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];

  // Run all validation rules
  errors.push(...validateIds(model));
  errors.push(...validateReferences(model));
  errors.push(...validateHierarchy(model));
  errors.push(...validateViewsLayout(model));

  return errors;
}
