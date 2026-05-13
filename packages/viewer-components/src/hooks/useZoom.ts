import { useState, useCallback, useRef } from 'react';
import type { Renderer } from '@arch-atlas/renderer';
import { ZOOM_MIN, ZOOM_MAX } from '@arch-atlas/renderer';

const STEP = 1.2;

export interface UseZoomResult {
  zoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  attachToRenderer: (renderer: Renderer, container: HTMLElement) => () => void;
}

export function useZoom(): UseZoomResult {
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const rendererRef = useRef<Renderer | null>(null);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.min(ZOOM_MAX, prev * STEP);
      rendererRef.current?.setZoom(next);
      return next;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(ZOOM_MIN, prev / STEP);
      rendererRef.current?.setZoom(next);
      return next;
    });
  }, []);

  const fitToView = useCallback(() => {
    setZoomLevel(1.0);
    if (rendererRef.current) {
      rendererRef.current.pan(0, 0);
      rendererRef.current.setZoom(1.0);
    }
  }, []);

  const attachToRenderer = useCallback(
    (renderer: Renderer, container: HTMLElement): (() => void) => {
      rendererRef.current = renderer;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoomLevel((prev) => {
            const next = Math.min(ZOOM_MAX, prev * STEP);
            renderer.setZoom(next);
            return next;
          });
        } else {
          setZoomLevel((prev) => {
            const next = Math.max(ZOOM_MIN, prev / STEP);
            renderer.setZoom(next);
            return next;
          });
        }
      };

      const onKeydown = (e: KeyboardEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoomLevel((prev) => {
            const next = Math.min(ZOOM_MAX, prev * STEP);
            renderer.setZoom(next);
            return next;
          });
        } else if (e.key === '-') {
          e.preventDefault();
          setZoomLevel((prev) => {
            const next = Math.max(ZOOM_MIN, prev / STEP);
            renderer.setZoom(next);
            return next;
          });
        } else if (e.key === '0') {
          e.preventDefault();
          setZoomLevel(1.0);
          renderer.pan(0, 0);
          renderer.setZoom(1.0);
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
    []
  );

  return { zoomLevel, zoomIn, zoomOut, fitToView, attachToRenderer };
}
