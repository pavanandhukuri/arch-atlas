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

## Repository structure (planned)

- `apps/`: user-facing web applications (C4 editor, viewer, etc.)
- `packages/`: shared libraries (C4 model, renderers, exporters/importers, shared UI)
- `services/`: optional backend services
- `tools/`: scripts and developer tooling

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## License

See `LICENSE`.

