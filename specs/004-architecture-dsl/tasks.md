# Tasks: Architecture DSL Module

**Input**: Design documents from `/specs/004-architecture-dsl/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: Included — constitution mandates TDD (write test → confirm fail → implement → refactor)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are relative to the monorepo root

---

## Phase 1: Setup

**Purpose**: Initialize the `@arch-atlas/dsl` package in the monorepo

- [x] T001 Create directory `packages/dsl/src/` and `packages/dsl/test/`
- [x] T002 Create `packages/dsl/package.json` — name `@arch-atlas/dsl`, zero prod deps, peer dep `@arch-atlas/core-model`, dev deps matching existing packages (vitest, typescript, @vitest/coverage-v8)
- [x] T003 [P] Create `packages/dsl/tsconfig.json` — extends `../../tsconfig.base.json`, includes `src/` and `test/`
- [x] T004 [P] Create `packages/dsl/vitest.config.ts` — mirrors `packages/core-model/vitest.config.ts` pattern

**Checkpoint**: `pnpm --filter @arch-atlas/dsl test` runs (zero tests pass, no crash)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type definitions that every module and every test depends on. Must be complete before any user story work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Create `packages/dsl/src/types.ts` — define all **public** types: `DslErrorCode` (string literal union, 9 codes from data-model.md), `ParseErrorLocation`, `ParseError`, `DslParseSuccess`, `DslParseFailure`, `ParseResult` (discriminated union)
- [x] T006 [P] Extend `packages/dsl/src/types.ts` — add **internal** AST types: `TokenKind` enum, `Token`, `DslElementNode`, `DslRelationshipNode`, `DslAst` (as non-exported types in the same file)
- [x] T007 Create `packages/dsl/src/index.ts` stub — export `parse` and `serialize` as placeholder throws, export all public types from `types.ts`; package builds without error

**Checkpoint**: `pnpm --filter @arch-atlas/dsl build` succeeds; public types are importable from `@arch-atlas/dsl`

---

## Phase 3: User Story 1 — Author Diagram from Text (Priority: P1) 🎯 MVP

**Goal**: A DSL text document is parsed into a valid, fully-resolved `ArchitectureModel` with structured errors for any invalid input.

**Independent Test**: Feed a DSL string with 3+ elements (including one nested) and 2+ relationships to `parse()`; assert `result.ok === true`, element count, ids, and relationship `sourceId`/`targetId`.

### Tests — Write First (TDD)

- [x] T008 [P] [US1] Create `packages/dsl/test/lexer.test.ts` — unit tests covering: string tokens, IDENT tokens, ARROW, braces/brackets, whitespace skipping, unterminated string error, multi-line input, EOF
- [x] T009 [P] [US1] Create `packages/dsl/test/parser.test.ts` — unit tests covering: single element declaration, nested elements, inline attrs `[key=value]`, relationship declaration, version header, empty document parse structure
- [x] T010 [P] [US1] Create `packages/dsl/test/resolver.test.ts` — unit tests covering: id generation (slug from name), parent-scope id scoping, duplicate name → `DUPLICATE_NAME` error, forward-reference relationship resolution, unresolved reference → `UNRESOLVED_REFERENCE` error, circular parent → `CIRCULAR_PARENT` error, unsupported version → `UNSUPPORTED_VERSION` error, empty document → `EMPTY_DOCUMENT` error
- [x] T011 [P] [US1] Create `packages/dsl/test/parse.test.ts` — integration tests covering all 5 acceptance scenarios from spec.md US1: full parse success, parent-child parentId, relationship id resolution, unknown-ref error with element name in error, model loadable (element + relationship counts correct)

### Implementation — US1

- [x] T012 [US1] Implement `packages/dsl/src/lexer.ts` — `tokenize(input: string): Token[]`; handles all `TokenKind` values; records line/col on each token; throws no exceptions (returns `UNEXPECTED_TOKEN` error token instead)
- [x] T013 [US1] Implement `packages/dsl/src/parser.ts` — `buildAst(tokens: Token[]): DslAst`; recursive-descent; produces `DslAst` with unresolved name strings; records source line on each node; returns structured parse errors collected into result (no throw)
- [x] T014 [US1] Implement id-generation and duplicate-name check in `packages/dsl/src/resolver.ts` — `slugify(name)`, `buildRegistry(ast: DslAst)`, registry maps `scopedName → id`; duplicate detection emits `DUPLICATE_NAME` errors
- [x] T015 [US1] Implement referential integrity and `ArchitectureModel` assembly in `packages/dsl/src/resolver.ts` — `resolve(ast: DslAst): ParseResult`; resolves all relationship source/target names to ids; checks circular parents; assembles final `ArchitectureModel` with correct `schemaVersion`, `metadata`, `elements`, `relationships`, empty `constraints`/`views`
- [x] T016 [US1] Wire `parse(dsl: string): ParseResult` in `packages/dsl/src/index.ts` — calls `tokenize → buildAst → resolve`; all errors bubble as `DslParseFailure`; never throws

**Checkpoint**: `pnpm --filter @arch-atlas/dsl test` — all T008–T011 tests pass; `parse()` integration tests green; coverage ≥ 80%

---

## Phase 4: User Story 2 — Export Existing Diagram as DSL Text (Priority: P2)

**Goal**: Any valid `ArchitectureModel` can be serialized to DSL text that round-trips through `parse()` without data loss.

**Independent Test**: Load a known `.arch.json` fixture, call `serialize(model)`, call `parse(result)`, assert `ok === true` and structural equivalence (same element ids, names, kinds, parentIds, relationship endpoints).

### Tests — Write First (TDD)

- [x] T017 [P] [US2] Create `packages/dsl/test/serializer.test.ts` — unit tests covering: version header emitted, all 6 element kinds serialized with correct keyword, nested elements produce indented blocks, relationships emitted after element tree, inline attrs round-trip, `isExternal=true` serialized, color formatting attrs serialized, model with no relationships serializes cleanly
- [x] T018 [P] [US2] Create `packages/dsl/test/roundtrip.test.ts` — property-style tests covering all 4 acceptance scenarios from spec.md US2: serialize→parse produces equivalent model; model with all 6 kinds round-trips; editing one relationship label changes only that relationship; serializer output is itself valid DSL (passes `parse()` without errors)

### Implementation — US2

- [x] T019 [US2] Implement `packages/dsl/src/serializer.ts` — `serialize(model: ArchitectureModel): string`; depth-first element tree traversal, 2-space indentation, children nested in blocks, relationships emitted after element tree, version `"1"` header always first, attrs serialized as `[key="value"]` pairs, color attrs use `bg`/`border`/`font` keys
- [x] T020 [US2] Wire `serialize(model: ArchitectureModel): string` in `packages/dsl/src/index.ts` — replace stub; ensure `pnpm --filter @arch-atlas/dsl build` still succeeds

**Checkpoint**: `pnpm --filter @arch-atlas/dsl test` — all T017–T018 tests pass; round-trip test passes with real `.arch.json` fixture; coverage ≥ 80%

---

## Phase 5: User Story 3 — LLM-Generated DSL Import (Priority: P3)

**Goal**: DSL produced by an LLM (minor whitespace/casing inconsistencies, missing optional attrs) parses successfully. A compact format-description string is exported so LLM callers can prompt for valid DSL.

**Independent Test**: Construct 5 LLM-style DSL strings with varied casing, extra blank lines, and missing optional attrs; assert all produce `ok === true`. Verify `DSL_FORMAT_DESCRIPTION` is a non-empty string exported from the package.

### Tests — Write First (TDD)

- [x] T021 [P] [US3] Create `packages/dsl/test/llm-robustness.test.ts` — tests covering all 4 acceptance scenarios from spec.md US3: LLM output with no prior context parses or returns actionable errors (no crash); extra whitespace/blank lines tolerated; inconsistent keyword casing (`System` vs `system`) normalised; missing optional attrs produce defaults; `DSL_FORMAT_DESCRIPTION` exports and is a string ≥ 100 chars; `SUPPORTED_DSL_VERSION` exports as `"1"`

### Implementation — US3

- [x] T022 [US3] Harden `packages/dsl/src/lexer.ts` — case-insensitive keyword normalisation for element kinds and boolean attr values; skip blank lines and comment lines starting with `#`
- [x] T023 [US3] Create `packages/dsl/src/constants.ts` — `SUPPORTED_DSL_VERSION = "1"` and `DSL_FORMAT_DESCRIPTION` (≤ 20-line plain-text format description suitable for LLM system prompts; covers element kinds, inline attr syntax, relationship syntax, version header)
- [x] T024 [US3] Export `DSL_FORMAT_DESCRIPTION` and `SUPPORTED_DSL_VERSION` from `packages/dsl/src/index.ts`

