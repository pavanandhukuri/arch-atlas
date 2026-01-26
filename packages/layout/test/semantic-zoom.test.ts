import { describe, it, expect } from 'vitest';
import { computeSemanticZoomLevel, type ZoomBehavior } from '../src/semantic-zoom';
import type { ElementKind } from '@arch-atlas/core-model';

describe('Semantic zoom mapping', () => {
  it('should map zoom level 0-0.2 to landscape', () => {
    expect(computeSemanticZoomLevel(0)).toBe('landscape');
    expect(computeSemanticZoomLevel(0.1)).toBe('landscape');
    expect(computeSemanticZoomLevel(0.2)).toBe('landscape');
  });

  it('should map zoom level 0.2-0.4 to system', () => {
    expect(computeSemanticZoomLevel(0.25)).toBe('system');
    expect(computeSemanticZoomLevel(0.3)).toBe('system');
    expect(computeSemanticZoomLevel(0.39)).toBe('system');
  });

  it('should map zoom level 0.4-0.6 to container', () => {
    expect(computeSemanticZoomLevel(0.45)).toBe('container');
    expect(computeSemanticZoomLevel(0.5)).toBe('container');
    expect(computeSemanticZoomLevel(0.59)).toBe('container');
  });

  it('should map zoom level 0.6-0.8 to component', () => {
    expect(computeSemanticZoomLevel(0.65)).toBe('component');
    expect(computeSemanticZoomLevel(0.7)).toBe('component');
    expect(computeSemanticZoomLevel(0.79)).toBe('component');
  });

  it('should map zoom level 0.8-1.0 to code', () => {
    expect(computeSemanticZoomLevel(0.85)).toBe('code');
    expect(computeSemanticZoomLevel(0.9)).toBe('code');
    expect(computeSemanticZoomLevel(1.0)).toBe('code');
  });

  it('should be deterministic for the same zoom value', () => {
    const level1 = computeSemanticZoomLevel(0.5);
    const level2 = computeSemanticZoomLevel(0.5);
    expect(level1).toBe(level2);
  });
});
