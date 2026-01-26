import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import type { ArchitectureModel } from '../src/types';
import minimalModel from './fixtures/minimal-model.json';

describe('Validation: ID uniqueness and reference integrity', () => {
  it('should pass validation for a valid model with unique IDs', () => {
    const model = minimalModel as ArchitectureModel;
    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });

  it('should fail when element IDs are not unique', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      elements: [
        { id: 'duplicate', kind: 'system', name: 'System A', parentId: 'landscape-1' },
        { id: 'duplicate', kind: 'container', name: 'Container B', parentId: 'system-1' },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
    expect(errors[0]?.message).toContain('duplicate');
  });

  it('should fail when relationship IDs are not unique', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      relationships: [
        { id: 'rel-dup', sourceId: 'component-1', targetId: 'code-1', type: 'contains' },
        { id: 'rel-dup', sourceId: 'component-1', targetId: 'code-1', type: 'uses' },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('should fail when relationship references a missing source element', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      relationships: [
        { id: 'rel-broken', sourceId: 'missing-element', targetId: 'code-1', type: 'depends_on' },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_REFERENCE')).toBe(true);
    expect(errors[0]?.path).toContain('missing-element');
  });

  it('should fail when relationship references a missing target element', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      relationships: [
        { id: 'rel-broken', sourceId: 'component-1', targetId: 'missing-target', type: 'uses' },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_REFERENCE')).toBe(true);
  });
});
