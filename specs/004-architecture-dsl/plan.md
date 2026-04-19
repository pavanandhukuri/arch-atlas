# Implementation Plan: Architecture DSL Module

**Branch**: `004-architecture-dsl` | **Date**: 2026-04-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-architecture-dsl/spec.md`

## Summary

Implement `@arch-atlas/dsl` — a standalone TypeScript package in the monorepo that exposes a `parse(dsl: string) → ParseResult` function and a `serialize(model: ArchitectureModel) → string` function. The DSL is a brace-delimited, block-structured plain-text format (similar in spirit to Structurizr DSL) that fully describes one `ArchitectureModel`. The parser is a custom two-pass recursive-descent implementation: a lexer tokenises the text, a parser builds an AST, and a resolver resolves names to ids and enforces referential integrity. The serializer performs the inverse transformation.

## Technical Context

**Language/Version**: TypeScript 5.3.0 (strict mode, `noUncheckedIndexedAccess`, ES2022 target)
**Primary Dependencies**: `@arch-atlas/core-model` (workspace dep, types only — no runtime coupling)
**Storage**: N/A — pure in-memory transformation library
**Testing**: Vitest 1.x + `@vitest/coverage-v8` (≥ 80% coverage required by constitution)
**Target Platform**: Node ≥ 20 + browser (CommonJS + ESM dual build via `tsc`)
**Project Type**: Library (new package `packages/dsl/`)
**Performance Goals**: Parse a 200-element, 300-relationship DSL document in < 100 ms on commodity hardware
**Constraints**: Zero runtime dependencies beyond `@arch-atlas/core-model`; no eval; no I/O
**Scale/Scope**: Documents up to ~1000 elements and ~2000 relationships; single model per document

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status  | Notes                                                                                |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------ |
| I. Monorepo boundaries               | ✅ Pass | New `packages/dsl/` with clean entrypoint; no cross-boundary internal imports        |
| II. Type safety & explicit contracts | ✅ Pass | All DSL types are explicitly typed; `ParseResult` is a discriminated union; no `any` |
| III. TDD (non-negotiable)            | ✅ Pass | Tests written first per constitution; Vitest; ≥ 80% coverage gate                    |
| IV. Security & privacy               | ✅ Pass | Pure text transformation; no I/O, no eval, no secrets; untrusted DSL input validated |
| V. Latest versions & supply-chain    | ✅ Pass | Inherits root lockfile; zero new prod dependencies beyond workspace package          |

No violations. No complexity-tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/004-architecture-dsl/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── public-api.md    # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/dsl/
├── src/
│   ├── index.ts         # Public API — re-exports parse, serialize, and all public types
│   ├── types.ts         # ParseResult, ParseError, DslParseSuccess, DslParseFailure
│   ├── lexer.ts         # Tokeniser: DSL text → Token[]
│   ├── parser.ts        # Recursive-descent: Token[] → DslAst
│   ├── resolver.ts      # DslAst → ArchitectureModel (name→id resolution, ref checks, id generation)
│   └── serializer.ts    # ArchitectureModel → DSL text
├── test/
│   ├── lexer.test.ts
│   ├── parser.test.ts
│   ├── resolver.test.ts
│   ├── serializer.test.ts
│   └── roundtrip.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**Structure Decision**: Single-package library (Option 1). Follows the pattern of `@arch-atlas/core-model`. Four internal modules (lexer → parser → resolver → serializer) are implementation details; only `index.ts` is the public boundary.
