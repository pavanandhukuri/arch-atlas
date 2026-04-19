# Arch Atlas

Web-based tooling for building and evolving **C4 architecture** models and diagrams.

## What this repo is

This is an **open source monorepo**. Expect multiple TypeScript projects (apps + packages) and optional
Python projects for LLM/tool integrations.

## Status

Early stage / under active development.

## Getting started

### Prerequisites

- Node.js ≥ 20 (LTS)
- pnpm ≥ 8

### Installation

```bash
# Clone the repository
git clone https://github.com/pavanandhukuri/arch-atlas.git
cd arch-atlas

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Run linter
pnpm run lint
```

### Development workflow

1. **Make changes** in the appropriate `apps/*` or `packages/*` directory
2. **Write tests first** (TDD required; ensure tests fail before implementing)
3. **Implement** the feature or fix
4. **Run tests** locally: `pnpm run test` (coverage must be ≥ 80%)
5. **Lint and format**: `pnpm run lint && pnpm run format`
6. **Commit** and open a PR

## Repository structure

- `apps/studio` — Next.js visual C4 diagram editor
- `packages/core-model` — Semantic architecture model, validation, and diff/patch APIs
- `packages/model-schema` — Canonical JSON schemas for exported model files
- `packages/layout` — Deterministic layout engine and serialization
- `packages/renderer` — PixiJS-based rendering engine for the zoomable architecture map
- `packages/dsl` — Plain-text DSL for authoring and importing architecture models (LLM-ready)
- `services/` — optional backend services _(planned)_
- `tools/` — scripts and developer tooling _(planned)_

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

See `LICENSE`.
