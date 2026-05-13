# Contract: DiagramViewer Component

**Package**: `apps/studio/src/components/diagram-viewer/DiagramViewer.tsx`

## Purpose

A self-contained, read-only diagram rendering component. Accepts a model + view and renders them using the existing canvas engine with no editing affordances. Includes `ZoomControls` overlay.

## Props Interface

```typescript
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

export interface DiagramViewerProps {
  model: ArchitectureModel | null;
  view: View | null;
  isLoading?: boolean;
  error?: string | null;
}
```

## Behaviour Contract

| Condition                                           | Expected Output                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `model` and `view` are non-null                     | Renders full diagram via `MapCanvas` with `readOnly={true}` and `ZoomControls` overlay |
| `model` is non-null but has no elements             | Renders empty-state message: "This diagram has no elements yet."                       |
| `isLoading={true}`                                  | Renders loading indicator; no canvas                                                   |
| `error` is non-null                                 | Renders error message; no canvas                                                       |
| User clicks, drags, or attempts to connect elements | No model mutation, no editing panel opens                                              |

## Constraints

- MUST pass `readOnly={true}` to `MapCanvas`.
- MUST NOT accept or expose `onElementDrag`, `onConnectionStart`, `onElementClick` (for editing) props.
- MUST render `ZoomControls` in bottom-right corner of the canvas container.
- MUST be a `'use client'` component (canvas requires browser APIs).
