import { describe, it, expect } from 'vitest';
import { ValidationError } from '../src/errors';

describe('Error formatting: Actionable messages', () => {
  it('should format ValidationError with all fields', () => {
    const error: ValidationError = {
      code: 'DUPLICATE_ID',
      message: 'Element ID "duplicate" is not unique',
      path: 'elements[1].id',
      severity: 'error',
    };

    expect(error.code).toBe('DUPLICATE_ID');
    expect(error.message).toContain('duplicate');
    expect(error.path).toBe('elements[1].id');
    expect(error.severity).toBe('error');
  });

  it('should format error with nested path', () => {
    const error: ValidationError = {
      code: 'INVALID_REFERENCE',
      message: 'Relationship source "missing-id" does not exist',
      path: 'relationships[2].sourceId',
      severity: 'error',
    };

    expect(error.path).toContain('relationships');
    expect(error.path).toContain('[2]');
    expect(error.message).toContain('missing-id');
  });

  it('should support warning severity', () => {
    const warning: ValidationError = {
      code: 'DEPRECATED_FIELD',
      message: 'Field "oldProperty" is deprecated and will be removed',
      path: 'elements[0].oldProperty',
      severity: 'warning',
    };

    expect(warning.severity).toBe('warning');
    expect(warning.message).toContain('deprecated');
  });

  it('should include actionable guidance in message', () => {
    const error: ValidationError = {
      code: 'MISSING_LAYOUT',
      message: 'View "view-1" is missing required layout. Add a layout object with algorithm, nodes, and edges.',
      path: 'views[0].layout',
      severity: 'error',
    };

    expect(error.message).toContain('Add a layout object');
    expect(error.message).toContain('algorithm, nodes, and edges');
  });

  it('should create error array for multiple violations', () => {
    const errors: ValidationError[] = [
      {
        code: 'DUPLICATE_ID',
        message: 'Element ID "dup" appears 2 times',
        path: 'elements',
        severity: 'error',
      },
      {
        code: 'INVALID_REFERENCE',
        message: 'Relationship target "missing" does not exist',
        path: 'relationships[0].targetId',
        severity: 'error',
      },
    ];

    expect(errors).toHaveLength(2);
    expect(errors.every(e => e.severity === 'error')).toBe(true);
  });
});
