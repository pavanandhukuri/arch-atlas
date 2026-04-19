import { TokenKind } from './types';
import type { Token } from './types';

const ELEMENT_KINDS = new Set(['landscape', 'person', 'system', 'container', 'component', 'code']);
const BOOLEAN_STRINGS = new Set(['true', 'false']);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  function col(): number {
    return pos - lineStart + 1;
  }

  function peek(): string {
    return input[pos] ?? '';
  }

  function advance(): string {
    const ch = input[pos++] ?? '';
    if (ch === '\n') {
      line++;
      lineStart = pos;
    }
    return ch;
  }

  function skipWhitespace(): void {
    while (pos < input.length) {
      const ch = peek();
      if (ch === '#') {
        // skip comment to end of line
        while (pos < input.length && peek() !== '\n') advance();
      } else if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance();
      } else {
        break;
      }
    }
  }

  function readString(startLine: number, startCol: number): Token {
    advance(); // consume opening "
    let value = '';
    while (pos < input.length && peek() !== '"') {
      if (peek() === '\n') {
        // unterminated before newline
        return {
          kind: TokenKind.Ident,
          value: 'UNTERMINATED_STRING',
          line: startLine,
          col: startCol,
        };
      }
      value += advance();
    }
    if (pos >= input.length) {
      return {
        kind: TokenKind.Ident,
        value: 'UNTERMINATED_STRING',
        line: startLine,
        col: startCol,
      };
    }
    advance(); // consume closing "
    // Normalize boolean strings
    const normalized = BOOLEAN_STRINGS.has(value.toLowerCase()) ? value.toLowerCase() : value;
    return { kind: TokenKind.String, value: normalized, line: startLine, col: startCol };
  }

  function readIdent(startLine: number, startCol: number): Token {
    let value = '';
    while (pos < input.length && /[a-zA-Z0-9_\-/.]/.test(peek())) {
      value += advance();
    }
    // Normalize element kind keywords to lowercase
    const normalized = ELEMENT_KINDS.has(value.toLowerCase()) ? value.toLowerCase() : value;
    return { kind: TokenKind.Ident, value: normalized, line: startLine, col: startCol };
  }

  while (pos < input.length) {
    skipWhitespace();
    if (pos >= input.length) break;

    const startLine = line;
    const startCol = col();
    const ch = peek();

    if (ch === '"') {
      tokens.push(readString(startLine, startCol));
    } else if (ch === '{') {
      advance();
      tokens.push({ kind: TokenKind.LBrace, value: '{', line: startLine, col: startCol });
    } else if (ch === '}') {
      advance();
      tokens.push({ kind: TokenKind.RBrace, value: '}', line: startLine, col: startCol });
    } else if (ch === '[') {
      advance();
      tokens.push({ kind: TokenKind.LBracket, value: '[', line: startLine, col: startCol });
    } else if (ch === ']') {
      advance();
      tokens.push({ kind: TokenKind.RBracket, value: ']', line: startLine, col: startCol });
    } else if (ch === '=') {
      advance();
      tokens.push({ kind: TokenKind.Equals, value: '=', line: startLine, col: startCol });
    } else if (ch === ',') {
      advance();
      tokens.push({ kind: TokenKind.Comma, value: ',', line: startLine, col: startCol });
    } else if (ch === '-' && input[pos + 1] === '>') {
      advance();
      advance();
      tokens.push({ kind: TokenKind.Arrow, value: '->', line: startLine, col: startCol });
    } else if (/[a-zA-Z0-9_\-/.]/.test(ch)) {
      tokens.push(readIdent(startLine, startCol));
    } else {
      // Unknown character — emit UNTERMINATED_STRING sentinel so parser can report it
      advance();
      tokens.push({
        kind: TokenKind.Ident,
        value: 'UNTERMINATED_STRING',
        line: startLine,
        col: startCol,
      });
    }
  }

  tokens.push({ kind: TokenKind.Eof, value: '', line, col: col() });
  return tokens;
}
