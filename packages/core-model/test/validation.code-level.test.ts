import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import type { ArchitectureModel, Element } from '../src/types';
import minimalModel from './fixtures/minimal-model.json';

describe('Validation: Code-level element and CodeReference', () => {
  it('should pass when code-level element has valid CodeReference', () => {
    const model = minimalModel as ArchitectureModel;
    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
    
    const codeElement = model.elements.find(e => e.kind === 'code');
    expect(codeElement?.codeRef).toBeDefined();
    expect(codeElement?.codeRef?.kind).toBe('file');
  });

  it('should fail when code-level element is missing codeRef', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
        { id: 'system-1', kind: 'system', name: 'System', parentId: 'landscape-1' },
        { id: 'container-1', kind: 'container', name: 'Container', parentId: 'system-1' },
        { id: 'component-1', kind: 'component', name: 'Component', parentId: 'container-1' },
        { id: 'code-1', kind: 'code', name: 'CodeElement', parentId: 'component-1' } as Element, // Missing codeRef
      ],
      relationships: [], // Clear inherited relationships
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'MISSING_CODE_REF')).toBe(true);
  });

  it('should support module CodeReference', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        ...minimalModel.elements.slice(0, 4),
        {
          id: 'code-module',
          kind: 'code',
          name: 'CoreModule',
          parentId: 'component-1',
          codeRef: {
            kind: 'module',
            ref: 'core',
          },
        },
      ],
      relationships: [], // Clear inherited relationships
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });

  it('should support symbol CodeReference', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        ...minimalModel.elements.slice(0, 4),
        {
          id: 'code-symbol',
          kind: 'code',
          name: 'OrderProcessor',
          parentId: 'component-1',
          codeRef: {
            kind: 'symbol',
            ref: 'OrderProcessor',
            repoHint: 'backend-monorepo',
          },
        },
      ],
      relationships: [], // Clear inherited relationships
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });

  it('should fail when non-code element has codeRef', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        {
          id: 'container-1',
          kind: 'container',
          name: 'Container',
          // @ts-expect-error Testing invalid codeRef on non-code element
          codeRef: { kind: 'file', ref: 'test.ts' },
        },
      ],
      relationships: [], // Clear inherited relationships
      views: [
        {
          id: 'view-test',
          level: 'container',
          title: 'Test View',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [{ elementId: 'container-1', x: 0, y: 0 }],
            edges: [],
          },
        },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_CODE_REF')).toBe(true);
  });
});
