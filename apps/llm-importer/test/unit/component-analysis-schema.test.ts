import { describe, it, expect } from 'vitest';
import { ComponentAnalysisSchema } from '../../src/analysis/component-analysis.schema.js';

const fullExample = {
  schemaVersion: '1.0',
  analyzedAt: '2026-10-03T12:00:00.000Z',
  repository: {
    name: 'catalog-service',
    path: 'repos/catalog-service',
    description: 'Spring Boot book catalogue',
  },
  components: [
    { name: 'BookController', kind: 'controller', description: 'Serves GET /books' },
    { name: 'BookService', kind: 'service', description: 'Looks up books' },
    { name: 'BookRepository', kind: 'repository', description: 'Spring Data JPA repository' },
  ],
  relationships: [
    { source: 'BookController', target: 'BookService', description: 'delegates each request' },
    { source: 'BookService', target: 'BookRepository', description: 'reads book rows' },
  ],
  analysisStatus: 'complete',
  retryCount: 0,
};

describe('ComponentAnalysisSchema', () => {
  it('accepts the full persisted example', () => {
    expect(ComponentAnalysisSchema.safeParse(fullExample).success).toBe(true);
  });

  it('rejects a payload missing components', () => {
    const { components, ...withoutComponents } = fullExample;
    void components;
    expect(ComponentAnalysisSchema.safeParse(withoutComponents).success).toBe(false);
  });

  it('accepts analysisStatus "partial"', () => {
    const partial = { ...fullExample, analysisStatus: 'partial' };
    expect(ComponentAnalysisSchema.safeParse(partial).success).toBe(true);
  });

  it('accepts empty components and relationships (a repo too small to have structure)', () => {
    const bare = { ...fullExample, components: [], relationships: [] };
    expect(ComponentAnalysisSchema.safeParse(bare).success).toBe(true);
  });

  it('rejects a relationship whose source is not a named component (dangling reference)', () => {
    const dangling = {
      ...fullExample,
      relationships: [
        ...fullExample.relationships,
        { source: 'Nonexistent', target: 'BookService', description: 'bogus' },
      ],
    };
    expect(ComponentAnalysisSchema.safeParse(dangling).success).toBe(false);
  });

  it('rejects a relationship whose target is not a named component (dangling reference)', () => {
    const dangling = {
      ...fullExample,
      relationships: [{ source: 'BookController', target: 'Nonexistent', description: 'bogus' }],
    };
    expect(ComponentAnalysisSchema.safeParse(dangling).success).toBe(false);
  });

  it('strips unknown top-level keys rather than rejecting them', () => {
    const chatty = { ...fullExample, notes: 'extra', confidence_overall: 0.9 };
    const parsed = ComponentAnalysisSchema.parse(chatty);
    expect('notes' in parsed).toBe(false);
    expect('confidence_overall' in parsed).toBe(false);
  });
});
