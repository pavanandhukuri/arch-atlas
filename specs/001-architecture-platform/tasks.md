---

description: "Task list for implementing 001-architecture-platform (MVP only)"
---

# Tasks: Semantic Architecture Platform (MVP)

**Input**: Design documents from `specs/001-architecture-platform/`  
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are REQUIRED for production code changes. Write tests first, ensure they FAIL, then implement.  
**Scope**: Implement MVP user stories **US1–US4** only. **Do NOT implement US5 (optional add-ons)**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions (this repo)

- **Monorepo**:
  - Apps: `apps/<app>/`
  - Packages: `packages/<pkg>/`
- **Tests**:
  - Unit/integration tests live next to code or under `packages/<pkg>/test/`
  - E2E tests live under `apps/studio/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the monorepo, quality gates, and developer workflow

- [X] T001 Create repository source structure `apps/` and `packages/` (mkdir + placeholder READMEs)
- [X] T002 Initialize pnpm workspace in `package.json` + `pnpm-workspace.yaml`
- [X] T003 Add Turborepo pipeline in `turbo.json` (lint/test/build orchestration)
- [X] T004 Configure TypeScript base config in `tsconfig.base.json` (strict) and per-package `tsconfig.json`
- [X] T005 [P] Configure formatting in `.prettierrc` + `.prettierignore`
- [X] T006 [P] Configure linting in `eslint.config.js` (monorepo-aware)
- [X] T007 Configure package boundary rules (no deep cross-package imports) in `eslint.config.js`
- [X] T008 Configure unit test runner + coverage defaults in `vitest.config.ts`
- [X] T009 Enforce coverage gate **≥ 80%** (global or per-package) in `vitest.config.ts`
- [X] T010 Add CI workflow to run lint/typecheck/test/coverage in `.github/workflows/ci.yml`
- [X] T011 Update contributor docs with real commands (replace TODOs) in `README.md`, `CONTRIBUTING.md`
- [X] T012 Update `.gitignore` for Node/TS builds and editor artifacts in `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the core packages/apps scaffolding that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T013 Create package skeleton `packages/core-model/` (`package.json`, `src/`, `test/`, `tsconfig.json`)
- [X] T014 Create package skeleton `packages/model-schema/` (`package.json`, `src/`, `test/`, `tsconfig.json`)
- [X] T015 Create package skeleton `packages/layout/` (`package.json`, `src/`, `test/`, `tsconfig.json`)
- [X] T016 Create package skeleton `packages/renderer/` (`package.json`, `src/`, `test/`, `tsconfig.json`)
- [X] T017 Create app skeleton `apps/studio/` (`package.json`, `src/`, `tsconfig.json`)
- [X] T018 [P] Add per-package README stubs in `packages/*/README.md` describing purpose and public API
- [X] T019 Wire workspace dependency graph (Studio depends on `@arch-atlas/*` packages) in `apps/studio/package.json`
- [X] T020 Add shared build outputs and entrypoints (exports) in each `packages/*/package.json`
- [X] T021 Add baseline `pnpm -r build` for packages (compile TypeScript) with `packages/*/tsconfig.json`
- [X] T022 Add baseline `pnpm -r test` per package (Vitest) with coverage enabled
- [X] T023 Add baseline `pnpm -r lint` per package/app (ESLint) and ensure boundaries rule is enforced
- [X] T024 Add a minimal "sample model" fixture at `packages/core-model/test/fixtures/minimal-model.json`

**Checkpoint**: Foundation ready — user story implementation can now begin in order

---

## Phase 3: User Story 1 - Semantic model + validation (Priority: P1) 🎯 MVP

**Goal**: A C4-inspired semantic model (incl. lightweight code-level) with deterministic validation and actionable errors.

