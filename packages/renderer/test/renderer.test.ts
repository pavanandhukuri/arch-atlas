import { describe, it, expect } from 'vitest';
import {
  createRenderer,
  zoomAroundPoint,
  computeFitTransform,
  ZOOM_MIN,
  ZOOM_MAX,
  getRectEdgePoint,
  drawDatabase,
  drawStorageBucket,
  drawStaticContent,
  drawUserInterface,
  drawBackendService,
} from '../src/renderer';
import type { ArchitectureModel } from '@archatlas/core-model';
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

describe('Container subtype shape functions', () => {
  // These functions draw into a PixiJS Graphics object.
  // Since we run in Node (no WebGL), we verify they are exported functions
  // and have the expected arity — visual correctness is covered by manual verification.

  it('exports drawDatabase as a function with 3 parameters', () => {
    expect(typeof drawDatabase).toBe('function');
    expect(drawDatabase.length).toBe(3);
  });

  it('exports drawStorageBucket as a function with 3 parameters', () => {
    expect(typeof drawStorageBucket).toBe('function');
    expect(drawStorageBucket.length).toBe(3);
  });

  it('exports drawStaticContent as a function with 3 parameters', () => {
    expect(typeof drawStaticContent).toBe('function');
    expect(drawStaticContent.length).toBe(3);
  });

  it('exports drawUserInterface as a function with 3 parameters', () => {
    expect(typeof drawUserInterface).toBe('function');
    expect(drawUserInterface.length).toBe(3);
  });

  it('exports drawBackendService as a function with 3 parameters', () => {
    expect(typeof drawBackendService).toBe('function');
    expect(drawBackendService.length).toBe(3);
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

describe('zoomAroundPoint', () => {
  it('keeps the content point under the anchor fixed on screen', () => {
    const t = { x: 40, y: -20, scale: 1.5 };
    const anchor = { x: 300, y: 200 };
    // content point currently under the anchor
    const cx = (anchor.x - t.x) / t.scale;
    const cy = (anchor.y - t.y) / t.scale;

    const next = zoomAroundPoint(t, anchor.x, anchor.y, 2.7);

    expect(cx * next.scale + next.x).toBeCloseTo(anchor.x, 9);
    expect(cy * next.scale + next.y).toBeCloseTo(anchor.y, 9);
    expect(next.scale).toBe(2.7);
  });

  it('is a no-op when the scale does not change', () => {
    const t = { x: 12, y: 34, scale: 0.8 };
    expect(zoomAroundPoint(t, 500, 400, 0.8)).toEqual(t);
  });

  it('clamps the requested scale to [ZOOM_MIN, ZOOM_MAX]', () => {
    const t = { x: 0, y: 0, scale: 1 };
    expect(zoomAroundPoint(t, 0, 0, 999).scale).toBe(ZOOM_MAX);
    expect(zoomAroundPoint(t, 0, 0, 0.0001).scale).toBe(ZOOM_MIN);
  });

  it('a clamped zoom still anchors on the cursor', () => {
    const t = { x: 0, y: 0, scale: 3.9 };
    const next = zoomAroundPoint(t, 100, 100, 10); // clamps to 4
    expect(next.scale).toBe(ZOOM_MAX);
    expect(((100 - t.x) / t.scale) * next.scale + next.x).toBeCloseTo(100, 9);
  });
});

describe('computeFitTransform', () => {
  const viewport = { width: 1000, height: 600 };

  it('centres small content without zooming in past 1', () => {
    const t = computeFitTransform({ x: 0, y: 0, w: 200, h: 100 }, viewport);
    expect(t.scale).toBe(1);
    expect(t.x).toBeCloseTo((1000 - 200) / 2, 9);
    expect(t.y).toBeCloseTo((600 - 100) / 2, 9);
  });

  it('shrinks large content to fit inside the padded viewport', () => {
    const t = computeFitTransform({ x: 0, y: 0, w: 4000, h: 1000 }, viewport, { padding: 50 });
    expect(t.scale).toBeCloseTo(900 / 4000, 9); // width-limited: (1000 - 2*50) / 4000
    // and the scaled content is centred
    expect(t.x + 0 * t.scale).toBeCloseTo((1000 - 4000 * t.scale) / 2, 9);
  });

  it('brings content at NEGATIVE stage coordinates (externals left of the boundary) into view', () => {
    // external system at x=-200, boundary content out to x=700
    const bounds = { x: -200, y: 50, w: 900, h: 400 };
    const t = computeFitTransform(bounds, viewport);
    const screenLeft = bounds.x * t.scale + t.x;
    const screenRight = (bounds.x + bounds.w) * t.scale + t.x;
    expect(screenLeft).toBeGreaterThanOrEqual(0);
    expect(screenRight).toBeLessThanOrEqual(viewport.width);
    const screenTop = bounds.y * t.scale + t.y;
    const screenBottom = (bounds.y + bounds.h) * t.scale + t.y;
    expect(screenTop).toBeGreaterThanOrEqual(0);
    expect(screenBottom).toBeLessThanOrEqual(viewport.height);
  });

  it('never goes below ZOOM_MIN', () => {
    const t = computeFitTransform({ x: 0, y: 0, w: 1e6, h: 1e6 }, viewport);
    expect(t.scale).toBe(ZOOM_MIN);
  });

  it('tolerates zero-size bounds and a tiny viewport without NaN', () => {
    const t = computeFitTransform({ x: 5, y: 5, w: 0, h: 0 }, { width: 10, height: 10 });
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });
});
