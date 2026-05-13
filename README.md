# Arch Atlas

Web-based tooling for building and evolving **C4 architecture** models and diagrams.

## What this repo is

An open source monorepo containing a visual diagram editor (Studio), a standalone read-only viewer deployable to any static web server, and the shared packages that power both.

## Status

Early stage / under active development.

## Repository structure

```
apps/
  studio/          — Next.js visual C4 diagram editor (create, edit, save to Google Drive)
  viewer/          — Standalone static viewer (read-only, nginx-deployable, no auth required)

packages/
  renderer/        — PixiJS WebGL rendering engine (no React dependency)
  viewer-components/ — React components shared by Studio and Viewer (MapCanvas, DiagramViewer, ZoomControls, useZoom)
  core-model/      — Canonical architecture model types, validation, and diff/patch
  model-schema/    — JSON schemas for exported .arch.json files
  layout/          — Deterministic layout engine
  dsl/             — Plain-text DSL for authoring models (LLM-ready)
```

### Package dependency hierarchy

```
@arch-atlas/core-model
@arch-atlas/layout
        ↓
@arch-atlas/renderer          (PixiJS engine, no React)
        ↓
@arch-atlas/viewer-components (React: MapCanvas, DiagramViewer, ZoomControls, useZoom)
        ↓                ↓
  apps/studio       apps/viewer
```

`apps/studio` and `apps/viewer` both import from `@arch-atlas/viewer-components` — the single source of truth for the rendering stack. Neither app duplicates diagram rendering code.

## Getting started

### Prerequisites

- Node.js ≥ 20 (LTS)
- pnpm ≥ 8

### Install

```bash
git clone https://github.com/pavanandhukuri/arch-atlas.git
cd arch-atlas
pnpm install
```

## Running the apps

### Studio (diagram editor)

```bash
cd apps/studio
pnpm dev
```

Opens at `http://localhost:3000`. Requires a Google account to save diagrams to Google Drive. Local file save/open is also supported without auth.

### Viewer (standalone static viewer)

The viewer loads pre-bundled `.arch.json` files with no auth required.

**Development mode:**

```bash
cd apps/viewer
pnpm dev
```

Opens at `http://localhost:5173`.

**Production build (for nginx / static hosting):**

```bash
cd apps/viewer
pnpm build          # outputs to apps/viewer/dist/
```

Deploy `dist/` to any static web server. To add diagrams, place `.arch.json` files in `dist/diagrams/` and update `dist/diagrams/manifest.json`:

```json
[{ "id": "my-diagram", "title": "My Architecture", "file": "my-diagram.arch.json" }]
```

No rebuild required — adding entries to `manifest.json` is enough.

## Development workflow

1. **Make changes** in the appropriate `apps/*` or `packages/*` directory
2. **Write tests first** — TDD is required; confirm tests fail before implementing
3. **Implement** the feature or fix
4. **Run tests**: `pnpm run test` (coverage must be ≥ 80%)
5. **Lint**: `pnpm run lint`
6. **Commit** and open a PR

### Running tests

```bash
# All packages and apps
pnpm run test

# Specific app
cd apps/studio && pnpm test
cd apps/viewer && pnpm test

# Specific package
cd packages/renderer && pnpm test
```

### Building packages

```bash
pnpm run build
```

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

See `LICENSE`.
