import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ZOOM_MIN, ZOOM_MAX } from '@archatlas/renderer';
import { wheelZoomFactor } from '@archatlas/viewer-components';

import { useZoom } from '../../src/hooks/useZoom';

function makeRenderer(fitScale = 1) {
  return {
    setZoom: vi.fn(),
    // echoes the requested (already clamped) zoom, like the real renderer
    zoomTo: vi.fn((z: number) => z),
    fitToContent: vi.fn(() => fitScale),
    pan: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}

function makeContainer() {
  return document.createElement('div');
}

describe('useZoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial zoomLevel is 1.0', () => {
    const { result } = renderHook(() => useZoom());
    expect(result.current.zoomLevel).toBe(1.0);
  });

  it('zoomIn multiplies current level by 1.2', () => {
    const { result } = renderHook(() => useZoom());
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBeCloseTo(1.2, 5);
  });

  it('zoomOut divides current level by 1.2', () => {
    const { result } = renderHook(() => useZoom());
    act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBeCloseTo(1 / 1.2, 5);
  });

  it('zoomIn clamps to ZOOM_MAX', () => {
    const { result } = renderHook(() => useZoom());
    // Push well past max
    for (let i = 0; i < 30; i++) act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBe(ZOOM_MAX);
  });

  it('zoomOut clamps to ZOOM_MIN', () => {
    const { result } = renderHook(() => useZoom());
    for (let i = 0; i < 30; i++) act(() => result.current.zoomOut());
    expect(result.current.zoomLevel).toBe(ZOOM_MIN);
  });

  it('fitToView with no renderer attached falls back to 1.0', () => {
    const { result } = renderHook(() => useZoom());
    act(() => result.current.zoomIn());
    act(() => result.current.fitToView());
    expect(result.current.zoomLevel).toBe(1.0);
  });

  it('syncZoomLevel updates the displayed zoom (used after an automatic fit)', () => {
    const { result } = renderHook(() => useZoom());
    act(() => result.current.syncZoomLevel(0.55));
    expect(result.current.zoomLevel).toBe(0.55);
    // and the next step builds on it
    act(() => result.current.zoomIn());
    expect(result.current.zoomLevel).toBeCloseTo(0.66, 5);
  });

  describe('attachToRenderer', () => {
    it('zoomIn calls renderer.zoomTo with the new level (centred — no anchor)', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      act(() => result.current.zoomIn());
      expect(renderer.zoomTo).toHaveBeenCalledWith(expect.closeTo(1.2, 5), undefined);
    });

    it('fitToView asks the renderer to frame all content and adopts the zoom it chose', () => {
      const renderer = makeRenderer(0.62);
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      act(() => result.current.zoomIn());
      act(() => result.current.fitToView());
      expect(renderer.fitToContent).toHaveBeenCalledTimes(1);
      expect(result.current.zoomLevel).toBe(0.62);
    });

    it('wheel zoom is anchored on the cursor', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 320,
        clientY: 240,
        bubbles: true,
      });
      act(() => container.dispatchEvent(wheelEvent));
      expect(renderer.zoomTo).toHaveBeenCalledWith(expect.closeTo(1.2, 5), {
        clientX: 320,
        clientY: 240,
      });
    });

    it('a stream of tiny pinch events (ctrl+wheel) zooms gently — it does not slam to the limit', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      // 20 events of deltaY = -2: what a modest trackpad pinch-out delivers.
      // The old fixed-step-per-event code turned this into 1.2^20 ≈ 38× → clamped to ZOOM_MAX.
      for (let i = 0; i < 20; i++) {
        const e = new WheelEvent('wheel', { deltaY: -2, ctrlKey: true, bubbles: true });
        act(() => container.dispatchEvent(e));
      }
      expect(result.current.zoomLevel).toBeGreaterThan(1.3);
      expect(result.current.zoomLevel).toBeLessThan(1.7);
      expect(result.current.zoomLevel).toBeLessThan(ZOOM_MAX);
    });

    it('a slight pinch-in barely moves the zoom (was: a large jump out)', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      for (let i = 0; i < 5; i++) {
        const e = new WheelEvent('wheel', { deltaY: 1, ctrlKey: true, bubbles: true });
        act(() => container.dispatchEvent(e));
      }
      expect(result.current.zoomLevel).toBeGreaterThan(0.9);
      expect(result.current.zoomLevel).toBeLessThan(1);
    });

    it('scroll wheel up on container calls zoomIn', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      const wheelEvent = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
      act(() => container.dispatchEvent(wheelEvent));
      expect(result.current.zoomLevel).toBeCloseTo(1.2, 5);
    });

    it('scroll wheel down on container calls zoomOut', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      const wheelEvent = new WheelEvent('wheel', { deltaY: 100, bubbles: true });
      act(() => container.dispatchEvent(wheelEvent));
      expect(result.current.zoomLevel).toBeCloseTo(1 / 1.2, 5);
    });

    it('Ctrl/Cmd + keydown calls zoomIn and prevents default', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      const event = new KeyboardEvent('keydown', {
        key: '+',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      act(() => document.dispatchEvent(event));
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(result.current.zoomLevel).toBeCloseTo(1.2, 5);
    });

    it('Ctrl/Cmd - keydown calls zoomOut and prevents default', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      const event = new KeyboardEvent('keydown', {
        key: '-',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      act(() => document.dispatchEvent(event));
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(result.current.zoomLevel).toBeCloseTo(1 / 1.2, 5);
    });

    it('Ctrl/Cmd 0 keydown frames the content, same as fitToView', () => {
      const renderer = makeRenderer(0.8);
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      act(() => result.current.zoomIn());
      const event = new KeyboardEvent('keydown', {
        key: '0',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => document.dispatchEvent(event));
      expect(renderer.fitToContent).toHaveBeenCalledTimes(1);
      expect(result.current.zoomLevel).toBe(0.8);
    });

    it('cleanup removes wheel and keydown listeners', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      let cleanup!: () => void;
      act(() => {
        cleanup = result.current.attachToRenderer(renderer as never, container);
      });
      act(() => cleanup());
      const wheelEvent = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
      act(() => container.dispatchEvent(wheelEvent));
      expect(result.current.zoomLevel).toBe(1.0);
    });
  });
});

