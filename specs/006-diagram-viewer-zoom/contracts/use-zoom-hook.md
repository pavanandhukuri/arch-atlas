# Contract: useZoom Hook

**File**: `apps/studio/src/hooks/useZoom.ts`

## Purpose

Manages zoom state and wires scroll-wheel, keyboard, and button interactions to the renderer's imperative `setZoom()` / `pan()` methods.

## Signature

```typescript
import type { Renderer } from '@arch-atlas/renderer';
import { ZOOM_MIN, ZOOM_MAX } from '@arch-atlas/renderer';

export interface UseZoomResult {
  zoomLevel: number; // current scale factor
  zoomIn: () => void; // step zoom in (×1.2)
  zoomOut: () => void; // step zoom out (÷1.2)
  fitToView: () => void; // reset to default scale + pan
  attachToRenderer: (renderer: Renderer, container: HTMLElement) => () => void;
  // Returns a cleanup function that removes event listeners
}

export function useZoom(): UseZoomResult;
```

## Behaviour Contract

| Event                           | Action                                                                      |
| ------------------------------- | --------------------------------------------------------------------------- |
| Scroll up on canvas container   | `zoomIn` centred on cursor: adjust pan so point under cursor stays fixed    |
| Scroll down on canvas container | `zoomOut` centred on cursor                                                 |
| Ctrl/Cmd `+` (keydown)          | `zoomIn` centred on diagram midpoint                                        |
| Ctrl/Cmd `-` (keydown)          | `zoomOut` centred on diagram midpoint                                       |
| Ctrl/Cmd `0` (keydown)          | `fitToView`                                                                 |
| `zoomIn()` call                 | Multiply current level by 1.2, clamp to ZOOM_MAX, call `renderer.setZoom()` |
| `zoomOut()` call                | Divide current level by 1.2, clamp to ZOOM_MIN, call `renderer.setZoom()`   |
| `fitToView()` call              | Reset level to 1.0, reset pan to (0, 0)                                     |

## Constraints

- `zoomLevel` is always in `[ZOOM_MIN, ZOOM_MAX]`.
- Keyboard handler prevents default browser zoom (calls `event.preventDefault()`).
- `attachToRenderer` adds wheel and keydown listeners; the returned cleanup removes them.
- Hook is framework-agnostic logic; no JSX.
