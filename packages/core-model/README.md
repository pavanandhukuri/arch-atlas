# Core Model

**@arch-atlas/core-model** is the headless semantic architecture model and validation engine.

## Purpose

This package provides:
- TypeScript types for the architecture model (Element, Relationship, View, etc.)
- Validation rules (ID uniqueness, hierarchy constraints, reference integrity)
- Change proposal API (diff/patch)
- Actionable error formatting

## Design Principles

- **Framework-agnostic**: No UI or rendering logic
- **Pure TypeScript**: No React, Next.js, or browser-specific APIs
- **Single source of truth**: All domain logic lives here
- **Test-driven**: 100% TDD, high coverage

## Installation

```bash
pnpm add @arch-atlas/core-model
```

## Usage

```typescript
import { validateModel, type ArchitectureModel } from '@arch-atlas/core-model';

const model: ArchitectureModel = {
  schemaVersion: '0.1.0',
  metadata: { /* ... */ },
  elements: [ /* ... */ ],
  relationships: [ /* ... */ ],
  constraints: [],
  views: [ /* ... */ ],
};

const errors = validateModel(model);
if (errors.length > 0) {
  console.error('Validation errors:', errors);
}
```

## API

### Types

- `ArchitectureModel`: Root model type
- `Element`: Architecture element (landscape, system, container, component, code)
- `Relationship`: Connection between elements
- `View`: Viewport into the model at a specific abstraction level
- `LayoutState`: Deterministic layout metadata
- `Constraint`: Validation constraint

### Functions

- `validateModel(model: ArchitectureModel): ValidationError[]`: Validate entire model
- `applyChangeProposal(model: ArchitectureModel, proposal: ChangeProposal): ArchitectureModel`: Apply changes

### Error Model

- `ValidationError`: Structured error with code, path, and message
- Error codes: `ID_DUPLICATE`, `REF_NOT_FOUND`, `HIERARCHY_INVALID`, etc.

## Development

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build
pnpm build
```

## License

See [LICENSE](../../LICENSE) in the monorepo root.