describe('wheelZoomFactor', () => {
  it('a classic mouse-wheel notch (|deltaY| = 100) is exactly one 1.2x step', () => {
    expect(wheelZoomFactor({ deltaY: -100 })).toBeCloseTo(1.2, 9);
    expect(wheelZoomFactor({ deltaY: 100 })).toBeCloseTo(1 / 1.2, 9);
  });

  it('is proportional: half the wheel movement is half the (log) zoom', () => {
    expect(Math.log(wheelZoomFactor({ deltaY: -50 }))).toBeCloseTo(
      Math.log(wheelZoomFactor({ deltaY: -100 })) / 2,
      9
    );
  });

  it('zooming in then out by the same delta returns to the same level', () => {
    expect(wheelZoomFactor({ deltaY: -37 }) * wheelZoomFactor({ deltaY: 37 })).toBeCloseTo(1, 9);
  });

  it('no movement is no zoom change', () => {
    expect(wheelZoomFactor({ deltaY: 0 })).toBe(1);
  });

  it('a pinch event is scaled per-pixel more sensitively than a wheel event, but one tiny event stays a small nudge', () => {
    // Pinch deltas are only a few px per event (vs ~100 for a wheel notch), so it
    // needs a larger per-pixel scale for a whole gesture to feel responsive...
    const pinch = Math.abs(Math.log(wheelZoomFactor({ deltaY: -3, ctrlKey: true })));
    const wheel = Math.abs(Math.log(wheelZoomFactor({ deltaY: -3 })));
    expect(pinch).toBeGreaterThan(wheel);
    // ...while a single 3px event is still only a ~3% change, never a jump.
    expect(pinch).toBeLessThan(0.05);
  });

  it('normalises line-mode wheels (Firefox) so a 3-line notch ≈ one pixel-mode notch', () => {
    const lines = wheelZoomFactor({ deltaY: -3, deltaMode: 1 });
    const pixels = wheelZoomFactor({ deltaY: -100, deltaMode: 0 });
    expect(Math.abs(Math.log(lines) - Math.log(pixels))).toBeLessThan(0.01);
  });

  it('clamps a single outlier event so it cannot jump the zoom', () => {
    expect(wheelZoomFactor({ deltaY: -100000 })).toBeCloseTo(wheelZoomFactor({ deltaY: -120 }), 9);
    expect(wheelZoomFactor({ deltaY: -5000, ctrlKey: true })).toBeCloseTo(
      wheelZoomFactor({ deltaY: -30, ctrlKey: true }),
      9
    );
  });
});
