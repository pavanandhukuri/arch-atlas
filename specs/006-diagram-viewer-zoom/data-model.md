# Data Model: Diagram Viewer and Zoom

**Branch**: `006-diagram-viewer-zoom` | **Date**: 2026-05-02

> All entities here are **UI state** or **interface contracts** — nothing new is persisted to the model file itself.

---

## ZoomState

Local UI state managed by the `useZoom` hook. Never persisted.

| Field   | Type     | Description                                                                  |
| ------- | -------- | ---------------------------------------------------------------------------- |
| `level` | `number` | Current zoom scale factor (1.0 = default). Clamped to [ZOOM_MIN, ZOOM_MAX].  |
| `min`   | `number` | Minimum allowed scale. Constant: `0.1`. Sourced from `@arch-atlas/renderer`. |
| `max`   | `number` | Maximum allowed scale. Constant: `4.0`. Sourced from `@arch-atlas/renderer`. |

**Constraints**:

- `min ≤ level ≤ max` at all times.
- Initial value: `1.0` (default render scale).
- State is reset to `1.0` on fit-to-view.

---

## ViewerPageParams

Next.js dynamic route params for the `/view/[id]` route.

| Field | Type     | Description                                                                   |
| ----- | -------- | ----------------------------------------------------------------------------- |
| `id`  | `string` | Google Drive file ID. Passed as path segment. URL-safe, opaque to the viewer. |

**Constraints**:

- Must be a non-empty string.
- If the Drive load fails (file not found, auth error, invalid format), the viewer renders an error state — it does not crash.

---

## DiagramViewerProps (component interface)

| Field       | Type                        | Required | Description                                                 |
| ----------- | --------------------------- | -------- | ----------------------------------------------------------- |
| `model`     | `ArchitectureModel \| null` | Yes      | The model to render. `null` renders an empty state.         |
| `view`      | `View \| null`              | Yes      | The view (layout) to render. `null` renders an empty state. |
| `isLoading` | `boolean`                   | No       | Shows a loading indicator when true.                        |
| `error`     | `string \| null`            | No       | Shows an error state with this message when non-null.       |

---

## ZoomControlsProps (component interface)

| Field         | Type         | Required | Description                                    |
| ------------- | ------------ | -------- | ---------------------------------------------- |
| `onZoomIn`    | `() => void` | Yes      | Called when the + button is clicked.           |
| `onZoomOut`   | `() => void` | Yes      | Called when the − button is clicked.           |
| `onFitToView` | `() => void` | Yes      | Called when the fit-to-view button is clicked. |
| `zoomLevel`   | `number`     | Yes      | Current zoom level (for display, e.g. "100%"). |

---

## DiagramManifestEntry (standalone viewer)

One entry in `diagrams/manifest.json` used by the standalone viewer picker.

| Field   | Type     | Description                                                                                     |
| ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `id`    | `string` | Unique slug for this diagram (e.g. `"system-overview"`).                                        |
| `title` | `string` | Human-readable display name shown in the picker.                                                |
| `file`  | `string` | Filename of the `.arch.json` file relative to `diagrams/` (e.g. `"system-overview.arch.json"`). |

**Constraints**:

- `id` must be unique within the manifest.
- `file` must exist in the same `diagrams/` directory as `manifest.json`.
- An empty manifest array renders a "no diagrams available" message in the picker.

**Example `manifest.json`**:

```json
[
  { "id": "system-overview", "title": "System Overview", "file": "system-overview.arch.json" },
  { "id": "data-pipeline", "title": "Data Pipeline", "file": "data-pipeline.arch.json" }
]
```

---

## Relationships to Existing Entities

- `DiagramViewer` renders an `ArchitectureModel` + `View` from `@arch-atlas/core-model` (unchanged).
- `ZoomState` is consumed by `useZoom`, which calls `Renderer.setZoom()` and `Renderer.pan()` from `@arch-atlas/renderer` (existing methods, unchanged signatures).
- The Studio viewer route loads models via the existing `StorageHandle` / `GoogleDriveProvider` (unchanged).
- The standalone viewer loads models by fetching `.arch.json` files from `diagrams/` using `fetch()` and parsing with `parseModelFromText` from `apps/studio/src/services/import-export.ts` (or an equivalent moved to a shared location).
