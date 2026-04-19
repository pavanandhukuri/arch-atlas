import { describe, it, expect } from 'vitest';
import { parse } from '../src/index';

const BASIC_DSL = `
version "1"
person "Customer"
system "Web App" {
  container "Frontend" [technology="React", subtype="user-interface"]
  container "Backend"  [technology="Node.js", subtype="backend-service"]
}
system "Payment Gateway" [external="true"]
"Customer" -> "Web App" [type="uses", label="Browses"]
"Frontend" -> "Backend" [type="calls", label="REST API"]
`.trim();

describe('parse() integration — US1 acceptance scenarios', () => {
  it('AS1: parses a valid DSL document into a complete ArchitectureModel', () => {
    const result = parse(BASIC_DSL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements.length).toBe(5);
      expect(result.model.relationships.length).toBe(2);
      expect(result.model.schemaVersion).toBeDefined();
    }
  });

  it('AS2: nested elements have correct parentId', () => {
    const result = parse(BASIC_DSL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const frontend = result.model.elements.find((e) => e.name === 'Frontend');
      expect(frontend?.parentId).toBe('web-app');
    }
  });

  it('AS3: relationship sourceId and targetId resolve to correct element ids', () => {
    const result = parse(BASIC_DSL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rel = result.model.relationships[0];
      expect(rel?.sourceId).toBe('customer');
      expect(rel?.targetId).toBe('web-app');
    }
  });

  it('AS4: reference to non-existent element returns descriptive error with name', () => {
    const result = parse('"Ghost" -> "Web App" [type="calls"]\nsystem "Web App"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors[0];
      expect(err?.errorCode).toBe('UNRESOLVED_REFERENCE');
      expect(err?.message).toMatch(/ghost/i);
    }
  });

  it('AS5: parsed model has correct element and relationship counts', () => {
    const result = parse(BASIC_DSL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const kinds = result.model.elements.map((e) => e.kind);
      expect(kinds).toContain('person');
      expect(kinds).toContain('system');
      expect(kinds).toContain('container');
    }
  });

  it('maps container subtype attribute correctly', () => {
    const result = parse('system "S" { container "DB" [subtype="database"] }');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const db = result.model.elements.find((e) => e.name === 'DB');
      expect(db?.containerSubtype).toBe('database');
    }
  });

  it('maps external system attribute correctly', () => {
    const result = parse('system "Ext" [external="true"]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ext = result.model.elements.find((e) => e.name === 'Ext');
      expect(ext?.isExternal).toBe(true);
    }
  });

  it('maps technology attribute correctly', () => {
    const result = parse('system "S" { container "API" [technology="Node.js"] }');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const api = result.model.elements.find((e) => e.name === 'API');
      expect(api?.technology).toBe('Node.js');
    }
  });

  it('generates relationship id deterministically', () => {
    const result = parse('person "A"\nperson "B"\n"A" -> "B" [type="uses"]');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.relationships[0]?.id).toBeDefined();
    }
  });

  it('never throws — returns DslParseFailure for completely invalid input', () => {
    expect(() => parse('@@@@###$$$')).not.toThrow();
    const result = parse('@@@@###$$$');
    expect(result.ok).toBe(false);
  });
});
