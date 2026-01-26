// Error types and codes for validation

export type ErrorCode =
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVALID_HIERARCHY'
  | 'MISSING_LAYOUT'
  | 'MISSING_CODE_REF'
  | 'INVALID_CODE_REF'
  | 'DEPRECATED_FIELD';

export interface ValidationError {
  code: ErrorCode;
  message: string;
  path: string;
  severity: 'error' | 'warning';
}

export function createError(
  code: ErrorCode,
  message: string,
  path: string,
  severity: 'error' | 'warning' = 'error'
): ValidationError {
  return { code, message, path, severity };
}
