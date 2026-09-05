# Arch Atlas

Web-based tooling for building and evolving **C4 architecture** models and diagrams.

## What this repo is

An open source monorepo with three apps and a set of static-analysis producers that feed them:

- **Studio** — the visual editor: create, edit, and save C4 diagrams (local disk or Google Drive).
- **Viewer** — a standalone, read-only diagram viewer deployable to any static web server (no auth, no server).
- **LLM Importer** — a deterministic CLI that turns a multi-repository workspace into a diagram Studio can import, from per-repository analysis artifacts produced by a swappable set of **skills/plugins**.

The importer itself makes no model call. Turning a repository into an analysis artifact is a
separate, swappable step — two producers ship in this repo (a local-model plugin and a Claude Code
skill); anyone can write their own against the same contract.

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
  analysis-runner-local — Reference repo-analysis producer: scans repositories via a local,
                        OpenAI-compatible model endpoint and writes {repo}.analysis.json (offline,
                        no hosted API)

plugins/
  repo-analysis/      — Alternative repo-analysis producer, packaged as a Claude Code plugin (portable —
                        install it into any project). The same {repo}.analysis.json contract,
                        run as a Claude Code skill (hosted API, opt-in)
```

### How a multi-repo workspace becomes a diagram

```
for each repository:
  llm-importer gather-context   → {repo}.context.json      (bounded, deterministic, secrets excluded)
  a producer analyzes it        → {repo}.analysis.json      (analysis-runner-local, the repo-analysis
                                                              skill, or your own — same contract)

llm-importer import:
  correlate the analyses        → deterministic evidence passes over the raw source
                                   (manifests, HTTP routes, gRPC, schemas, compose files, pub/sub topics)
  assemble-review                → architecture.review.yaml
  build-diagram                  → architecture.arch.json

Studio's import wizard reads architecture.review.yaml and lets a human confirm/classify
elements before finalizing the diagram.
```

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

```bash
pnpm --filter @arch-atlas/llm-importer build
arch-atlas-import gather-context <config>   # per-repo context bundles
# run a producer (analysis-runner-local, the repo-analysis skill, or your own)
arch-atlas-import import <config>           # correlate + write the review artifact
```

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
