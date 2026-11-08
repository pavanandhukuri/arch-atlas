# Implementation Plan: Component Analysis by Default

**Branch**: `015-component-analysis-default` | **Date**: 2026-11-01 (rewritten 2026-11-08) | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-component-analysis-default/spec.md`

> **This plan was rewritten after the feature's first implementation was built, verified working,
> and then rejected by the user** ("I want everything to be a single review file"). The original
> plan put the merge in Studio's import wizard (a third upload slot + `FinalizeStep` merge); that
> code was reverted in full. This plan describes what was actually built instead. See `spec.md`'s
> Clarifications and `research.md`'s note for the full account.

## Summary

Make 014's component-level internal-structure analysis unconditional for every repository in a
workspace, folded into the same single import request a developer already makes — no separate
"drill into this container" ask, no opt-out, and (per the 2026-11-08 correction) folded into the
_same single review file_ a developer already uploads into Studio, not a second artifact.
`plugins/repo-analysis/skills/import/SKILL.md`'s main per-repository loop gains the
internal-structure step unconditionally (014's standalone "Component drill-down" mode is retired as
a separate thing to ask for; its content moves into the loop). The deterministic `import` command
(`apps/llm-importer`) now also reads every `{repo}.components.json` it finds and folds each one
directly onto that repository's existing `repos[]` entry in `architecture.review.yaml`
(`RepoMeta`, extended with two new optional fields). Studio's `buildModel` turns that embedded data
into nested `component`-kind elements, in the same single layout pass it already runs per
container — **no Studio wizard/UI change of any kind**, restoring (not superseding) 014's original
guarantee that the wizard accepts exactly one required file. The Bookshop demo gains five committed
component artifacts, verified end-to-end to fold correctly into a real generated review file.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022); Node ≥ 22
(`apps/llm-importer`), Node ≥ 20 (`apps/studio`) — matches monorepo convention
**Primary Dependencies**: none new. `zod` (already a dependency of `apps/llm-importer`, used by
the existing `ComponentAnalysisSchema`) validates every `{repo}.components.json` `import` reads;
`@archatlas/layout`'s `computeLayout` (already a dependency of `apps/studio`) lays out the new
component elements in the single pass `buildModel` already runs.
**Storage**: no new persisted artifact shape. `{repo}.components.json` is unchanged from 014.
`architecture.review.yaml`'s schema gains two new _optional_ fields per `repos[]` entry
(`components`, `componentRelationships`) — additive, so a review file from before this feature
parses exactly as it did before. Five committed demo fixtures under
`examples/bookshop/architecture-output/*.components.json` (unchanged from the original plan).
**Testing**: `vitest` for `apps/llm-importer`'s `analysis-store.ts` (`tryReadComponents`/
`writeComponents`) and `run-import.ts` (the fold-in itself, TDD, 4 new cases); `vitest` for
`apps/studio`'s `parse-review.ts` (parsing the two new fields) and `build-model.ts` (the nested
component creation, 6 new cases) — no new Studio UI test files at all, since no UI changed. An
ad-hoc (not committed) end-to-end check ran the real CLI against the real Bookshop fixtures and fed
the output through Studio's actual parse/classify/build pipeline, confirmed working, then removed.
**Target Platform**: Node CLI (`apps/llm-importer`, unchanged target); browser (Studio, unchanged —
Next.js/React, and in this revision, _entirely unchanged code paths_ for anything UI-facing)
**Project Type**: monorepo feature touching `apps/llm-importer` (real code changes this time —
reversing the original plan's "zero changes" finding) and `apps/studio`'s model-building internals
(not its UI) + `examples/bookshop` (new fixtures, unchanged from the original plan); **zero changes
to `apps/studio`'s wizard components** (`load-step.tsx`, `finalize-step.tsx`, `import-wizard.tsx`,
`import.css` are all back to their pre-feature state)
**Performance Goals**: unaffected — `import`'s added read is one more file stat/read per
repository, the same shape of I/O it already does for `.analysis.json`; `buildModel`'s added
element creation happens before its existing single `computeLayout` call, not a second pass.
**Constraints**: a missing/malformed `{repo}.components.json` never blocks or alters the rest of
`import`'s output (FR-004); the import wizard's upload step is unchanged (FR-012, restored);
`import`/`gather-context`'s own external-interface output stays byte-identical (FR-002, inherited
from 014's FR-010/FR-013 for that command specifically).
**Scale/Scope**: two new functions in `apps/llm-importer` (`tryReadComponents`/`writeComponents`),
one changed function (`toRepoMeta`) and its one call site (`runImport`), two new optional fields on
a type defined in two packages (`RepoMeta`), one changed function in `apps/studio`
(`buildModel`), one changed function in `apps/studio` (`parseReviewYaml`'s `repos[]` loop), one
skill-doc rewording, five demo fixtures (unchanged); no new npm package, no new CLI command, no new
Studio component.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Monorepo boundaries**               | PASS. `RepoMeta`/`RepoComponent`/`RepoComponentRelationship` are independently defined in `apps/llm-importer/src/review/review-file.ts` and `apps/studio/src/lib/import/types.ts` — a deliberate field-for-field port, same convention `review-file.ts`'s own file comment already documents for every other field on that type, not a new cross-package import. Studio still does **not** depend on `@archatlas/llm-importer`. |
| **II. Type safety & explicit contracts** | PASS. `TryReadComponentsResult` makes a missing-vs-invalid components artifact explicit and typed (mirrors `TryReadAnalysisResult`), not a silent boolean/exception.                                                                                                                                                                                                                                                            |
| **III. TDD (NON-NEGOTIABLE)**            | PASS. Every new/changed function — `tryReadComponents`, `writeComponents`, `toRepoMeta`, `runImport`'s new read step, `parseReviewYaml`'s new parsing, `buildModel`'s new fold-in — got failing tests first, confirmed red, then made green. The rejected first design was also fully test-first before being reverted.                                                                                                         |
| **IV. Security & privacy**               | PASS. No new model call anywhere (SKILL.md's extra step runs through the same external-agent boundary spec 010 already established); `import`'s new read is a local file read, same trust boundary as its existing `.analysis.json` read.                                                                                                                                                                                       |
| **V. Latest versions & supply-chain**    | PASS. Zero new dependencies in any touched package.                                                                                                                                                                                                                                                                                                                                                                             |
| **Coverage ≥ 80% (changed files)**       | PASS by design — every new/changed function is small and directly unit-tested; full-suite coverage confirmed well above threshold for both packages.                                                                                                                                                                                                                                                                            |
| **OSS hygiene**                          | `apps/llm-importer/README.md`'s "Component drill-down" paragraph reworded again (default, folded into the one file, not a second upload); root `README.md`'s step 3–4 and Bookshop-demo section reworded back to a one-file story; `CHANGELOG.md`'s 015 entry rewritten to describe the real final design.                                                                                                                      |

No violations → **Complexity Tracking is empty**.

**Post-design re-check (after Phase 1)**: unchanged — the design adds no dependency, no new
cross-package import, and no `core-model` change. All gates still PASS. (The original plan's
post-design re-check also claimed PASS for a design that was subsequently reverted; this one
reflects what was actually shipped and verified.)

## Project Structure

### Documentation (this feature)

```text
specs/015-component-analysis-default/
├── plan.md                    # this file (rewritten 2026-11-08)
├── research.md                # Phase 0 (rewritten) — where the fold-in happens, and why not Studio
├── data-model.md              # Phase 1 (rewritten) — RepoMeta's two new fields, both sides
├── quickstart.md              # Phase 1 (rewritten) — the one-file flow + Bookshop walkthrough
├── contracts/
│   ├── import-cli-contract.md        # (renamed from import-wizard-contract.md) — import's fold-in
│   └── skill-procedure-contract.md   # SKILL.md's default per-repository loop (step 7 reworded)
├── checklists/
│   └── requirements.md        # (from /speckit.specify) — all items pass
└── tasks.md                   # Phase 2 — needs regenerating against this plan
```

### Source Code (repository root)

```text
apps/llm-importer/src/
├── analysis/
│   ├── analysis-store.ts              # + tryReadComponents, writeComponents (mirrors the
│   │                                   #   existing tryReadAnalysis/writeAnalysis pair)
│   ├── run-import.ts                  # runImport calls tryReadComponents per repo; toRepoMeta
│   │                                   #   gains a second (optional) parameter and folds
│   │                                   #   components/componentRelationships onto the RepoMeta
│   │                                   #   it returns
│   └── component-analysis.schema.ts   # doc comment only — no longer claims import never reads it
├── review/review-file.ts              # RepoMeta + new RepoComponent/RepoComponentRelationship
└── cli.ts                             # doc comments only — runValidateComponentsCommand's and the
                                        #   top-of-file command summary's claims updated

apps/llm-importer/test/unit/
├── analysis-store.test.ts             # + 5 cases for tryReadComponents/writeComponents
└── run-import.test.ts                 # + 4 cases for the fold-in (present, absent, malformed,
                                        #   re-run-refreshes, per-repo isolation)

apps/studio/src/lib/import/
├── types.ts                           # RepoMeta + new RepoComponent/RepoComponentRelationship
│                                       #   (field-for-field match of the llm-importer side)
├── parse-review.ts                    # repos[] parsing loop gains components/
│                                       #   componentRelationships, same best-effort tolerance as
│                                       #   description/technology
└── build-model.ts                     # + nested component element/relationship creation, folded
                                        #   into the existing per-container loop and single
                                        #   computeLayout call — no new exported function

apps/studio/test/lib/import/
├── parse-review.test.ts               # + 4 cases for the new fields
└── build-model.test.ts                # + 7 cases for nested component creation

plugins/repo-analysis/skills/import/SKILL.md
                                        # main Procedure's per-repository loop gains the
                                        # internal-structure step unconditionally (step 3); step 7
                                        # (hand-off) reworded to report one file, not two
plugins/repo-analysis/AGENTS.md        # regenerated (pnpm sync:agent-kit) — no manual edits

examples/bookshop/architecture-output/
├── bookshop-web.components.json        # 5 total, hand-authored, verified to fold correctly via
├── api-gateway.components.json         #   a real `import` run against the real fixtures
├── catalog-service.components.json
├── order-service.components.json
└── notification-service.components.json

apps/llm-importer/README.md             # "Component drill-down" paragraph reworded (one file, not
                                         #   a second upload)
README.md                               # step 3–4 and Bookshop-demo section reworded (one file)
CHANGELOG.md                            # 015 entry rewritten
CLAUDE.md                               # 015 Active Technologies entry rewritten

# Explicitly NOT touched by the final design (were touched, then reverted):
# apps/studio/src/components/import/load-step.tsx
# apps/studio/src/components/import/finalize-step.tsx
# apps/studio/src/components/import/import.css
# apps/studio/src/app/import/import-wizard.tsx
# apps/studio/src/lib/import/parse-components.ts      (deleted — never existed in the final design)
# apps/studio/src/services/attach-components.ts       (deleted — never existed in the final design)
```

**Structure Decision**: a two-package feature — real code changes in `apps/llm-importer` (the
fold-in itself) and internal (non-UI) changes in `apps/studio` (`build-model.ts`/`parse-review.ts`/
`types.ts`). Zero changes to any Studio wizard **component**. No new workspace package. Still **not**
introducing a Studio dependency on `@archatlas/llm-importer` — `RepoMeta` and its two new nested
types are independently defined on each side, consistent with 014's own choice and this feature's
own research.md #1.

## Complexity Tracking

_No Constitution Check violations — this section is intentionally empty._

## Phase 0 — Research (`research.md`)

Rewritten 2026-11-08. Summary of the seven decisions: (1) the fold-in happens inside `import`
(`apps/llm-importer`), not Studio; (2) the import wizard needs no UI change at all; (3)
`buildModel` creates nested elements from `reviewFile.repos[].components`, in its existing single
layout pass; (4) validation stays at the artifact level (`ComponentAnalysisSchema`), with the same
best-effort tolerance every other optional `RepoMeta` field already has; (5) `SKILL.md`'s optional
mode's content still moves into the main loop unconditionally, only its final hand-off step's
wording changes; (6) Bookshop's five fixtures are demo-only, now verified end-to-end against a real
generated review file; (7) `apps/llm-importer` **does** get real code changes this time (small,
deterministic, no model call) — reversing the original research's "zero changes" finding.

## Phase 1 — Design & Contracts

- **`data-model.md`** — `RepoMeta`'s two new optional fields (both packages), `tryReadComponents`/
  `writeComponents`, and exactly how `buildModel` turns them into elements.
- **`contracts/import-cli-contract.md`** — (renamed from `import-wizard-contract.md`) `import`'s
  per-repository fold-in table, and `buildModel`'s consumption of the result.
- **`contracts/skill-procedure-contract.md`** — the six-step default per-repository loop; step 7
  (hand-off) rewritten to report one file.
- **`quickstart.md`** — the one-file default flow, plus the Bookshop demo walkthrough, with the
  end-to-end verification note.
- **Agent context update** — `CLAUDE.md`'s 015 entry rewritten to describe the final design and the
  mid-session correction.
- **Re-run Constitution Check** — no change expected from Phase 0; still zero new dependencies, zero
  new cross-package import, zero `core-model` change. All gates PASS.

## Phase 2 — Tasks

`tasks.md` needs regenerating against this plan via `/speckit.tasks` — the existing file describes
the reverted Studio-wizard design and no longer matches what was built. The real implementation
(already complete and verified at the time of this rewrite) breaks down as:

1. **US1 — the default analysis, folded into the one file:**
   - TDD: `analysis-store.test.ts` (`tryReadComponents`/`writeComponents`), then implement.
   - TDD: `run-import.test.ts` (the fold-in itself), then implement `toRepoMeta`/`runImport`.
   - `review-file.ts`: extend `RepoMeta`.
   - Reword `SKILL.md`'s main Procedure + step 7; regenerate `AGENTS.md`.
   - Update doc comments in `cli.ts`/`component-analysis.schema.ts` that claimed `import` never
     reads components.
2. **US1/US2 — Studio renders the embedded data:**
   - `types.ts`: extend `RepoMeta` (Studio's own copy).
   - TDD: `parse-review.test.ts` (the two new fields), then implement.
   - TDD: `build-model.test.ts` (nested component creation, 7 cases), then implement.
3. **FR-006 — Bookshop demo:** five hand-authored `{repo}.components.json` files (unchanged from
   the original plan) — verified end-to-end via a real `import` run + a real Studio pipeline run.
4. **Docs:** `apps/llm-importer/README.md`, root `README.md`, `CHANGELOG.md`, `CLAUDE.md`.
5. **Verify:** full monorepo lint/typecheck/test (all green); `.gitignore` fix so the five Bookshop
   fixtures are actually committed (015 reverses 014's own rule excluding `*.components.json`).
