import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ZOOM_MIN, ZOOM_MAX } from '@archatlas/renderer';

import { useZoom } from '../../src/hooks/useZoom';

function makeRenderer() {
  return {
    setZoom: vi.fn(),
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

  it('fitToView resets zoomLevel to 1.0', () => {
    const { result } = renderHook(() => useZoom());
    act(() => result.current.zoomIn());
    act(() => result.current.fitToView());
    expect(result.current.zoomLevel).toBe(1.0);
  });

  describe('attachToRenderer', () => {
    it('zoomIn calls renderer.setZoom with the new level', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      act(() => result.current.zoomIn());
      expect(renderer.setZoom).toHaveBeenCalledWith(expect.closeTo(1.2, 5));
    });

    it('fitToView resets pan to (0,0) and zoom to 1.0', () => {
      const renderer = makeRenderer();
      const container = makeContainer();
      const { result } = renderHook(() => useZoom());
      act(() => result.current.attachToRenderer(renderer as never, container));
      act(() => result.current.zoomIn());
      act(() => result.current.fitToView());
      expect(renderer.setZoom).toHaveBeenLastCalledWith(1.0);
      expect(renderer.pan).toHaveBeenCalledWith(0, 0);
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

    it('Ctrl/Cmd 0 keydown calls fitToView', () => {
      const renderer = makeRenderer();
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
      expect(result.current.zoomLevel).toBe(1.0);
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
