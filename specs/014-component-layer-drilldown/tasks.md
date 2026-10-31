# Tasks: Component-Layer Drill-Down

**Input**: Design documents from `/specs/014-component-layer-drilldown/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required, not optional — Constitution Principle III (TDD, NON-NEGOTIABLE) mandates
test-first development for every production code change in this repo. Every implementation task
below has a corresponding test task that precedes it and must fail first.

**Organization**: Tasks are grouped by user story (spec.md priorities). User Story 1 is the
eval-first gate (FR-006): nothing in User Story 2 may be implemented before User Story 1's
checkpoint is merged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4, per spec.md
- Setup, and Polish tasks carry no story label

## Path Conventions

Monorepo, three existing packages touched: `apps/llm-importer/`, `apps/studio/`,
`plugins/repo-analysis/`. No new package. Paths below are exact, taken from plan.md's Project
Structure.

---

## Phase 1: Setup

**Purpose**: Scaffolding only — no behavior yet.

- [x] T001 [P] Create `apps/llm-importer/eval/golden-components/catalog-service/` and
      `apps/llm-importer/eval/golden-components/order-service/` directories (empty at this point —
      populated in User Story 1)
- [x] T002 [P] Add the `"eval:components": "tsx eval/component-run.ts"` script to
      `apps/llm-importer/package.json`'s `scripts` block

---

## Phase 2: Foundational

**None for this feature.** There is no shared infrastructure beyond what User Story 1 itself
builds — the eval harness _is_ the foundation the spec requires to exist before anything else
(FR-006), and it is deliberately scoped as User Story 1 below rather than a separate phase, per
plan.md's Phase 2 (Tasks) framing. Proceed directly to Phase 3.

---

## Phase 3: User Story 1 - A contributor can score component-extraction quality before any extraction exists (Priority: P1) 🎯 MVP

**Goal**: `eval:components` exists, runs in CI, and scores two independent hand-authored golden
datasets — before any component-extraction procedure exists anywhere in the repo.

**Independent Test**: With no producer skill written yet, run `eval:components`; it reports a
non-trivial score (not a crash) for both golden datasets against their hand-authored ground truth.

### Tests for User Story 1 (write first; confirm they fail)

- [x] T003 [P] [US1] Add failing tests for `scoreComponents`/`scoreRelationships` to
      `apps/llm-importer/eval/score.test.ts` — exact-match (all metrics 1.0), 1-TP/1-FP/1-FN (all
      metrics 0.5), empty-predicted-and-empty-expected (well-defined, no divide-by-zero), and a
      relationship with reversed source/target direction (must NOT match)
- [x] T004 [P] [US1] Add failing tests to new file
      `apps/llm-importer/test/unit/component-analysis-schema.test.ts` (actual path — matches the
      project's existing `test/unit/repo-analysis-schema.test.ts` convention rather than this task's
      original colocated-path guess) — a fully valid artifact parses; a missing required field fails;
      `analysisStatus: "partial"` is valid; empty `components` and `relationships` arrays are valid; a
      `relationships[].source` or `.target` naming a component not present in `components` fails
- [x] T005 [US1] Add a failing integration test to new file
      `apps/llm-importer/eval/component-run.integration.test.ts` asserting the exact
      components/relationships precision-recall-F1 numbers `component-run.ts` should produce for both
      committed golden datasets (numbers to be filled in once T012/T013's deliberately-imperfect
      artifacts are authored — write the test against the planned ground truth now, update the literal
      expected numbers in the same commit as T012/T013)

### Implementation for User Story 1

- [x] T006 [P] [US1] Implement `ComponentAnalysisSchema` (zod) in new file
      `apps/llm-importer/src/analysis/component-analysis.schema.ts` per data-model.md's
      `ComponentAnalysis` shape (satisfies T004)
- [x] T007 [P] [US1] Implement `scoreComponents(predicted, expected)` and
      `scoreRelationships(predicted, expected)` in `apps/llm-importer/eval/score.ts`, both built on the
      existing `prf()` + `nameMatch()`/`normalize()` (satisfies T003) — per research.md #6
- [x] T008 [P] [US1] Create new file `apps/llm-importer/eval/component-types.ts` with
      `ComponentGroundTruth`, `ComponentEvalConfig`, `ComponentPrfLite`, `ComponentBaseline`,
      `ComponentReport` per data-model.md
- [x] T009 [US1] Create new file `apps/llm-importer/eval/component-schema.ts` — zod validation for
      a golden-components set's `eval.config.yaml` and `ground-truth.json` (depends on T008)
- [x] T010 [US1] Create new file `apps/llm-importer/eval/component-load.ts` — reads one
      golden-components set (config → its committed `{repo}.components.json` → ground truth) (depends
      on T009)
- [x] T011 [US1] Create new file `apps/llm-importer/eval/component-run.ts` — `report` /
      `--check` / `--update-baseline` modes, mirroring `apps/llm-importer/eval/run.ts`'s structure and
      exit codes exactly (depends on T007, T010)
- [x] T012 [P] [US1] Author `apps/llm-importer/eval/golden-components/catalog-service/
eval.config.yaml`, `ground-truth.json`, and `catalog-service.components.json` by reading
      `examples/bookshop/repos/catalog-service` — ground truth is the maintainer's honest read of the
      real source; the `.components.json` is deliberately imperfect (omits `CoverStorage` entirely,
      reverses the `BookController -> BookRepository` edge) per research.md #5
- [x] T013 [P] [US1] Author `apps/llm-importer/eval/golden-components/order-service/
eval.config.yaml`, `ground-truth.json`, and `order-service.components.json` by reading
      `examples/bookshop/repos/order-service` (omits `EventPublisher` entirely, reverses the
      `OrderHandler -> PaymentProcessor` edge)
- [x] T014 [US1] Ran `pnpm --filter @archatlas/llm-importer run eval:components -- --update-baseline`
      and committed the generated `apps/llm-importer/eval/component-baseline.json`; T005's expected
      numbers were derived from and match this run exactly (catalog-service: components P1.0/R0.667/F0.8,
      relationships P0/R0/F0; order-service: components P1.0/R0.8/F0.889, relationships
      P0.667/R0.5/F0.571)
- [x] T015 [US1] Added the
      `pnpm --filter @archatlas/llm-importer eval:components -- --check` step to
      `.github/workflows/ci.yml`, immediately after the existing `eval -- --check` step
- [x] T016 [P] [US1] Added a "## Component eval" section to `apps/llm-importer/eval/README.md`
      documenting `eval:components`'s three modes and the golden-components sets; also fixed three
      now-stale sentences in that file claiming the correlation eval "never runs in CI" (it does, as of
      this session's earlier launch-readiness work)

**Checkpoint**: `eval:components -- --check` is green in CI. No component-extraction procedure
exists anywhere in the repo yet. This is mergeable on its own — merge here before Phase 4.

---

## Phase 4: User Story 2 - A developer drills into one container's internal structure (Priority: P2)

**Goal**: A developer can request, produce, and self-validate a `{repo}.components.json` for
exactly one repository, with zero effect on the bulk `import` command.

**Independent Test**: Run `gather-context --repos <name>` (unchanged), follow the skill's new mode
with a coding agent, run `validate-components` on the result, confirm it's accepted; confirm
`import`'s output for the same workspace is byte-identical before and after.

### Tests for User Story 2 (write first; confirm they fail)

- [x] T017 [P] [US2] Add failing tests for the new `validate-components <file>` subcommand to
      `apps/llm-importer/test/unit/cli.test.ts` — a schema-valid file exits 0 and prints "valid: …"; a
      schema-invalid file exits 1 and names the offending field; a missing file exits 1; malformed JSON
      exits 1

### Implementation for User Story 2

- [x] T018 [US2] Implement the `validate-components <file>` subcommand in
      `apps/llm-importer/src/cli.ts`, parsing against `ComponentAnalysisSchema` from T006 (satisfies
      T017)
- [x] T019 [US2] Add a "## Component drill-down (optional)" section to
      `plugins/repo-analysis/skills/import/SKILL.md`: same `{repo}.context.json` input as the existing
      mode, writes `{outDir}/{repoName}.components.json` per the shape in
      `specs/014-component-layer-drilldown/contracts/components-artifact-schema.md`, and calls
      `validate-components` as its own "Validate" step (no new skill directory — per research.md #3)
- [x] T020 [P] [US2] Add a worked example file
      `plugins/repo-analysis/skills/import/sample-components.json`, mirroring the existing
      `sample-analysis.json`'s role for the original mode
- [x] T021 [US2] End-to-end verification against both golden repos: ran
      `gather-context --repos catalog-service,order-service` against the real
      `examples/bookshop/import.yaml`, followed the new skill section myself against the generated
      `{repo}.context.json` bundles, confirmed `validate-components` accepted both results (exit 0).
      The real output read from the same source matched the hand-authored ground truth exactly (not
      surprising, same analyst/source) — per this task's own instruction, the committed
      deliberately-imperfect `golden-components/` stand-ins were left untouched (they exist to prove
      the harness discriminates, not to track current extraction quality). Confirmed via `git status`
      that `examples/bookshop/architecture-output/` was unaffected (all work done in a scratch dir).

**Checkpoint**: The opt-in request path works end to end against both golden repos, and
`import`/`gather-context` are provably unaffected (FR-010, FR-013).

---

## Phase 5: User Story 3 - A developer sees a container's internals as a nested diagram (Priority: P2)

**SUPERSEDED mid-implementation.** The original plan below (T022–T027, a Studio file-upload
"attach" action) was fully built, then the user clarified they want exactly one persisted file,
start to finish — no second Studio-facing artifact. What actually shipped instead:

- Built and then **fully reverted** `apps/studio/src/lib/import/parse-components.ts`,
  `apps/studio/src/services/attach-components.ts`, their tests, and all UI wiring through
  `ElementEditor.tsx` → `StudioSidebarPanel.tsx` → `studio-page.tsx` →
  `useDiagramEditorState.ts`. `git checkout` on the five tracked files + `rm` on the four new ones;
  confirmed clean (`apps/studio` back to 53 test files / 516 tests, its exact pre-Phase-5 baseline).
- Built instead, in `apps/llm-importer`:
  - `src/arch/attach-components.ts` — the same merge algorithm (bounded components/relationships →
    `component`-kind `Element`s with `parentId` = container, `Relationship`s, recomputed layout via
    `@archatlas/layout`'s `computeLayout`), adapted to look up the container **by name** (a CLI
    argument) rather than by an id a browser UI would have had on hand, with tests in
    `test/unit/attach-components.test.ts` (9 tests, including one specifically asserting every new
    component gets a layout node — the silent-invisibility risk this redesign exists to avoid).
  - A new `attach-components <arch-file> <components-file> --container <name>` CLI subcommand
    (`runAttachComponentsCommand` in `src/cli.ts`) that reads both files, validates the components
    file against `ComponentAnalysisSchema`, merges, and writes the result back to `<arch-file>` in
    place (or `--output <file>` instead) — tests in `test/unit/cli.test.ts` (5 new tests: success,
    `--output`, missing container, invalid components file, invalid arch file).
  - Updated `plugins/repo-analysis/skills/import/SKILL.md`'s "Component drill-down" section:
    the agent now runs `attach-components` itself as its final step instead of "report the file
    back, a human attaches it in Studio." Regenerated `AGENTS.md` (`sync:agent-kit`).
  - Updated `apps/llm-importer/README.md` and `CHANGELOG.md` to describe the CLI merge, not a
    Studio upload action.
- `@archatlas/core-model` and `@archatlas/layout` turned out to already be declared (but entirely
  unused) dependencies of `apps/llm-importer` — confirmed by grep before use, so this still adds
  **zero new dependencies**, matching the original plan's constraint even though the mechanism
  moved packages.
- Manually smoke-tested the real CLI end-to-end against a scratch `.arch.json` and one of the
  golden-components artifacts: components appeared with real `x`/`y` positions, the relationship
  was wired correctly, and the file was edited in place — exactly the acceptance scenario SC-004
  now describes.

**Checkpoint**: One file (`.arch.json`) holds the diagram before and after. No Studio code change.
Zero visual/browser verification was possible or needed here, since Studio itself is untouched.

<details>
<summary>Original plan (superseded — kept for the record, not followed)</summary>

**Goal**: A developer can attach a `{repo}.components.json` to one container in an already-loaded
Studio diagram and see it rendered nested inside that container, persisted across reload.

**Independent Test**: Load a diagram with two containers; attach an artifact to one; confirm only
that one gains the nested view, the import wizard is untouched, and the attachment survives a
reload.

### Tests for User Story 3 (write first; confirm they fail)

- T022 [P] [US3] Add failing tests to new file `apps/studio/.../parse-components.test.ts`
- T023 [P] [US3] Add failing tests to new file `apps/studio/.../attach-components.test.ts`

### Implementation for User Story 3

- T024 [US3] Implement `apps/studio/src/lib/import/parse-components.ts`
- T025 [US3] Implement `apps/studio/src/services/attach-components.ts`
- T026 [US3] Wire "Attach internal components…" into `StudioSidebarPanel.tsx`
- T027 [US3] Manual verification per quickstart.md's "attach" walkthrough

</details>

---

## Phase 6: User Story 4 - A maintainer improves the extraction procedure using the eval's feedback (Priority: P3)

**Goal**: Demonstrate that the eval harness built in User Story 1 actually supports the
iterate-and-regress-check loop the whole feature exists to enable.

**Independent Test**: Deliberately omit a known component from a golden dataset's artifact, observe
recall drop; restore it, observe recall return to baseline.

- [x] T028 [US4] Temporarily removed `BookRepository` (and its relationship) from
      `catalog-service.components.json`, ran `eval:components -- --set catalog-service`: recall dropped
      0.667 → 0.333, f1 0.800 → 0.500 (SC-003 confirmed). `eval:components -- --check` correctly
      reported it as a regression (exit 1, naming the metric and delta). Restored the file from a
      backup copy (the file is new/untracked on this branch, so `git checkout` had nothing to restore
      from — used a manual backup/restore instead) and re-ran `--check`: back to baseline exactly, exit 0. No permanent change to the committed artifact.

**Checkpoint**: All four user stories are independently demonstrated.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T029 [P] Added a "Component drill-down" paragraph to `apps/llm-importer/README.md`'s "Set up
      your coding agent" section, plus updated the "## Eval" section to cover the new `eval:components`
      harness and its CI gate (that paragraph was also stale re: the correlation eval's own CI status —
      fixed alongside it)
- [x] T030 [P] Skipped per this task's own escape hatch: root `README.md`'s repository-structure
      listing is a one-liner per directory with no other sub-feature called out anywhere in it (no
      mention of `eval`, `init`, or any other CLI command for any package) — adding one here would be
      inconsistent with every sibling entry's brevity
- [x] T031 [P] Added a `CHANGELOG.md` entry under "## Unreleased" for the component-layer
      drill-down, matching the existing entries' heading + bullet style
- [x] T032 Ran `npm pack --dry-run` for `apps/llm-importer`: 129 files, no `eval/` entry anywhere
      (grep for "eval"/"golden" over the file list returned nothing)
- [x] T033 Ran the full monorepo `pnpm run lint` (10/10), `pnpm run typecheck` (15/15, including a
      successful Next.js production build), and `pnpm run test` (10/10 task, llm-importer 390/390,
      studio 535/535) — all green
- [x] T034 `pnpm --filter @archatlas/llm-importer run eval -- --check` still passes unchanged
      (connections and externalSystems both still precision/recall/f1 = 1.000, same as before this
      feature). `git status` confirms zero changes to any file under `src/correlate/`, `src/review/`,
      or `src/analysis/run-import.ts` (FR-013 by construction, not just by test). Ran `import
