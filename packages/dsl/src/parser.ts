import type { Token, DslAst, DslElementNode, DslRelationshipNode } from './types';
import { TokenKind } from './types';
import type { ParseError } from './types';
import type { ElementKind } from '@arch-atlas/core-model';

const ELEMENT_KINDS = new Set<string>([
  'landscape',
  'person',
  'system',
  'container',
  'component',
  'code',
]);

export interface AstWithErrors extends DslAst {
  errors: ParseError[];
}

export function buildAst(tokens: Token[]): AstWithErrors {
  let pos = 0;
  const errors: ParseError[] = [];
  const elements: DslElementNode[] = [];
  const relationships: DslRelationshipNode[] = [];
  let version: string | undefined;

  function peek(): Token {
    return tokens[pos] ?? { kind: TokenKind.Eof, value: '', line: 0, col: 0 };
  }

  function advance(): Token {
    return tokens[pos++] ?? { kind: TokenKind.Eof, value: '', line: 0, col: 0 };
  }

  function parseAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {};
    // consume '['
    advance();
    while (peek().kind !== TokenKind.RBracket && peek().kind !== TokenKind.Eof) {
      const key = advance();
      if (key.kind !== TokenKind.Ident) {
        errors.push({
          errorCode: 'UNEXPECTED_TOKEN',
          message: `Expected attribute key but got '${key.value}'`,
          location: { line: key.line },
        });
        break;
      }
      if (peek().kind === TokenKind.Equals) advance();
      const valToken = advance();
      if (valToken.kind === TokenKind.String || valToken.kind === TokenKind.Ident) {
        attrs[key.value] = valToken.value;
      }
      if (peek().kind === TokenKind.Comma) advance();
    }
    if (peek().kind === TokenKind.RBracket) advance();
    return attrs;
  }

  function parseElementBlock(): DslElementNode[] {
    const children: DslElementNode[] = [];
    advance(); // consume '{'
    while (peek().kind !== TokenKind.RBrace && peek().kind !== TokenKind.Eof) {
      const node = parseStatement();
      if (node !== null && 'kind' in node) children.push(node);
    }
    if (peek().kind === TokenKind.RBrace) advance();
    return children;
  }

  function parseElement(kindToken: Token): DslElementNode | null {
    const nameToken = advance();
    if (nameToken.kind !== TokenKind.String) {
      errors.push({
        errorCode: 'MISSING_REQUIRED_FIELD',
        message: `Expected element name (quoted string) after '${kindToken.value}'`,
        location: { line: kindToken.line },
      });
      return null;
    }
    const attrs = peek().kind === TokenKind.LBracket ? parseAttrs() : {};
    const children = peek().kind === TokenKind.LBrace ? parseElementBlock() : [];

    return {
      kind: kindToken.value as ElementKind,
      name: nameToken.value,
      attrs,
      children,
      line: kindToken.line,
    };
  }

  function parseRelationship(sourceToken: Token): DslRelationshipNode | null {
    if (peek().kind !== TokenKind.Arrow) {
      errors.push({
        errorCode: 'UNEXPECTED_TOKEN',
        message: `Expected '->' after source name '${sourceToken.value}'`,
        location: { line: sourceToken.line },
      });
      return null;
    }
    advance(); // consume '->'
    const targetToken = advance();
    if (targetToken.kind !== TokenKind.String) {
      errors.push({
        errorCode: 'MISSING_REQUIRED_FIELD',
        message: 'Expected target element name (quoted string) after "->"',
        location: { line: targetToken.line },
      });
      return null;
    }
    const attrs = peek().kind === TokenKind.LBracket ? parseAttrs() : {};
    return {
      sourceName: sourceToken.value,
      targetName: targetToken.value,
      attrs,
      line: sourceToken.line,
    };
  }

  function parseStatement(): DslElementNode | DslRelationshipNode | null {
    const t = peek();

    if (t.kind === TokenKind.Eof) return null;

    // Check for sentinel error tokens from lexer
    if (t.kind === TokenKind.Ident && t.value === 'UNTERMINATED_STRING') {
      advance();
      errors.push({
        errorCode: 'UNTERMINATED_STRING',
        message: 'Unterminated string literal',
        location: { line: t.line },
      });
      return null;
    }

    // version "X"
    if (t.kind === TokenKind.Ident && t.value === 'version') {
      advance();
      const vToken = advance();
      if (vToken.kind === TokenKind.String) version = vToken.value;
      return null;
    }

    // element kind keyword
    if (t.kind === TokenKind.Ident && ELEMENT_KINDS.has(t.value)) {
      advance();
      return parseElement(t);
    }

    // unknown identifier — report as unknown element kind
    if (t.kind === TokenKind.Ident) {
      advance();
      errors.push({
        errorCode: 'UNKNOWN_ELEMENT_KIND',
        message: `Unknown element kind '${t.value}'. Expected one of: landscape, person, system, container, component, code`,
        location: { line: t.line },
      });
      return null;
    }

    // quoted string — could be start of a relationship "source" -> "target"
    if (t.kind === TokenKind.String) {
      advance();
      return parseRelationship(t);
    }

    // unexpected token
    advance();
    errors.push({
      errorCode: 'UNEXPECTED_TOKEN',
      message: `Unexpected token '${t.value}'`,
      location: { line: t.line },
    });
    return null;
  }

  while (peek().kind !== TokenKind.Eof) {
    const node = parseStatement();
    if (node === null) continue;
    if ('kind' in node && ELEMENT_KINDS.has(node.kind)) {
      elements.push(node);
    } else if ('sourceName' in node) {
      relationships.push(node);
    }
  }

  return { version, elements, relationships, errors };
}
