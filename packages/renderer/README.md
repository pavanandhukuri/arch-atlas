# Renderer

**@arch-atlas/renderer** is a PixiJS-based WebGL renderer for architecture maps.

## Purpose

- Headless rendering engine (no UI framework coupling)
- Pan/zoom viewport with semantic zoom
- Drill-down and roll-up interaction hooks
- Performant WebGL rendering via PixiJS

## Installation

```bash
pnpm add @arch-atlas/renderer pixi.js
```

## Usage

```typescript
import { createRenderer } from '@arch-atlas/renderer';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

const model: ArchitectureModel = /* ... */;
const view: View = model.views[0];
const container = document.getElementById('canvas-container');

const renderer = createRenderer(container, model, view, {
  background: 0xffffff,
  antialias: true,
});

// Pan/zoom
renderer.setZoom(1.5);
renderer.pan(100, 50);

// Handle drill-down
renderer.onDrillDown((elementId) => {
  console.log('Drill down into', elementId);
});

// Cleanup
renderer.destroy();
```

## API

- `createRenderer(container, model, view, options?): Renderer`: Initialize renderer
- `Renderer.destroy()`: Clean up resources
- `Renderer.setZoom(zoom: number)`: Set zoom level
- `Renderer.pan(dx: number, dy: number)`: Pan viewport
- `Renderer.onDrillDown(callback)`: Register drill-down handler

## License

See [LICENSE](../../LICENSE) in the monorepo root.