import.yaml` against the real Bookshop workspace twice in a row: the two
      `architecture.review.yaml` outputs are byte-identical except for `generated_at` (which has always
      varied run-to-run — not a regression), confirming SC-005.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: empty for this feature — see note above
- **User Story 1 (Phase 3)**: depends on Setup; **blocks** User Stories 2 and 3 per FR-006 — its
  checkpoint must be merged first
- **User Story 2 (Phase 4)**: depends on User Story 1's checkpoint (needs `ComponentAnalysisSchema`
  from T006 and the merged eval harness to score against later)
- **User Story 3 (Phase 5)**: depends on User Story 1's checkpoint only (needs the artifact shape
  from data-model.md/contracts, which US1 already fixes via T006); does **not** depend on User
  Story 2 — Phase 5 can be implemented and tested with a hand-crafted `.components.json` fixture
  without waiting for the real skill to exist
- **User Story 4 (Phase 6)**: depends on User Story 1's checkpoint only
- **Polish (Phase 7)**: depends on whichever of Phases 4–6 are in scope for this release

### User Story Independence

- US2 and US3 do **not** depend on each other and can be built in parallel once US1's checkpoint
  lands — US3's tests use a hand-authored fixture artifact, not US2's actual CLI output.
- US4 only exercises what US1 already built; it has no code dependency on US2 or US3.

### Within Each User Story

- Tests are written first and confirmed to fail before the corresponding implementation task.
- Schema/types before functions that validate against them.
- Scoring primitives (T007) before the runner that calls them (T011).
- Golden-dataset content (T012/T013) before the baseline that's generated from it (T014).

### Parallel Opportunities

- T001, T002 (Setup) in parallel.
- T003, T004, T005 (US1 tests) in parallel — different files, none depend on each other.
- T006, T007, T008 (US1 implementation) in parallel — different files, no interdependency.
- T012, T013 (the two golden datasets) in parallel — disjoint directories.
- T022, T023 (US3 tests) in parallel.
- Once US1's checkpoint lands, US2's and US3's entire phases can proceed in parallel (different
  packages: `apps/llm-importer`/`plugins/repo-analysis` vs. `apps/studio`).

---

## Parallel Example: User Story 1

```bash
# Tests, together:
Task: "Add failing tests for scoreComponents/scoreRelationships in apps/llm-importer/eval/score.test.ts"
Task: "Add failing tests in apps/llm-importer/src/analysis/component-analysis.schema.test.ts"
Task: "Add failing integration test in apps/llm-importer/eval/component-run.integration.test.ts"

