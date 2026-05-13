# Contract: ZoomControls Component

**File**: `apps/studio/src/components/zoom-controls/ZoomControls.tsx`

## Purpose

Floating UI overlay with zoom-in, zoom-out, and fit-to-view buttons. Positioned absolute in the bottom-right of its containing element. Used in both `DiagramViewer` and `StudioPage`.

## Props Interface

```typescript
export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToView: () => void;
  zoomLevel: number; // e.g. 1.0 → displayed as "100%"
}
```

## Behaviour Contract

| Interaction              | Action                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Click `+` button         | Calls `onZoomIn()`                                            |
| Click `−` button         | Calls `onZoomOut()`                                           |
| Click fit-to-view button | Calls `onFitToView()`                                         |
| Display                  | Shows current `zoomLevel` as a percentage label (e.g. "150%") |

## Constraints

- Positioned `absolute; bottom: 12px; right: 12px` inside its parent.
- Parent container MUST have `position: relative` (or `absolute`).
- Buttons MUST have accessible `aria-label` attributes: "Zoom in", "Zoom out", "Fit to view".
- Component has no internal state — all state is managed by the caller via `useZoom`.
