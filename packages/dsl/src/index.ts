import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { ParseResult } from './types';
import { tokenize } from './lexer';
import { buildAst } from './parser';
import { resolve } from './resolver';
import { serialize as _serialize } from './serializer';

export type {
  DslErrorCode,
  ParseError,
  ParseErrorLocation,
  DslParseSuccess,
  DslParseFailure,
  ParseResult,
} from './types';

export { SUPPORTED_DSL_VERSION, DSL_FORMAT_DESCRIPTION } from './constants';

export function parse(dsl: string): ParseResult {
  try {
    const tokens = tokenize(dsl);
    const ast = buildAst(tokens);
    if (ast.errors.length > 0) {
      return { ok: false, errors: ast.errors };
    }
    return resolve(ast);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          errorCode: 'UNEXPECTED_TOKEN',
          message: err instanceof Error ? err.message : String(err),
          location: {},
        },
      ],
    };
  }
}

export function serialize(model: ArchitectureModel): string {
  return _serialize(model);
}
