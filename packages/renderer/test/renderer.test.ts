import { describe, it, expect } from 'vitest';
import { createRenderer, getRectEdgePoint } from '../src/renderer';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Renderer initialization', () => {
  // Skip in Node.js environment - PixiJS requires Canvas/WebGL (browser or jsdom)
  it.skip('should create a renderer instance', () => {
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

describe('getRectEdgePoint', () => {
  it('returns right edge for a point to the right', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    const point = getRectEdgePoint(rect, 200, 25);
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(25);
  });

  it('returns left edge for a point to the left', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    const point = getRectEdgePoint(rect, -100, 25);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(25);
  });

  it('returns top edge for a point above', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    const point = getRectEdgePoint(rect, 50, -100);
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(0);
  });

  it('returns bottom edge for a point below', () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    const point = getRectEdgePoint(rect, 50, 200);
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(50);
  });
});

describe('Drag-to-connect logic', () => {
  it('detects hit when mouse is inside element bounds', () => {
    // Element at (100, 100) with size (120, 80)
    const elementBounds = { x: 100, y: 100, w: 120, h: 80 };

    // Mouse inside element
    const mouseX = 150;
    const mouseY = 120;

    const isInside =
      mouseX >= elementBounds.x &&
      mouseX <= elementBounds.x + elementBounds.w &&
      mouseY >= elementBounds.y &&
      mouseY <= elementBounds.y + elementBounds.h;

    expect(isInside).toBe(true);
  });

  it('does not detect hit when mouse is outside element bounds', () => {
    const elementBounds = { x: 100, y: 100, w: 120, h: 80 };

    // Mouse outside element
    const mouseX = 50;
    const mouseY = 50;

    const isInside =
      mouseX >= elementBounds.x &&
      mouseX <= elementBounds.x + elementBounds.w &&
      mouseY >= elementBounds.y &&
      mouseY <= elementBounds.y + elementBounds.h;

    expect(isInside).toBe(false);
  });

  it('correctly identifies target element from multiple elements', () => {
    const elements = new Map([
      ['elem1', { x: 0, y: 0, w: 100, h: 100 }],
      ['elem2', { x: 150, y: 150, w: 100, h: 100 }],
      ['elem3', { x: 300, y: 0, w: 100, h: 100 }],
    ]);

    const mouseX = 175;
    const mouseY = 175;
    const sourceId = 'elem1';

    let hoveredId = null;
    for (const [id, bounds] of elements.entries()) {
      if (id === sourceId) continue; // Skip source

      if (
        mouseX >= bounds.x &&
        mouseX <= bounds.x + bounds.w &&
        mouseY >= bounds.y &&
        mouseY <= bounds.y + bounds.h
      ) {
        hoveredId = id;
        break;
      }
    }

    expect(hoveredId).toBe('elem2');
  });
});
