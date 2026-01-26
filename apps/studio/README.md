# Studio

**Arch Atlas Studio** is the browser-based interactive editor for creating and exploring architecture maps.

## Architecture

Studio is a **thin client** that consumes core packages:
- `@arch-atlas/core-model` for model validation and manipulation
- `@arch-atlas/layout` for deterministic layout computation
- `@arch-atlas/renderer` for WebGL-based canvas rendering

**IMPORTANT**: Studio contains **no domain logic**. All semantic rules, validation, and business logic live in the core packages.

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development server
pnpm --filter=@arch-atlas/studio dev

# Build for production
pnpm --filter=@arch-atlas/studio build

# Run tests
pnpm --filter=@arch-atlas/studio test
```

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **UI**: React 18+
- **Styling**: CSS (globals)
- **State Management**: Custom ModelStore (thin wrapper over core-model)
- **Canvas**: PixiJS via `@arch-atlas/renderer`

## File Structure

```
src/
├── app/                    # Next.js app router
├── components/             # React components
│   ├── map-canvas/         # Canvas integration
│   └── model-editor/       # Element/relationship editors
├── services/               # Browser services (autosave, import/export)
└── state/                  # Model state management
```

## Design Guidelines

### No Domain Logic in Studio

Studio should **never** contain:
- Model validation rules (use `@arch-atlas/core-model`)
- Layout algorithms (use `@arch-atlas/layout`)
- Rendering logic (use `@arch-atlas/renderer`)

Studio **should** contain:
- UI components and interaction handlers
- Browser-specific services (file I/O, localStorage)
- Thin state management (wrapping core-model APIs)

### Code Review Checklist

Before merging Studio code, verify:
- [ ] No validation rules in Studio code
- [ ] No layout computation in Studio code
- [ ] No rendering logic outside renderer package
- [ ] All domain logic delegated to core packages
- [ ] Tests focus on UI behavior, not domain rules

## License

See [LICENSE](../../LICENSE) in the monorepo root.
