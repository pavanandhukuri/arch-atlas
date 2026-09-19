import { useState, useCallback, useRef } from 'react';
import type { Renderer } from '@archatlas/renderer';
import { ZOOM_MIN, ZOOM_MAX } from '@archatlas/renderer';

/** Zoom factor of the toolbar / keyboard steps, and of one classic mouse-wheel notch. */
const STEP = 1.2;

/**
 * Wheel zoom is exponential in the wheel delta, calibrated so a classic
 * mouse-wheel notch (|deltaY| ≈ 100 px) is exactly one STEP.
 */
const WHEEL_ZOOM_PER_PX = Math.log(STEP) / 100;

/**
 * Trackpad pinch reaches the page as a stream of `wheel` events with `ctrlKey`
 * set and tiny deltas (a few px each, ~60 per second) — not one big event per
 * gesture. It needs a much finer scale than a mouse wheel: applying a fixed
 * STEP per event (the old behaviour) compounds to 1.2^N, so a slight pinch
 * slammed the diagram to its zoom limit.
 */
const PINCH_ZOOM_PER_PX = 0.01;

/** Per-event delta clamps so one outlier event (a flick, a fast wheel) can't jump far. */
const MAX_WHEEL_DELTA = 120;
const MAX_PINCH_DELTA = 30;

/** WheelEvent.deltaMode → pixels (0 = pixel, 1 = line, 2 = page). */
const DELTA_MODE_TO_PX = [1, 33, 300] as const;

/**
 * Multiplicative zoom change for one wheel event: > 1 zooms in (wheel up /
 * pinch out), < 1 zooms out, and 1 for no movement. Proportional to how far the
 * wheel/fingers actually moved.
 */
export function wheelZoomFactor(e: {
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
}): number {
  const unit = DELTA_MODE_TO_PX[e.deltaMode ?? 0] ?? 1;
  const pinch = e.ctrlKey === true;
  const limit = pinch ? MAX_PINCH_DELTA : MAX_WHEEL_DELTA;
  const delta = Math.max(-limit, Math.min(limit, e.deltaY * unit));
  return Math.exp(-delta * (pinch ? PINCH_ZOOM_PER_PX : WHEEL_ZOOM_PER_PX));
}

const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export interface UseZoomResult {
  zoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Frame all diagram content (including off-origin externals) in the canvas. */
  fitToView: () => void;
  /** Sync the displayed zoom after something else changed it (e.g. an automatic fit). */
  syncZoomLevel: (level: number) => void;
  attachToRenderer: (renderer: Renderer, container: HTMLElement) => () => void;
}

export function useZoom(): UseZoomResult {
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const rendererRef = useRef<Renderer | null>(null);
  // Mirrors the applied zoom so handlers can compute the next level without
  // running renderer side effects inside a state updater.
  const zoomRef = useRef(1.0);

  const commit = useCallback((level: number) => {
    zoomRef.current = level;
    setZoomLevel(level);
  }, []);

  const applyZoom = useCallback(
    (target: number, anchor?: { clientX: number; clientY: number }) => {
      const renderer = rendererRef.current;
      commit(renderer ? renderer.zoomTo(clampZoom(target), anchor) : clampZoom(target));
    },
    [commit]
  );

  const zoomIn = useCallback(() => {
    applyZoom(zoomRef.current * STEP);
  }, [applyZoom]);
  const zoomOut = useCallback(() => {
    applyZoom(zoomRef.current / STEP);
  }, [applyZoom]);

  const fitToView = useCallback(() => {
    const renderer = rendererRef.current;
    commit(renderer ? renderer.fitToContent() : 1.0);
  }, [commit]);

  const attachToRenderer = useCallback(
    (renderer: Renderer, container: HTMLElement): (() => void) => {
      rendererRef.current = renderer;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        applyZoom(zoomRef.current * wheelZoomFactor(e), {
          clientX: e.clientX,
          clientY: e.clientY,
        });
      };

      const onKeydown = (e: KeyboardEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          applyZoom(zoomRef.current * STEP);
        } else if (e.key === '-') {
          e.preventDefault();
          applyZoom(zoomRef.current / STEP);
        } else if (e.key === '0') {
          e.preventDefault();
          commit(renderer.fitToContent());
        }
      };

      container.addEventListener('wheel', onWheel, { passive: false });
      document.addEventListener('keydown', onKeydown);

      return () => {
        container.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKeydown);
        if (rendererRef.current === renderer) rendererRef.current = null;
      };
    },
    [applyZoom, commit]
  );

  return { zoomLevel, zoomIn, zoomOut, fitToView, syncZoomLevel: commit, attachToRenderer };
}