**Checkpoint**: `pnpm --filter @arch-atlas/dsl test` — all T021 tests pass; full suite green; coverage ≥ 80%

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, coverage gate, integration with existing monorepo, and documentation.

- [x] T025 Run `pnpm --filter @arch-atlas/dsl test -- --coverage` and confirm line coverage ≥ 80% for all source files in `packages/dsl/src/`
- [x] T026 [P] Run `pnpm --filter @arch-atlas/dsl build` and verify `packages/dsl/dist/index.js` and `packages/dsl/dist/index.d.ts` are emitted correctly
- [x] T027 [P] Validate every code example in `specs/004-architecture-dsl/quickstart.md` parses or serializes without error using the built package
- [x] T028 [P] Add `@arch-atlas/dsl` to `pnpm-workspace.yaml` packages glob (if not already covered by `packages/*`) and verify `turbo run build` includes the new package
- [x] T029 Run `npm test && npm run lint` from repo root to confirm no regressions across the monorepo

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — MVP deliverable
- **Phase 4 (US2)**: Depends on Phase 2 — can start in parallel with Phase 3 after Phase 2
- **Phase 5 (US3)**: Depends on Phase 3 (uses `parse()`) and Phase 4 (uses `serialize()`)
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 only. No dependency on US2 or US3.
- **US2 (P2)**: Requires Phase 2 only. No dependency on US1 (serializer is independent of parser).
- **US3 (P3)**: Requires US1 complete (exercises `parse()`); benefits from US2 (round-trip test uses `serialize()`).

