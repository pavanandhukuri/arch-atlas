# Tasks: Component Analysis by Default

**Input**: Design documents from `/specs/015-component-analysis-default/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required, not optional — Constitution Principle III (TDD, NON-NEGOTIABLE) mandates
test-first development for every production code change in this repo.

> **Rewritten 2026-11-08.** The previous version of this file described the feature's first
> implementation — a third Studio upload slot plus a `FinalizeStep` merge step. That design was
> built, verified working, and then rejected by the user ("I want everything to be a single review
> file"). It was reverted in full. This version describes what was actually built instead: the
> deterministic `import` command (`apps/llm-importer`) folds every repository's components directly
> into `architecture.review.yaml`, and Studio's `buildModel` renders them from that one file — no
> Studio wizard/UI change at all. See `spec.md`'s Clarifications and `research.md`'s note for the
> full account. All tasks below are already complete.

**Organization**: Tasks are grouped by user story. User Story 3 from spec.md was resolved to
"DROPPED (no opt-out)" during clarification — it has no tasks here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2, per spec.md
- Setup, Foundational, and Polish tasks carry no story label

## Path Conventions

Monorepo. This feature touches `apps/llm-importer` (real, if small and deterministic, code
changes — reversing the first design's "zero changes" plan) and `apps/studio`'s model-building
internals (`lib/import/build-model.ts`, `lib/import/parse-review.ts`, `lib/import/types.ts`) —
**zero changes to any Studio wizard component** (`load-step.tsx`, `finalize-step.tsx`,
`import-wizard.tsx`, `import.css` are all back to their pre-feature state).

---

## Phase 1: Setup

**None for this feature.** No new directories, no new config, no new dependencies.

## Phase 2: Foundational

**None for this feature.** No shared infrastructure gates both user stories structurally.

---

## Phase 3: User Story 1 - A developer imports a workspace and gets full detail without a second ask (Priority: P1) 🎯 MVP

**Goal**: The same single import request a developer already makes produces a diagram where every
container already shows its internal components — no separate per-container ask, and no second
file to upload beyond the one review file Studio has always accepted.

**Independent Test**: Run the standard import request against a workspace that's never had
component artifacts before (Bookshop). Confirm every repository gets a `{repo}.components.json`,
`import` folds every one it finds into `architecture.review.yaml`, and uploading just that one
file into Studio produces a diagram with every container already expanded.

### Tests for User Story 1 (written first; confirmed failing, then made to pass)

- [x] T001 [P] [US1] Add failing tests to `apps/llm-importer/test/unit/analysis-store.test.ts` for
      a new `tryReadComponents`/`writeComponents` pair (mirroring the existing
      `tryReadAnalysis`/`writeAnalysis`) — round-trips a valid artifact; reports `missing` when none
      exists; reports `invalid` for malformed JSON and for well-formed JSON failing
      `ComponentAnalysisSchema`; `writeComponents` refuses to persist an invalid artifact
- [x] T002 [P] [US1] Add failing tests to `apps/llm-importer/test/unit/run-import.test.ts` for the
      fold-in itself — a repository with a valid `{repo}.components.json` gets
      `components`/`componentRelationships` on its `repos[]` entry; a repository with none has neither
      field and is not skipped; a malformed components artifact logs a warning and is omitted without
      failing the import; re-running `import` refreshes (not duplicates) a repository's components;
      each repository only ever gets its own file's data, never another repository's
- [x] T003 [P] [US1] Add failing tests to `apps/studio/test/lib/import/parse-review.test.ts` for
      `repos[].components`/`componentRelationships` parsing — parses a valid entry; omits the fields
      when absent; drops a malformed component/relationship entry without failing the whole parse
- [x] T004 [P] [US1] Add failing tests to `apps/studio/test/lib/import/build-model.test.ts` for
      nested component creation — a component element is parented to its matching container; a
      relationship between two components of the same repo is created; every component element gets a
      layout position in the single root view; two repos with a same-named component don't collide;
      a repo with no `components` on its `RepoMeta` adds nothing (regression); a dangling
      `componentRelationships` reference is skipped without throwing

### Implementation for User Story 1

- [x] T005 [US1] Implement `tryReadComponents`/`writeComponents` in
      `apps/llm-importer/src/analysis/analysis-store.ts` (satisfies T001)
- [x] T006 [US1] Extend `RepoMeta` in `apps/llm-importer/src/review/review-file.ts` with new
      `RepoComponent`/`RepoComponentRelationship` types and two optional fields
- [x] T007 [US1] Update `toRepoMeta` and `runImport` in
      `apps/llm-importer/src/analysis/run-import.ts`: read each selected repository's
      `{repo}.components.json` via T005, fold it onto the `RepoMeta` `assembleReviewFile` already
      receives (satisfies T002; depends on T005, T006)
- [x] T008 [P] [US1] Update stale doc comments in `apps/llm-importer/src/cli.ts` and
      `apps/llm-importer/src/analysis/component-analysis.schema.ts` that claimed `import` never reads
      `{repo}.components.json` — it now does
- [x] T009 [US1] Rewrite `plugins/repo-analysis/skills/import/SKILL.md`'s Procedure step 7
      (hand-off): report the single `architecture.review.yaml` path only, no second artifact, no
      `attach-components` call from the agent. Rewrite the retained "Re-running internal structure for
      one repository" section's two branches (re-run `import` wholesale before upload; fall back to
      `attach-components` CLI after a diagram is already finalized). Regenerate
      `plugins/repo-analysis/AGENTS.md` (`pnpm --filter @archatlas/llm-importer sync:agent-kit`)
- [x] T010 [P] [US1] Extend `RepoMeta` in `apps/studio/src/lib/import/types.ts` with the same two
      new types/fields as T006 (field-for-field match, no cross-package import)
- [x] T011 [US1] Extend `apps/studio/src/lib/import/parse-review.ts`'s `repos[]` parsing loop to
      read `components`/`componentRelationships` with the same best-effort tolerance as
      `description`/`technology` (satisfies T003; depends on T010)
- [x] T012 [US1] Extend `apps/studio/src/lib/import/build-model.ts`: for each container-kind
      `ElementConfig`, look up `reviewFile.repos` by `config.name` and, when it has `components`,
      create nested `component`-kind elements (+ relationships) before the existing single
      `computeLayout` call (satisfies T004; depends on T010, T011)
- [x] T013 [P] [US1] Hand-author and commit five `{repo}.components.json` files under
      `examples/bookshop/architecture-output/` (FR-006) — unchanged content from the first design's
      version of this task; still valid input regardless of where the fold-in happens
- [x] T014 [US1] Fix `.gitignore`: remove the rule excluding `examples/*/architecture-output/*.components.json`
      (added during 014, reversed by this feature's FR-006) so T013's fixtures are actually tracked

**Checkpoint**: Running `import import.yaml` against Bookshop folds all five services' components
into the generated `architecture.review.yaml`; uploading just that one file into Studio shows every
container already expanded. Verified end-to-end with an ad-hoc (not committed) test that ran the
real CLI and fed its real output through Studio's actual `parseReviewYaml` → `classifyElements` →
`buildModel` pipeline.

---

## Phase 4: User Story 2 - A maintainer understands and accepts the added cost (Priority: P2)

**Goal**: The agent's own reported progress makes the added internal-structure pass visible per
repository, not a silent doubling of work.

**Independent Test**: Run an import on a multi-repository workspace and read the agent's reported
progress; confirm it names both passes per repository.

### Tests for User Story 2 (written first; confirmed failing, then made to pass)

- [x] T015 [US2] Add a failing test to `apps/llm-importer/test/unit/skill-sample.test.ts` asserting
      `SKILL.md`'s Procedure explicitly describes reporting the external-interface pass and the
      internal-structure pass as two distinguishable steps per repository

### Implementation for User Story 2

- No separate implementation task — T009 (Phase 3) already rewrote the Procedure's framing
  (`Pass 1`/`Pass 2` headings, explicit "report them as two distinguishable steps" instruction)
  that T015 checks. This user story's requirement was carried over unchanged from the first
  design — only the hand-off step (unrelated to this story) differs.

**Checkpoint**: The same `SKILL.md` wording satisfies both the US1 and US2 assertions in
`skill-sample.test.ts`.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T016 [P] Reword `apps/llm-importer/README.md`'s "Component drill-down" paragraph to describe
      the one-file default (no second upload, no CLI step for the normal case)
- [x] T017 [P] Reword root `README.md`'s "Import a multi-repo workspace" steps 3–4 and the
      Bookshop-demo section back to a one-file story
- [x] T018 [P] Rewrite `CHANGELOG.md`'s 015 entry to describe the real final design
- [x] T019 [P] Rewrite `CLAUDE.md`'s 015 Active Technologies entry to describe the final design and
      the mid-session correction
- [x] T020 Run the full monorepo `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` and confirm
      everything is green
- [x] T021 Manual/ad-hoc regression check: confirm a `RepoMeta` entry with no `components` field
      (every review file written before this feature, or any repository whose internal-structure pass
      hasn't run yet) renders exactly as it did before this feature — proven via a build-model.test.ts
      case, not just assumed
- [x] T022 Manual/ad-hoc end-to-end check: ran `import` against the real Bookshop fixtures, fed the
      real output through Studio's real pipeline, confirmed every one of the five containers gets
      nested, correctly-positioned components from that one file alone; cleaned up the scratch test
      and the gitignored generated review file afterward

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup / Foundational**: empty, no dependencies
- **User Story 1 (Phase 3)**: depends on Setup only — independently mergeable as the MVP
- **User Story 2 (Phase 4)**: depends on T009 (Phase 3) for its one test to pass
- **Polish (Phase 5)**: depends on Phase 3 (and Phase 4)

### Within User Story 1

- T001–T004 (tests) before their corresponding implementation tasks.
- T005 before T007 (reads the artifact T005 defines) and before T006 isn't a hard dependency, but
  T007 depends on both T005 and T006.
- T010 before T011 (parsing needs the type) and before T012 (build-model needs the type via
  `WizardState`/`ReviewFile`'s `repos[]`).
- T011 before T012 is not a strict runtime dependency (buildModel reads `state.reviewFile` however
  it got there) but was done in that order for test clarity.
- T013/T014 have no code dependency — pure data + config, done any time.

### Parallel Opportunities

- T001–T004 (all four test tasks) in parallel — different files, no interdependency.
- T006 and T010 in parallel — different packages, independently defined types.
- T008 in parallel with everything — doc comments only.
- T013/T014 in parallel with all code tasks.
- T016–T019 (Polish docs) in parallel with each other.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 3: User Story 1 — the default behavior itself, folded into the one review file, Bookshop
   fixtures.
2. **STOP and VALIDATE**: the Bookshop quickstart produces a fully-expanded diagram from one
   uploaded file; a `repos[]` entry with no components reproduces today's diagram exactly.
3. This is a complete, mergeable PR on its own.

### Incremental Delivery

1. User Story 1 → merge (the actual feature).
2. User Story 2's one test (T015) was written and merged alongside User Story 1's work, since it
   checks wording T009 already wrote.
3. Polish last.

---

## Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- `apps/studio`'s wizard **components** (`load-step.tsx`, `finalize-step.tsx`,
  `import-wizard.tsx`, `import.css`) are untouched by the final design — if a future task seems to
  require touching any of them for this feature, stop and reconsider; research.md #2 established
  that none of them need to change.
- User Story 3 from spec.md ("someone who wants the opt-out back") was resolved to DROPPED during
  clarification and has no tasks here — don't add an opt-out setting.
- This file's previous version (the Studio-upload-slot design) is not preserved here; see git
  history on this branch for that version, and `spec.md`'s Clarifications for why it was replaced.
