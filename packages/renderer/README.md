# Renderer

**@arch-atlas/renderer** is a PixiJS-based WebGL renderer for architecture maps.

## Purpose

- Headless rendering engine (no UI framework coupling)
- Pan/zoom viewport with configurable bounds
- Drag, connection, drill-down, and click interaction hooks
- Read-only mode for diagram viewers
- Performant WebGL rendering via PixiJS

## Installation

```bash
pnpm add @arch-atlas/renderer pixi.js
```

## Usage

```typescript
import { createRenderer, ZOOM_MIN, ZOOM_MAX } from '@arch-atlas/renderer';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

const model: ArchitectureModel = /* ... */;
const view: View = model.views[0];
const container = document.getElementById('canvas-container')!;

const renderer = createRenderer(container, model, view, {
  background: 0xffffff,
  antialias: true,
});

// Pan/zoom (zoom is clamped to [ZOOM_MIN, ZOOM_MAX])
renderer.setZoom(1.5);
renderer.pan(100, 50);

// Update the diagram without re-creating the renderer
renderer.updateLayout(model, updatedView);

// Cleanup
renderer.destroy();
```

### Read-only viewer

Pass `readOnly: true` to disable drag and connection interactions:

```typescript
const renderer = createRenderer(container, model, view, { readOnly: true });
```

### Interaction hooks

```typescript
// Element interactions
renderer.onClick((elementId) => {
  /* element clicked */
});
renderer.onDrillDown((elementId) => {
  /* double-click drill-down */
});
renderer.onDrag((elementId, x, y) => {
  /* element dragged to new position */
});

// Connection interactions
renderer.onConnectionStart((sourceId) => {
  /* connection drag started */
});
renderer.onConnectionComplete((sourceId, targetId) => {
  /* connection completed */
});
renderer.setConnectionPreview(elementId); // highlight pending connection source, or null to clear

// Relationship interactions
renderer.onRelationshipClick((relationshipId) => {
  /* relationship line clicked */
});
renderer.clearRelationshipSelection(); // deselect active relationship

// Background
renderer.onBackgroundClick(() => {
  /* clicked on empty canvas */
});
```

## API

### Factory

#### `createRenderer(container, model, view, options?): Renderer`

| Parameter   | Type                | Description                        |
| ----------- | ------------------- | ---------------------------------- |
| `container` | `HTMLElement`       | DOM element to render into         |
| `model`     | `ArchitectureModel` | The full architecture model        |
| `view`      | `View`              | The view to render                 |
| `options`   | `RendererOptions`   | Optional configuration (see below) |

### `RendererOptions`

| Option          | Type                                                | Default | Description                              |
| --------------- | --------------------------------------------------- | ------- | ---------------------------------------- |
| `background`    | `number`                                            | —       | Background colour as a hex number        |
| `antialias`     | `boolean`                                           | `true`  | Enable WebGL antialiasing                |
| `onElementDrag` | `(elementId: string, x: number, y: number) => void` | —       | Called during element drag               |
| `readOnly`      | `boolean`                                           | `false` | Disable drag and connection interactions |

### `Renderer` interface

| Method                                    | Description                                                           |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `destroy()`                               | Tear down the PixiJS app and remove the canvas                        |
| `setZoom(zoom: number)`                   | Set zoom level (clamped to `[ZOOM_MIN, ZOOM_MAX]`)                    |
| `pan(dx: number, dy: number)`             | Pan the viewport by the given pixel delta                             |
| `updateLayout(model, view, meta?)`        | Re-render with an updated model/view without re-creating the renderer |
| `onClick(cb)`                             | Register a handler for element single-clicks                          |
| `onDrillDown(cb)`                         | Register a handler for element double-click drill-down                |
| `onDrag(cb)`                              | Register a handler for element drag-end                               |
| `onConnectionStart(cb)`                   | Register a handler for connection drag start                          |
| `onConnectionComplete(cb)`                | Register a handler for completed connections                          |
| `onRelationshipClick(cb)`                 | Register a handler for relationship line clicks                       |
| `onBackgroundClick(cb)`                   | Register a handler for clicks on empty canvas                         |
| `setConnectionPreview(elementId \| null)` | Highlight a pending connection source element, or clear it            |
| `clearRelationshipSelection()`            | Deselect the currently selected relationship                          |

### Constants

| Constant   | Value | Description                |
| ---------- | ----- | -------------------------- |
| `ZOOM_MIN` | `0.1` | Minimum allowed zoom level |
| `ZOOM_MAX` | `4.0` | Maximum allowed zoom level |

## License

See [LICENSE](../../LICENSE) in the monorepo root.