### Within Each User Story (TDD Order)

1. Write tests — confirm they fail (no implementation yet)
2. Implement module(s)
3. Confirm tests pass
4. Refactor if needed — re-confirm tests still pass
5. Check coverage gate ≥ 80%

### Parallel Opportunities

- T003 and T004 (tsconfig + vitest config) — parallel
- T005 and T006 (public types + internal AST types) — parallel after T001
- T008, T009, T010, T011 (all US1 test files) — parallel after T007
- T017, T018 (US2 test files) — parallel after T007; can be written concurrently with US1 implementation
- T019 (serializer impl) — parallel with T012–T015 (parser pipeline); different files, no dependency
- T025, T026, T027, T028 (polish) — parallel after all story phases complete

---

## Parallel Example: User Story 1

```
# Write all US1 test files together (after T007):
Task T008: packages/dsl/test/lexer.test.ts
Task T009: packages/dsl/test/parser.test.ts
Task T010: packages/dsl/test/resolver.test.ts
Task T011: packages/dsl/test/parse.test.ts

# Implement pipeline sequentially (each step feeds the next):
Task T012: src/lexer.ts       (tokenize)
Task T013: src/parser.ts      (buildAst)     ← depends on T012
Task T014: src/resolver.ts    (buildRegistry) ← depends on T013
Task T015: src/resolver.ts    (resolve)       ← depends on T014
Task T016: src/index.ts       (parse())       ← depends on T015
```

## Parallel Example: User Story 2 (alongside US1)

```
# US2 tests can be written in parallel with US1 implementation:
Task T017: packages/dsl/test/serializer.test.ts  ← parallel with T012–T015
Task T018: packages/dsl/test/roundtrip.test.ts   ← parallel with T012–T015

# Serializer implementation is fully independent of parser:
Task T019: src/serializer.ts  ← parallel with T012–T016
Task T020: src/index.ts       ← after T016 and T019 both complete
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational types
3. Complete Phase 3: `parse()` function end-to-end
4. **STOP and VALIDATE**: Feed a hand-authored DSL string → assert valid `ArchitectureModel`
5. Ship `parse()` for integration testing with studio

### Incremental Delivery

1. Setup + Foundational → types importable
2. US1 complete → `parse()` ships (unblocks LLM importer spike)
3. US2 complete → `serialize()` ships (enables round-trip workflows)
4. US3 complete → `DSL_FORMAT_DESCRIPTION` ships (enables LLM prompt injection)
5. Polish → package published to workspace consumers

### Parallel Team Strategy

With two developers:

- Dev A: Phase 3 (US1 — parser pipeline)
- Dev B: Phase 4 (US2 — serializer) — fully independent of parser internals

---

## Notes

- `[P]` tasks operate on different files and have no incomplete-task dependencies
- Constitution mandates TDD: always write the test first and confirm it fails
- Coverage gate is ≥ 80% (constitution §Development Workflow)
- Zero prod dependencies — if a task tempts you to add one, check the research.md rationale first
- Commit after each phase checkpoint passes
- The `DSL_FORMAT_DESCRIPTION` constant is the bridge to the future LLM importer feature
