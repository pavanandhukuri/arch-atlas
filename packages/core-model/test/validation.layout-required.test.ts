import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import type { ArchitectureModel } from '../src/types';
import minimalModel from './fixtures/minimal-model.json';

describe('Validation: Layout required in export', () => {
  it('should pass when all views have required layout', () => {
    const model = minimalModel as ArchitectureModel;
    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });

  it('should fail when a view is missing layout', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      views: [
        {
          id: 'view-no-layout',
          level: 'system',
          title: 'System View',
          // @ts-expect-error Testing missing layout
          layout: undefined,
        },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'MISSING_LAYOUT')).toBe(true);
    expect(errors[0]?.message).toContain('layout');
  });

  it('should fail when layout.nodes references a missing element', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      views: [
        {
          id: 'view-broken-ref',
          level: 'landscape',
          title: 'Landscape View',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [
              { elementId: 'missing-element-id', x: 0, y: 0 },
            ],
            edges: [],
          },
        },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_REFERENCE')).toBe(true);
    expect(errors[0]?.path).toContain('missing-element-id');
  });

  it('should fail when layout.edges references a missing relationship', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      views: [
        {
          id: 'view-broken-edge',
          level: 'landscape',
          title: 'Landscape View',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [
              { elementId: 'landscape-1', x: 0, y: 0 },
            ],
            edges: [
              { relationshipId: 'missing-relationship-id' },
            ],
          },
        },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.code === 'INVALID_REFERENCE')).toBe(true);
  });

  it('should pass when layout has valid algorithm and all references exist', () => {
    const model: ArchitectureModel = {
      ...minimalModel,
      views: [
        {
          id: 'view-valid',
          level: 'landscape',
          title: 'Valid View',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [
              { elementId: 'landscape-1', x: 100, y: 100, w: 200, h: 150 },
            ],
            edges: [
              { relationshipId: 'rel-1' },
            ],
          },
        },
      ],
    } as ArchitectureModel;

    const errors = validateModel(model);
    
    expect(errors).toHaveLength(0);
  });
});
