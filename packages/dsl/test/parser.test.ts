import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer';
import { buildAst } from '../src/parser';

describe('Parser', () => {
  it('parses a single element declaration', () => {
    const ast = buildAst(tokenize('person "Alice"'));
    expect(ast.elements).toHaveLength(1);
    expect(ast.elements[0]).toMatchObject({ kind: 'person', name: 'Alice' });
  });

  it('parses nested elements in a block', () => {
    const ast = buildAst(tokenize('system "App" { container "DB" }'));
    expect(ast.elements[0]?.children).toHaveLength(1);
    expect(ast.elements[0]?.children[0]).toMatchObject({ kind: 'container', name: 'DB' });
  });

  it('parses inline attrs [key="value"]', () => {
    const ast = buildAst(tokenize('container "Frontend" [technology="React"]'));
    expect(ast.elements[0]?.attrs).toMatchObject({ technology: 'React' });
  });

  it('parses multiple attrs separated by commas', () => {
    const ast = buildAst(tokenize('container "DB" [technology="PostgreSQL", subtype="database"]'));
    expect(ast.elements[0]?.attrs).toMatchObject({
      technology: 'PostgreSQL',
      subtype: 'database',
    });
  });

  it('parses a relationship declaration', () => {
    const ast = buildAst(tokenize('"Alice" -> "App" [type="uses"]'));
    expect(ast.relationships).toHaveLength(1);
    expect(ast.relationships[0]).toMatchObject({
      sourceName: 'Alice',
      targetName: 'App',
      attrs: { type: 'uses' },
    });
  });

  it('parses a version header', () => {
    const ast = buildAst(tokenize('version "1"\nperson "Alice"'));
    expect(ast.version).toBe('1');
  });

  it('parses an empty document with no elements', () => {
    const ast = buildAst(tokenize(''));
    expect(ast.elements).toHaveLength(0);
    expect(ast.relationships).toHaveLength(0);
    expect(ast.version).toBeUndefined();
  });

  it('preserves line numbers on element nodes', () => {
    const ast = buildAst(tokenize('person "Alice"\nsystem "App"'));
    expect(ast.elements[0]?.line).toBe(1);
    expect(ast.elements[1]?.line).toBe(2);
  });

  it('parses all 6 element kinds', () => {
    const dsl =
      'landscape "L"\nperson "P"\nsystem "S"\ncontainer "C"\ncomponent "Comp"\ncode "Code"';
    const ast = buildAst(tokenize(dsl));
    expect(ast.elements.map((e) => e.kind)).toEqual([
      'landscape',
      'person',
      'system',
      'container',
      'component',
      'code',
    ]);
  });

  it('returns errors for unknown element kind', () => {
    const result = buildAst(tokenize('unknown "Foo"'));
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
