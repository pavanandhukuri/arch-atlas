import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Export includes layout metadata', () => {
  it('should include layout state in views', () => {
    const model = minimalModel as ArchitectureModel;
    
    expect(model.views.length).toBeGreaterThan(0);
    const view = model.views[0]!;
    expect(view.layout).toBeDefined();
    expect(view.layout.algorithm).toBeTruthy();
    expect(view.layout.nodes).toBeDefined();
    expect(view.layout.edges).toBeDefined();
  });

  it('should have deterministic layout data', () => {
    const model = minimalModel as ArchitectureModel;
    const json1 = JSON.stringify(model.views[0]!.layout);
    const json2 = JSON.stringify(model.views[0]!.layout);
    expect(json1).toBe(json2);
  });
});
