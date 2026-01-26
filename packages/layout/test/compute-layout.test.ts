import { describe, it, expect, beforeEach } from 'vitest';
import { computeLayout, type LayoutOptions } from '../src/compute-layout';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Layout computation determinism', () => {
  let model: ArchitectureModel;
  let view: View;

  beforeEach(() => {
    model = minimalModel as ArchitectureModel;
    view = model.views[0]!;
  });

  it('should produce identical layout for identical inputs', () => {
    const layout1 = computeLayout(model, view, { algorithm: 'deterministic-v1' });
    const layout2 = computeLayout(model, view, { algorithm: 'deterministic-v1' });

    expect(layout1.nodes).toEqual(layout2.nodes);
    expect(layout1.edges).toEqual(layout2.edges);
    expect(layout1.algorithm).toBe(layout2.algorithm);
  });

  it('should compute valid node positions', () => {
    const layout = computeLayout(model, view, { algorithm: 'deterministic-v1' });

    expect(layout.nodes.length).toBeGreaterThan(0);
    layout.nodes.forEach(node => {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.elementId).toBeTruthy();
    });
  });

  it('should respect provided layout options', () => {
    const options: LayoutOptions = {
      algorithm: 'deterministic-v1',
      spacing: 100,
    };

    const layout = computeLayout(model, view, options);
    expect(layout.algorithm).toBe('deterministic-v1');
  });
});