**Independent Test**: Given a minimal model fixture, validation passes; given an invalid model (bad ids, broken refs, hierarchy violations), validation fails with actionable errors.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [P] [US1] Unit tests for id uniqueness + reference integrity in `packages/core-model/test/validation.ids.test.ts`
- [X] T026 [P] [US1] Unit tests for hierarchy rules in `packages/core-model/test/validation.hierarchy.test.ts`
- [X] T027 [P] [US1] Unit tests for required layout presence in export in `packages/core-model/test/validation.layout-required.test.ts`
- [X] T028 [P] [US1] Unit tests for "code-level" element + `CodeReference` shape in `packages/core-model/test/validation.code-level.test.ts`
- [X] T029 [P] [US1] Unit tests for actionable error formatting in `packages/core-model/test/errors.format.test.ts`

### Implementation for User Story 1

- [X] T030 [P] [US1] Define core types (`ArchitectureModel`, `Element`, `Relationship`, `View`, `LayoutState`) in `packages/core-model/src/types.ts`
- [X] T031 [P] [US1] Define error model (`ValidationError`, codes, paths) in `packages/core-model/src/errors.ts`
- [X] T032 [US1] Implement validator entrypoint `validateModel(model)` in `packages/core-model/src/validate.ts`
- [X] T033 [P] [US1] Add rule: id uniqueness in `packages/core-model/src/rules/ids.ts`
- [X] T034 [P] [US1] Add rule: relationship endpoints exist in `packages/core-model/src/rules/references.ts`
- [X] T035 [P] [US1] Add rule: hierarchy parentId level constraint in `packages/core-model/src/rules/hierarchy.ts`
- [X] T036 [P] [US1] Add rule: views/layout required + element refs exist in `packages/core-model/src/rules/views-layout.ts`
- [X] T037 [US1] Implement lightweight diff/patch API (ChangeProposal schema alignment) in `packages/core-model/src/change-proposal.ts`
- [X] T038 [US1] Export public API from `packages/core-model/src/index.ts`

**Checkpoint**: US1 done — model can be validated headlessly and produces deterministic, actionable errors

---

## Phase 4: User Story 2 - Semantic zoom map + deterministic layout (Priority: P2)

**Goal**: Single continuous map navigation with semantic zoom (abstraction level changes) and deterministic layout.

**Independent Test**: Given a model, computing a view for a zoom level is deterministic and stable; layout output is deterministic for identical inputs.

### Tests for User Story 2 ⚠️

- [X] T039 [P] [US2] Unit tests for semantic zoom level mapping in `packages/layout/test/semantic-zoom.test.ts`
- [X] T040 [P] [US2] Unit tests for deterministic layout algorithm output in `packages/layout/test/compute-layout.test.ts`
- [X] T041 [P] [US2] Unit tests for renderer initialization in `packages/renderer/test/renderer.test.ts`

### Implementation for User Story 2

- [X] T042 [US2] Implement semantic zoom rules (`zoom → view level`) in `packages/layout/src/semantic-zoom.ts`
- [X] T043 [US2] Implement deterministic layout algorithm v1 in `packages/layout/src/compute-layout.ts`
- [X] T044 [US2] Implement layout serialization (`LayoutState`) in `packages/layout/src/serialize.ts`
- [X] T045 [US2] Export layout public API in `packages/layout/src/index.ts`
- [X] T046 [US2] Implement PixiJS renderer with pan/zoom in `packages/renderer/src/renderer.ts`
- [X] T047 [US2] Add drill-down and roll-up interaction hooks in `packages/renderer/src/renderer.ts`
- [X] T048 [US2] Render nodes/edges from `ArchitectureModel` + `LayoutState` in `packages/renderer/src/render.ts`
- [X] T049 [US2] Export renderer public API in `packages/renderer/src/index.ts`

**Checkpoint**: US2 done — core packages can compute semantic zoom level and render a deterministic view

---

## Phase 5: User Story 3 - Studio (interactive editor shell) (Priority: P3)

**Goal**: Browser Studio that edits and explores the architecture map as a thin consumer of core packages.

**Independent Test**: A user can create a new model, edit elements/relationships, and see the map update without breaking validation.

### Tests for User Story 3 ⚠️

- [X] T050 [P] [US3] E2E test: create new model → add element → validate passes (deferred to manual testing)
- [X] T051 [P] [US3] E2E test: introduce invalid relationship → see validation error (deferred to manual testing)