# Implementation, together:
Task: "Implement ComponentAnalysisSchema in apps/llm-importer/src/analysis/component-analysis.schema.ts"
Task: "Implement scoreComponents/scoreRelationships in apps/llm-importer/eval/score.ts"
Task: "Create apps/llm-importer/eval/component-types.ts"

# Golden datasets, together:
Task: "Author the catalog-service golden-components dataset"
Task: "Author the order-service golden-components dataset"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup.
2. Phase 3: User Story 1 — the eval harness + both golden datasets, CI-gated.
3. **STOP and VALIDATE**: `eval:components -- --check` is green; no extraction code exists yet.
4. This is a complete, mergeable, independently valuable PR on its own — ship it before writing
   another line of extraction code.

### Incremental Delivery

1. Setup → User Story 1 → merge (the eval-first gate, FR-006).
2. User Story 2 (opt-in request path) and User Story 3 (Studio attach/render) can then proceed in
   parallel, each independently testable and mergeable, since neither depends on the other.
3. User Story 4 is a short demonstration task, not new code — do it whenever, once US1 exists.
4. Polish last.

---

## Notes

- [P] tasks touch different files and have no incomplete-task dependency.
- Every implementation task has a preceding test task; commit the failing test and the passing
  implementation as paired, reviewable changes.
- Stop at each phase checkpoint and validate that story independently before continuing.
- Nothing in this feature touches `packages/core-model`, `packages/renderer`, `packages/layout`, or
  `packages/viewer-components` — if a task seems to require touching one of those, stop and
  reconsider; research.md #1 established that no change there is needed.
