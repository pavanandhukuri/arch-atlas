import type { ArchitectureModel, ElementKind } from '@arch-atlas/core-model';

// ─── Public types ────────────────────────────────────────────────────────────

export type DslErrorCode =
  | 'UNEXPECTED_TOKEN'
  | 'UNTERMINATED_STRING'
  | 'UNKNOWN_ELEMENT_KIND'
  | 'DUPLICATE_NAME'
  | 'UNRESOLVED_REFERENCE'
  | 'CIRCULAR_PARENT'
  | 'UNSUPPORTED_VERSION'
  | 'EMPTY_DOCUMENT'
  | 'MISSING_REQUIRED_FIELD';

export interface ParseErrorLocation {
  line?: number;
  elementName?: string;
}

export interface ParseError {
  errorCode: DslErrorCode;
  message: string;
  location: ParseErrorLocation;
}

export interface DslParseSuccess {
  ok: true;
  model: ArchitectureModel;
}

export interface DslParseFailure {
  ok: false;
  errors: ParseError[];
}

export type ParseResult = DslParseSuccess | DslParseFailure;

// ─── Internal AST types (not exported from index.ts) ─────────────────────────

export const enum TokenKind {
  String = 'STRING',
  Ident = 'IDENT',
  Arrow = 'ARROW',
  LBrace = 'LBRACE',
  RBrace = 'RBRACE',
  LBracket = 'LBRACKET',
  RBracket = 'RBRACKET',
  Equals = 'EQUALS',
  Comma = 'COMMA',
  Eof = 'EOF',
}

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  col: number;
}

export interface DslElementNode {
  kind: ElementKind;
  name: string;
  attrs: Record<string, string>;
  children: DslElementNode[];
  line: number;
}

export interface DslRelationshipNode {
  sourceName: string;
  targetName: string;
  attrs: Record<string, string>;
  line: number;
}

export interface DslAst {
  version: string | undefined;
  elements: DslElementNode[];
  relationships: DslRelationshipNode[];
}
