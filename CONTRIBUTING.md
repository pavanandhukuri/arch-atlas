# Contributing to Arch Atlas

Thanks for your interest in contributing!

## Code of Conduct

This project follows `CODE_OF_CONDUCT.md`. By participating, you agree to abide by it.

## Quickstart (development)

### Prerequisites

- Node.js ≥ 20 (LTS)
- pnpm ≥ 8

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests (with coverage)
pnpm run test

# Run linter + type checker
pnpm run lint
pnpm run typecheck
```

### Running tests

```bash
# Run all tests
pnpm run test

# Run tests for a specific package
cd packages/core-model && pnpm run test

# Run tests in watch mode
pnpm run test -- --watch
```

### Code quality gates

- **TDD**: write tests first; ensure they fail before implementing
- **Coverage**: ≥ 80% line/statement/branch/function coverage (enforced in CI)
- **Linting**: ESLint with strict TypeScript rules + package boundary enforcement
- **Type safety**: strict TypeScript with `noUncheckedIndexedAccess` enabled

## How to contribute

- **Search first**: check existing issues and PRs before opening new ones.
- **Open an issue**: for significant changes, propose the approach in an issue first.
- **Small PRs**: keep PRs focused and reviewable.
- **Tests-first**: this repo requires TDD for production code changes.
- **Coverage**: CI is expected to enforce **≥ 80%** coverage for changed project(s).
- **Security**: do not include secrets; treat LLM prompts/outputs as untrusted input.

## Pull request checklist

- [ ] Tests added/updated (and written first for behavior changes)
- [ ] Coverage ≥ 80% (or an explicit, time-bounded exception is documented)
- [ ] Types/lint/format checks pass
- [ ] Docs updated (`README.md` and/or others if user/developer behavior changed)
- [ ] Security considerations noted for sensitive changes

## Reporting security issues

Please do **not** open public issues for security vulnerabilities. See `SECURITY.md`.

