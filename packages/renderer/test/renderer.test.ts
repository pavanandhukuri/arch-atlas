import { describe, it, expect } from 'vitest';
import { createRenderer, type RendererOptions } from '../src/renderer';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Renderer initialization', () => {
  it('should create a renderer instance', () => {
    const model = minimalModel as ArchitectureModel;
    const view = model.views[0]!;
    
    const mockContainer = {
      offsetWidth: 800,
      offsetHeight: 600,
      appendChild: () => {},
    };

    const renderer = createRenderer(mockContainer as unknown as HTMLElement, model, view);
    
    expect(renderer).toBeDefined();
    expect(renderer.destroy).toBeDefined();
    expect(renderer.setZoom).toBeDefined();
  });
});
