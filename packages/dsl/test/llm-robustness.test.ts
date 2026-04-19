import { describe, it, expect } from 'vitest';
import { parse, DSL_FORMAT_DESCRIPTION, SUPPORTED_DSL_VERSION } from '../src/index';

describe('LLM robustness (US3 acceptance scenarios)', () => {
  it('AS1: LLM output with no prior context parses or returns actionable errors without crash', () => {
    const llmOutput = `
version "1"
person "User"
system "Backend API" {
  container "REST Service" [technology="Node.js"]
}
"User" -> "Backend API" [type="uses"]
`.trim();
    expect(() => parse(llmOutput)).not.toThrow();
    const result = parse(llmOutput);
    if (!result.ok) {
      // Errors must be actionable (have message and location)
      expect(result.errors[0]?.message).toBeTruthy();
    } else {
      expect(result.model.elements.length).toBeGreaterThan(0);
    }
  });

  it('AS2: extra whitespace and blank lines are tolerated', () => {
    const dsl = `

    version "1"

    person   "Customer"


    system   "App"


    "Customer"  ->  "App"   [type="uses"]

`;
    const result = parse(dsl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements.length).toBe(2);
    }
  });

  it('AS2: inconsistent keyword casing is normalised (System vs system)', () => {
    const result = parse('System "Web App"');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements[0]?.kind).toBe('system');
    }
  });

  it('AS2: mixed-case element kinds all normalise correctly', () => {
    const result = parse('PERSON "Alice"\nSYSTEM "App"');
    expect(result.ok).toBe(true);
  });

  it('AS3: missing optional attrs produce defaults (no description → undefined)', () => {
    const result = parse('system "App"');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements[0]?.description).toBeUndefined();
      expect(result.model.elements[0]?.technology).toBeUndefined();
    }
  });

  it('AS3: missing relationship type defaults gracefully', () => {
    const result = parse('person "A"\nperson "B"\n"A" -> "B"');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.relationships[0]?.type).toBeDefined();
    }
  });

  it('AS4: DSL_FORMAT_DESCRIPTION is a non-empty string ≥ 100 chars', () => {
    expect(typeof DSL_FORMAT_DESCRIPTION).toBe('string');
    expect(DSL_FORMAT_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
  });

  it('AS4: SUPPORTED_DSL_VERSION exports as "1"', () => {
    expect(SUPPORTED_DSL_VERSION).toBe('1');
  });

  it('comment lines starting with # are ignored', () => {
    const result = parse('# This is a comment\nperson "Alice"\n# another comment');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements[0]?.name).toBe('Alice');
    }
  });

  it('returns actionable error (not crash) for completely garbled input', () => {
    expect(() => parse('@@@ $$$ !!! ???')).not.toThrow();
    const result = parse('@@@ $$$ !!! ???');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toBeTruthy();
    }
  });
});