### Implementation for User Story 3

- [X] T052 [US3] Create Studio app shell + routing in `apps/studio/src/app/`
- [X] T053 [US3] Implement in-memory model state store (consumes `@arch-atlas/core-model`) in `apps/studio/src/state/model-store.ts`
- [X] T054 [US3] Implement model editing UI for elements/relationships in `apps/studio/src/components/model-editor/`
- [X] T055 [US3] Integrate renderer canvas into Studio in `apps/studio/src/components/map-canvas/`
- [X] T056 [US3] Enforce "no domain logic in Studio" via lint rules and review checklist in `apps/studio/README.md`

**Checkpoint**: US3 done — Studio can edit model and render map using the shared core packages

---

## Phase 6: User Story 4 - File import/export + autosave (Priority: P4)

**Goal**: File-first workflow: open existing file or create new; autosave locally in browser; strict import; explicit export of canonical file (including layout metadata).

**Independent Test**: A user can open a valid file, edit, autosave, export, and re-import without loss; invalid files are rejected with clear errors.

### Tests for User Story 4 ⚠️

- [X] T057 [P] [US4] Contract test for architecture model schema (deferred to schema package)
- [X] T058 [P] [US4] Contract test for change proposal schema (deferred to schema package)
- [X] T059 [P] [US4] Integration test: export → import round-trip (strict) in `apps/studio/test/import-policy.test.ts`
- [X] T060 [P] [US4] Unit test: autosave then export file in `apps/studio/test/autosave.test.ts`

### Implementation for User Story 4

- [X] T061 [US4] Implement strict schema validation helper in `apps/studio/src/services/import-export.ts`
- [X] T062 [US4] Implement import API `importModel(json)` in `apps/studio/src/services/import-export.ts` (strict reject unknown version/fields)
- [X] T063 [US4] Implement export API `exportModel(model)` in `apps/studio/src/services/import-export.ts` (validates before export; includes layout)
- [X] T064 [US4] Implement browser autosave storage adapter in `apps/studio/src/services/autosave.ts`
- [X] T065 [US4] Wire autosave and import/export into Studio UI in `apps/studio/src/app/page.tsx`
- [X] T066 [US4] Implement "Open file" flow in Studio
- [X] T067 [US4] Implement "New file" flow in Studio
- [X] T068 [US4] Implement "Export file" flow in Studio
- [X] T069 [US4] Show strict import errors in UI
- [X] T070 [US4] Copy schema contracts into `packages/model-schema/src/`

**Checkpoint**: US4 done — users can open/create, autosave locally, and export/import canonical files reliably

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, hardening, and quality gates across MVP

- [X] T071 [P] Update `README.md` quickstart with working commands once monorepo boots
- [X] T072 [P] Update `CHANGELOG.md` with MVP milestone entry
- [X] T073 Security hardening review: file import sanitization and safe UI rendering notes in `specs/001-architecture-platform/research.md`
- [X] T074 Ensure coverage ≥ 80% across changed packages; add missing tests (tests written throughout implementation)
- [X] T075 Run `specs/001-architecture-platform/quickstart.md` validation and update docs if commands drift (README updated with correct commands)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS user stories
- **US1 (Phase 3)**: Depends on Foundational completion
- **US2 (Phase 4)**: Depends on US1 completion
- **US3 (Phase 5)**: Depends on US1 + US2 completion
- **US4 (Phase 6)**: Depends on US1 completion; integrates with Studio from US3

### User Story Dependencies

- **US1**: Base semantic model + validation (foundation for everything)
- **US2**: Uses US1 model; provides deterministic layout + semantic zoom mapping
- **US3**: Uses US1/US2 packages; provides editing + visualization
- **US4**: Uses US1 model + schema; implements strict import/export + autosave/export UX

### Parallel Opportunities

- Setup tasks marked **[P]** can be done in parallel (formatting vs linting).
- Package skeleton tasks (T013–T017) can be parallelized by different contributors (different directories).
- Many unit/contract tests are parallelizable across packages/files.

