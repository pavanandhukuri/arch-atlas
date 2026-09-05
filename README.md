# Arch Atlas

Web-based tooling for building and evolving **C4 architecture** models and diagrams.

## What this repo is

An open source monorepo with three apps and a set of static-analysis producers that feed them:

- **Studio** — the visual editor: create, edit, and save C4 diagrams (local disk or Google Drive).
- **Viewer** — a standalone, read-only diagram viewer deployable to any static web server (no auth, no server).
- **LLM Importer** — a deterministic CLI that turns a multi-repository workspace into a diagram Studio can import, from per-repository analysis artifacts produced by a swappable set of **skills/plugins**.

The importer itself makes no model call and never talks to a model — local or hosted — under
any configuration. Turning a repository into an analysis artifact is a separate, swappable step
performed by a producer such as `plugins/repo-analysis`, which runs from an `AGENTS.md`
(https://agents.md) so it works with any coding agent — Claude Code, Cursor, Copilot, Codex,
Windsurf, and 20+ others. Which model does the actual analysis (a local endpoint or a hosted
API) is entirely up to whichever agent you point at it; anyone can also write their own producer
against the same contract.

## Status

Early stage / under active development.

## Repository structure

```
apps/
  studio/          — Next.js visual C4 diagram editor (create, edit, save to Google Drive or local disk)
  llm-importer/    — Deterministic CLI: correlates per-repo analysis artifacts into a diagram Studio can import
  viewer/          — Standalone static viewer (read-only, nginx-deployable, no auth required)

packages/
  core-model/         — Canonical architecture model types, validation, and diff/patch
  model-schema/       — JSON schemas for exported .arch.json files
  layout/             — Deterministic layout engine
  renderer/           — PixiJS WebGL rendering engine (no React dependency)
  viewer-components/  — React components shared by Studio and Viewer (MapCanvas, DiagramViewer, ZoomControls, useZoom)
  dsl/                — Plain-text DSL library for authoring/serializing models (parser + serializer;
                        not currently wired into a Studio UI — usable standalone or by other tooling)

plugins/
  repo-analysis/      — The repo-analysis producer: reads one repository (or its context bundle)
                        and writes {repo}.analysis.json. Canonical procedure is AGENTS.md (works
                        with any AGENTS.md-aware coding agent); also packaged as a Claude Code
                        plugin for discoverability. Run it against a local or hosted model — your
                        choice, the importer has no opinion.
```

### How a multi-repo workspace becomes a diagram

```
point a coding agent at import.yaml, running plugins/repo-analysis — one request runs the
whole pipeline itself:
  gather-context (per repo)     → {repo}.context.json      (bounded, deterministic, secrets excluded)
  analyze each bundle           → {repo}.analysis.json      (the one step touching a model — your
                                                              agent, your model, local or hosted)
  import (correlate)            → deterministic evidence passes over the raw source
                                   (manifests, HTTP routes, gRPC, schemas, compose files, pub/sub topics)
                                 → architecture.review.yaml
                                 → architecture.arch.json

Studio's import wizard reads architecture.review.yaml and lets a human confirm/classify
elements before finalizing the diagram.
```

One developer action — point an agent at `import.yaml` — produces a ready
`architecture.review.yaml`. `gather-context` and `import` are still directly callable on their
own if a producer wants to invoke them itself instead.

See `apps/llm-importer/README.md` for the full pipeline and CLI reference, and
`specs/010-harness-neutral-importer/` for the producer contract new producers implement against.

### Package dependency hierarchy (editor/viewer stack)

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

- Node.js ≥ 20 (LTS) for `apps/studio` / `apps/viewer`; Node.js ≥ 22 for `apps/llm-importer`
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

### LLM Importer (multi-repo → diagram)

The importer CLI is published on npm — no checkout needed. Point a coding agent at your
`import.yaml` running `plugins/repo-analysis` (any agent, any model): it runs
`npx @arch-atlas/llm-importer@latest gather-context`, analyzes every listed repository, then
`npx @arch-atlas/llm-importer@latest import`, writing `architecture.review.yaml` +
`architecture.arch.json`.

See `apps/llm-importer/README.md` for the full CLI reference and the producer contract.

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
cd apps/llm-importer && pnpm test

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
