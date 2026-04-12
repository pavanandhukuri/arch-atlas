// Validation rule: Element attribute constraints (isExternal, containerSubtype, formatting)

import type { ArchitectureModel } from '../types';
import type { ValidationError } from '../errors';
import { createError } from '../errors';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function validateElementAttributes(model: ArchitectureModel): ValidationError[] {
  const errors: ValidationError[] = [];
  const externalSystemIds = new Set<string>();

  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element) continue;

    // ── isExternal ──────────────────────────────────────────────────────────
    if (element.isExternal !== undefined) {
      if (element.kind !== 'system') {
        errors.push(
          createError(
            'INVALID_ATTRIBUTE',
            `"isExternal" is only valid on system elements, but element "${element.id}" has kind "${element.kind}"`,
            `elements[${i}].isExternal`
          )
        );
      } else if (element.isExternal) {
        externalSystemIds.add(element.id);
      }
    }

    // ── containerSubtype ────────────────────────────────────────────────────
    if (element.containerSubtype !== undefined) {
      if (element.kind !== 'container') {
        errors.push(
          createError(
            'INVALID_ATTRIBUTE',
            `"containerSubtype" is only valid on container elements, but element "${element.id}" has kind "${element.kind}"`,
            `elements[${i}].containerSubtype`
          )
        );
      }
    }

    // ── formatting color values ──────────────────────────────────────────────
    if (element.formatting !== undefined) {
      const { backgroundColor, borderColor, fontColor } = element.formatting;

      // Warning: formatting on external systems is ignored
      if (element.isExternal) {
        errors.push(
          createError(
            'INVALID_ATTRIBUTE',
            `Element "${element.id}" is external; "formatting" is ignored for external system elements`,
            `elements[${i}].formatting`,
            'warning'
          )
        );
      }

      for (const [field, value] of [
        ['backgroundColor', backgroundColor],
        ['borderColor', borderColor],
        ['fontColor', fontColor],
      ] as const) {
        if (value !== undefined && !HEX_COLOR_RE.test(value)) {
          errors.push(
            createError(
              'INVALID_ATTRIBUTE',
              `"formatting.${field}" must be a 6-digit hex color (e.g. "#1168bd"), got "${value}" on element "${element.id}"`,
              `elements[${i}].formatting.${field}`
            )
          );
        }
      }
    }
  }

  // ── External systems must not have children ──────────────────────────────
  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element) continue;

    if (element.parentId && externalSystemIds.has(element.parentId)) {
      errors.push(
        createError(
          'INVALID_ATTRIBUTE',
          `Element "${element.id}" cannot be a child of external system "${element.parentId}"`,
          `elements[${i}].parentId`
        )
      );
    }
  }

  return errors;
}
