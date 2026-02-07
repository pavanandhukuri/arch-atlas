# Layout

**@arch-atlas/layout** provides deterministic layout algorithms for architecture maps.

## Purpose

- Compute node/edge positions from semantic model
- Semantic zoom level mapping (zoom value → abstraction level)
- Deterministic and reproducible layout

## Installation

```bash
pnpm add @arch-atlas/layout
```

## Usage

```typescript
import { computeLayout, computeSemanticZoomLevel } from '@arch-atlas/layout';
import type { ArchitectureModel, View } from '@arch-atlas/core-model';

const model: ArchitectureModel = /* ... */;
const view: View = model.views[0];

// Compute layout
const layout = computeLayout(model, view, { algorithm: 'deterministic-v1' });

// Map zoom to semantic level
const level = computeSemanticZoomLevel(0.5); // 'container'
```

## API

- `computeSemanticZoomLevel(zoom: number): ElementKind`: Map 0-1 zoom to abstraction level
- `computeLayout(model, view, options): LayoutState`: Compute deterministic layout
- `serializeLayoutState(layout): string`: Serialize to JSON
- `deserializeLayoutState(json): LayoutState`: Parse from JSON

## License

See [LICENSE](../../LICENSE) in the monorepo root.
