# Quickstart: Semantic Architecture Platform (MVP)

**Feature**: `specs/001-architecture-platform/spec.md`  
**Date**: 2026-01-11

This quickstart documents the expected developer workflow for the MVP. It will be updated as the
monorepo is implemented.

## Prerequisites

- A supported Node.js LTS installed
- `pnpm` installed

## Install dependencies

From repo root:

```bash
pnpm install
```

## Run checks

```bash
pnpm -r lint
pnpm -r test
```

## Coverage gate

CI is expected to enforce **≥ 80%** test coverage for changed projects. Ensure local runs include
coverage and that new code is tested first (TDD).

## Run Studio (planned)

Once `apps/studio` exists:

```bash
pnpm --filter studio dev
```

## Open source docs

If you change developer/user workflows, update:

- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md` (for user-facing changes)

