import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer';
import { TokenKind } from '../src/types';

describe('Lexer', () => {
  it('tokenizes a simple quoted string', () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.String, value: 'hello', line: 1 });
  });

  it('tokenizes an identifier keyword', () => {
    const tokens = tokenize('system');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.Ident, value: 'system' });
  });

  it('tokenizes an arrow ->', () => {
    const tokens = tokenize('->');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.Arrow, value: '->' });
  });

  it('tokenizes braces and brackets', () => {
    const tokens = tokenize('{ } [ ]');
    expect(tokens[0]?.kind).toBe(TokenKind.LBrace);
    expect(tokens[1]?.kind).toBe(TokenKind.RBrace);
    expect(tokens[2]?.kind).toBe(TokenKind.LBracket);
    expect(tokens[3]?.kind).toBe(TokenKind.RBracket);
  });

  it('tokenizes equals and comma', () => {
    const tokens = tokenize('=,');
    expect(tokens[0]?.kind).toBe(TokenKind.Equals);
    expect(tokens[1]?.kind).toBe(TokenKind.Comma);
  });

  it('skips whitespace and blank lines', () => {
    const tokens = tokenize('   \n\n  system');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.Ident, value: 'system' });
  });

  it('skips comment lines starting with #', () => {
    const tokens = tokenize('# this is a comment\nsystem');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.Ident, value: 'system' });
  });

  it('tracks line numbers correctly', () => {
    const tokens = tokenize('system\n"Web App"');
    expect(tokens[0]?.line).toBe(1);
    expect(tokens[1]?.line).toBe(2);
  });

  it('handles multi-line input', () => {
    const tokens = tokenize('person "Alice"\nsystem "Core"');
    const idents = tokens.filter((t) => t.kind === TokenKind.Ident);
    expect(idents).toHaveLength(2);
    expect(idents[0]?.value).toBe('person');
    expect(idents[1]?.value).toBe('system');
  });

  it('emits EOF at end', () => {
    const tokens = tokenize('');
    expect(tokens[tokens.length - 1]?.kind).toBe(TokenKind.Eof);
  });

  it('returns UNEXPECTED_TOKEN for unterminated string', () => {
    const tokens = tokenize('"unterminated');
    const errToken = tokens.find((t) => t.value === 'UNTERMINATED_STRING');
    expect(errToken).toBeDefined();
  });

  it('normalizes element kind keywords to lowercase', () => {
    const tokens = tokenize('System');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.Ident, value: 'system' });
  });

  it('normalizes boolean attr values to lowercase', () => {
    const tokens = tokenize('"True"');
    expect(tokens[0]).toMatchObject({ kind: TokenKind.String, value: 'true' });
  });
});
