// Semantic zoom level computation

import type { ElementKind } from '@arch-atlas/core-model';

export type ZoomBehavior = {
  level: ElementKind;
  minZoom: number;
  maxZoom: number;
};

const ZOOM_THRESHOLDS: ZoomBehavior[] = [
  { level: 'landscape', minZoom: 0, maxZoom: 0.2 },
  { level: 'system', minZoom: 0.2, maxZoom: 0.4 },
  { level: 'container', minZoom: 0.4, maxZoom: 0.6 },
  { level: 'component', minZoom: 0.6, maxZoom: 0.8 },
  { level: 'code', minZoom: 0.8, maxZoom: 1.0 },
];

export function computeSemanticZoomLevel(zoomValue: number): ElementKind {
  // Clamp zoom value between 0 and 1
  const normalizedZoom = Math.max(0, Math.min(1, zoomValue));

  // Find the appropriate zoom threshold
  for (const threshold of ZOOM_THRESHOLDS) {
    if (normalizedZoom >= threshold.minZoom && normalizedZoom <= threshold.maxZoom) {
      return threshold.level;
    }
  }

  // Default to landscape if no match (shouldn't happen with proper clamping)
  return 'landscape';
}

export function getZoomRange(level: ElementKind): { min: number; max: number } {
  const threshold = ZOOM_THRESHOLDS.find(t => t.level === level);
  return threshold ? { min: threshold.minZoom, max: threshold.maxZoom } : { min: 0, max: 0.2 };
}
