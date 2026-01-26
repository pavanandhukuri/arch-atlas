import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import type { ArchitectureModel } from '../src/types';
import minimalModel from './fixtures/minimal-model.json';

describe('Validation: Hierarchy rules', () => {
  it('should pass for valid parent-child hierarchy', () => {
    const model = minimalModel as ArchitectureModel;
    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });

  it('should fail when system parent is not landscape', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
        { id: 'container-1', kind: 'container', name: 'Container' },
        { id: 'system-1', kind: 'system', name: 'System', parentId: 'container-1' }, // Wrong level
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_HIERARCHY')).toBe(true);
    expect(errors[0]?.message).toContain('parent must be landscape');
  });

  it('should fail when container parent is not system', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
        { id: 'component-1', kind: 'component', name: 'Component' },
        { id: 'container-1', kind: 'container', name: 'Container', parentId: 'component-1' }, // Wrong level
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_HIERARCHY')).toBe(true);
  });

  it('should fail when component parent is not container', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
        { id: 'system-1', kind: 'system', name: 'System', parentId: 'landscape-1' },
        { id: 'component-1', kind: 'component', name: 'Component', parentId: 'system-1' }, // Wrong level
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_HIERARCHY')).toBe(true);
  });

  it('should fail when code-level element parent is not component', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
        { id: 'container-1', kind: 'container', name: 'Container' },
        { id: 'code-1', kind: 'code', name: 'Code', parentId: 'container-1', codeRef: { kind: 'file', ref: 'test.ts' } }, // Wrong level
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_HIERARCHY')).toBe(true);
  });

  it('should fail when parentId references a missing element', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'system-1', kind: 'system', name: 'System', parentId: 'missing-landscape' },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_REFERENCE' || e.code === 'INVALID_HIERARCHY')).toBe(true);
  });
});
