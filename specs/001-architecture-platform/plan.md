# Implementation Plan: Semantic Architecture Platform (MVP)

**Branch**: `001-architecture-platform` | **Date**: 2026-01-11 | **Spec**: `specs/001-architecture-platform/spec.md`
**Input**: Feature specification from `specs/001-architecture-platform/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Deliver an open-source, extensible architecture modeling platform that represents software systems as a
single semantic model and allows users to explore architecture progressively from landscape to code
through a zoomable, interactive map.

This plan implements the **MVP user stories only (US1–US4)**:

- **US1**: semantic C4-inspired model + validation (incl. lightweight “code-level” abstraction)
- **US2**: semantic zoom navigation on a single continuous map with deterministic layout
- **US3**: browser-based Studio as a thin consumer of the core model
- **US4**: file-first import/export with autosave-in-browser and explicit export of a canonical file

Explicitly out of scope for this MVP plan: **US5 (optional add-ons, LLM importer, DSL, optional headless
rendering service)**.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (strict) + Node.js (supported LTS); Python is deferred (non-MVP)  
**Primary Dependencies**: pnpm workspaces, Turborepo; Next.js + React (Studio); PixiJS (map/canvas)  
**Storage**: File-first canonical model (export/import); autosave stored locally in browser while editing  
**Testing**: Unit + integration + e2e; CI enforces ≥ 80% coverage for changed projects  
**Target Platform**: Modern browsers (desktop-first); local developer machine for build/test  
**Project Type**: Monorepo (apps + packages)  
**Performance Goals**: Smooth pan/zoom and semantic zoom transitions on large maps (target “feels instant”)  
**Constraints**: Deterministic layout; strict import; no domain logic in Studio; open-source hygiene required  
**Scale/Scope**: MVP supports “thousands of elements” as an explicit edge case; optimize progressively

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Monorepo boundaries**: MVP uses `apps/studio` + `packages/*`. Studio consumes `packages/*` via
      public entrypoints only (no cross-package deep imports).
- [x] **Contracts at boundaries**: The exported model file is validated against JSON Schema; import is
      strict (reject unknown schema versions/fields). Browser autosave is treated as untrusted input.
- [x] **TDD plan**:
  - Core-model: unit tests for validation rules + diff/patch; schema validation tests
  - Import/export: integration tests for round-trip + strict rejection behavior
  - Studio: e2e test for open/create → autosave → export workflow
- [x] **Security & privacy**: No secrets committed; safe parsing of imported files; safe rendering of
      user-provided text; no outbound data sharing in MVP.
- [x] **Dependency hygiene**: Use lockfiles; keep runtimes supported; automate dependency updates later.
- [x] **Quality gates**: CI runs lint/format/typecheck/tests per package.
- [x] **Coverage gate**: CI enforces **≥ 80%** coverage for changed projects (MVP packages + Studio).
- [x] **Open source readiness**: Root OSS docs exist; as code lands, add per-package README and update
      quickstart + changelog for user-facing changes.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
apps/
└── studio/                       # Browser-based Studio (thin shell over core)

packages/
├── core-model/                   # ArchitectureModel + validation + diff/patch APIs
├── model-schema/                 # Canonical JSON schema(s) for exported model files
├── layout/                       # Deterministic layout engine + layout serialization
└── renderer/                     # PixiJS-based rendering for map (consumes core-model + layout)

docs/
└── (optional later)              # Longer-form docs beyond README/CONTRIBUTING

.github/                          # Issue + PR templates (already created at repo root)

specs/001-architecture-platform/  # Planning/design artifacts for this feature
```

**Structure Decision**: Monorepo with `apps/studio` plus `packages/*` boundaries. The domain model,
schema, layout, and renderer are independently testable packages; Studio depends on them but does not
own domain logic.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
