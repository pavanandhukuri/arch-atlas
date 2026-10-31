# Implementation Plan: Component-Layer Drill-Down

**Branch**: `014-component-layer-drilldown` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-component-layer-drilldown/spec.md`

## Summary

Add one opt-in, per-container extra layer below the importer's existing Container level. Build the
scoring harness and two independent hand-authored golden datasets first (`eval:components`, mirroring
`apps/llm-importer/eval`'s existing `prf()`/`nameMatch()` machinery), before writing any extraction
procedure. The procedure itself is one more optional mode in the existing `plugins/repo-analysis`
skill (not a second skill file, to avoid touching `archatlas init`'s single-skill installer), reusing
`gather-context --repos <name>` unchanged and writing a new `{repo}.components.json` sibling artifact
validated by a new `archatlas validate-components <file>` CLI command. A new
`archatlas attach-components <arch-file> <components-file> --container <name>` CLI command then
merges that artifact directly into the human's existing `.arch.json`, in place — no second
persisted file, no Studio UI. Rendering and zoom need **no new code**, because `core-model`'s
`Element.kind`/`parentId` and Studio's `DiagramLevel`/navigation/zoom stack already treat
`'component'` as a first-class nested level today; the merge command computes a real layout position
for every new element via `@archatlas/layout`'s `computeLayout` (already a declared, previously
unused dependency of `apps/llm-importer`), because a component spliced into `elements` without a
matching layout-node entry renders nothing and nothing flags it — confirmed by inspecting the
renderer directly, not assumed.

**Revision note (post-implementation)**: this plan originally called for a Studio-side upload
action ("attach a `.components.json` to a selected container" in Studio). That was built, then
replaced during implementation once the user clarified they wanted exactly one persisted file,
start to finish — no Studio-facing second artifact at all. The sections below are left largely as
originally written for the parts that didn't change (the eval harness, the schema, the skill mode);
where a section describes the old Studio attach mechanism, treat it as superseded by this note and
by `spec.md`'s own "Post-implementation revision" entry under Clarifications. The actual shipped
mechanism is the CLI merge command described above and in `tasks.md`'s Phase 5 completion notes.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022) across all touched
packages; Node ≥ 22 (`apps/llm-importer`), Node ≥ 20 (`apps/studio`) — matches monorepo convention
**Primary Dependencies**: none new. `zod` (new `ComponentAnalysisSchema`, already a dependency of
`apps/llm-importer`), `commander` (new `validate-components` subcommand, already used), `vitest`
(new unit/integration tests, already used in both touched apps)
**Storage**: a new local-filesystem sibling artifact `{repo}.components.json` next to
`{repo}.analysis.json`; two new dev-only golden datasets under
`apps/llm-importer/eval/golden-components/`; Studio's existing `.arch.json` persistence (local disk or
Google Drive via the existing `StorageProvider`) gains ordinary new `Element`/`Relationship` records —
no schema-version bump, no new persisted field, because `core-model`'s `Element.kind`/`parentId`
already represent a component nested in a container
**Testing**: `vitest` — new schema tests (`component-analysis.schema.test.ts`), new scoring-function
tests (extend `eval/score.test.ts`), a new `eval/component-run.integration.test.ts` against both golden
datasets, a CLI test for `validate-components`, and Studio-side unit tests for the new parser/attach
service
**Target Platform**: unchanged — `apps/llm-importer` runs locally + in CI (Node, no browser);
`apps/studio` runs in the browser (Next.js)
**Project Type**: monorepo feature touching three existing packages (`apps/llm-importer`,
`apps/studio`, `plugins/repo-analysis`); **zero changes to `packages/core-model`** — confirmed by
inspection that `ElementKind`, `Element.parentId`, `DiagramLevel`, `semantic-zoom.ts`, and
`useDiagramNavigation.ts` already handle `'component'` generically today (this is a manual-editing
feature already shipped; the gap is only that nothing ever populates it automatically)
**Performance Goals**: `eval:components` completes in under 10 seconds with no network/model call,
matching the existing correlation eval's SC-001
**Constraints**: `import`/`gather-context` output completely unaffected by this feature (FR-010,
FR-013); nothing under `eval/` ships in the npm tarball (existing `files: ["dist"]` already covers
this — same proof style as 013's SC-005); the import wizard continues to accept exactly one file
**Scale/Scope**: 2 golden component datasets at ship (`catalog-service` — Java/Spring Boot,
`order-service` — TypeScript/Express, both already-committed Bookshop repos); one new CLI subcommand;
one new optional mode in one existing skill file; one new Studio attach action; zero new UI surface
for rendering (already generic)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Monorepo boundaries**               | PASS. New code lands inside existing package boundaries: `apps/llm-importer/src/analysis/` (schema), `apps/llm-importer/src/cli.ts` (subcommand), `apps/llm-importer/eval/` (harness + golden sets), `plugins/repo-analysis/skills/import/SKILL.md` (one more mode, same file), `apps/studio/src/lib/import/` + `apps/studio/src/services/` (parser + attach service). Studio does **not** gain a dependency on `@archatlas/llm-importer` — it keeps its own independent artifact validator, consistent with how `parse-review.ts` already independently validates `review.yaml` without importing the importer package. |
| **II. Type safety & explicit contracts** | PASS. `ComponentAnalysisSchema` (zod) is the explicit contract for `{repo}.components.json` on the importer side; Studio's own parser is the explicit contract at the boundary where it reads an uploaded file — same two-sided-validation pattern the project already uses for `review.yaml`.                                                                                                                                                                                                                                                                                                                           |
| **III. TDD (NON-NEGOTIABLE)**            | PASS, and this feature's whole premise _is_ TDD applied one level up: User Story 1 (the eval harness + 2 golden datasets) is written, tested, and merged before User Story 2's extraction procedure exists — the procedure has no meaning until there is something to fail against. Ordinary unit tests are still written test-first for the schema, CLI command, scoring functions, and Studio parser/attach service.                                                                                                                                                                                                   |
| **IV. Security & privacy**               | PASS. No in-repo code calls a model (the one new extraction mode is, like the existing one, an external agent procedure — spec 010's boundary is unchanged). The Studio attach action is a client-side file read with no new network call. No secrets.                                                                                                                                                                                                                                                                                                                                                                   |
| **V. Latest versions & supply-chain**    | PASS. Zero new dependencies in any touched package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Coverage ≥ 80% (changed files)**       | PASS by design. Every new file (schema, CLI command, scoring functions, Studio parser, Studio attach service) is small and directly unit-tested; the eval's own integration test exercises the CLI + scoring path end-to-end.                                                                                                                                                                                                                                                                                                                                                                                            |
| **OSS hygiene**                          | `plugins/repo-analysis/README.md` and `apps/llm-importer/eval/README.md` gain a short section on the new mode/command; `CHANGELOG.md` gets an entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

No violations → **Complexity Tracking is empty**.

**Post-design re-check (after Phase 1)**: unchanged — the design adds no dependency, no
`packages/core-model` change, and no new cross-package import. All gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/014-component-layer-drilldown/
├── plan.md                    # this file
├── research.md                # Phase 0 — decisions below
├── data-model.md              # Phase 1 — ComponentAnalysis / ground-truth / baseline / report shapes
├── quickstart.md              # Phase 1 — run eval:components; request + attach a component artifact
├── contracts/
│   ├── components-cli-contract.md    # validate-components + eval:components command surface
│   └── components-artifact-schema.md # {repo}.components.json shape, both sides
├── checklists/
│   └── requirements.md        # (from /speckit.specify) — all items pass
└── tasks.md                   # Phase 2 — created by /speckit.tasks, NOT here
```

### Source Code (repository root)

```text
apps/llm-importer/
├── src/analysis/
│   ├── component-analysis.schema.ts     # NEW — ComponentAnalysisSchema (zod), mirrors RepoAnalysisSchema's
│   │                                     #   schemaVersion/analyzedAt/analysisStatus/retryCount + components[]/relationships[]
│   └── component-analysis.schema.test.ts # NEW — valid/invalid fixtures, partial status, empty lists
├── src/cli.ts                            # + `validate-components <file>` subcommand (reads, parses,
│                                          #   prints a clear schema error or "valid", exit 0|1)
├── test/unit/cli.test.ts                 # + tests for the new subcommand
├── eval/
│   ├── score.ts                          # + scoreComponents, scoreRelationships (both call existing
│   │                                     #   prf()/nameMatch() — no new matching primitive)
│   ├── score.test.ts                     # + their unit tests (exact/partial/empty/direction cases)
│   ├── component-types.ts                # NEW — ComponentGroundTruth, ComponentBaseline, ComponentReport
│   ├── component-schema.ts               # NEW — zod for ground-truth.json + eval.config.yaml (component sets)
│   ├── component-load.ts                 # NEW — read a golden-components set (config → components.json → GT)
│   ├── component-run.ts                  # NEW — report | --check | --update-baseline; mirrors run.ts exactly
│   ├── component-run.integration.test.ts # NEW — runs component-run.ts against both committed golden sets
│   ├── component-baseline.json           # NEW — committed; the --check reference
│   └── golden-components/
│       ├── catalog-service/
│       │   ├── eval.config.yaml          # workspace.local → ../../../../../examples/bookshop/repos/catalog-service
│       │   ├── ground-truth.json         # hand-authored expected components + relationships
│       │   └── catalog-service.components.json  # hand-authored, deliberately imperfect (see research.md)
│       └── order-service/
│           ├── eval.config.yaml          # → ../../../../../examples/bookshop/repos/order-service
│           ├── ground-truth.json
│           └── order-service.components.json
├── eval/README.md                        # + "## Component eval" section
├── package.json                          # + script: "eval:components": "tsx eval/component-run.ts"
└── README.md                              # + short pointer

plugins/repo-analysis/skills/import/
└── SKILL.md                              # + one new "## Component drill-down (optional)" section:
                                           #   same {repo}.context.json input, writes {repo}.components.json
                                           #   per the new schema, validates via `validate-components`
                                           #   (no new skill directory — avoids touching agents/kit.ts)

apps/studio/src/lib/import/
├── parse-components.ts                   # NEW — Studio-side validator for an uploaded .components.json
│                                          #   (independent re-implementation, same pattern as parse-review.ts
│                                          #   not importing llm-importer)
└── parse-components.test.ts              # NEW

apps/studio/src/services/
├── attach-components.ts                  # NEW — given a validated artifact + target container Element,
│                                          #   builds component-kind Elements (parentId = container.id) +
│                                          #   Relationships via the EXISTING addElementToModel /
│                                          #   addRelationshipToModel primitives; rejects on repo-name
│                                          #   mismatch (FR-012a)
└── attach-components.test.ts             # NEW

apps/studio/src/components/.../StudioSidebarPanel.tsx   # + one action, visible only when the selected
                                                         #   element's kind === 'container': "Attach
                                                         #   internal components…" → file picker → parse
                                                         #   → attach → existing save/model-store flow
                                                         #   (no new persistence code — reuses the model's
                                                         #   existing autosave path)

.github/workflows/ci.yml                  # + step: pnpm --filter @archatlas/llm-importer eval:components -- --check
CHANGELOG.md                              # + entry
```

**Structure Decision**: no new package. The importer-side pieces are dev tooling + one schema + one
CLI subcommand inside the existing `apps/llm-importer` package (same placement precedent as 013's
`eval/`); the skill addition is one more section in the one existing skill file rather than a second
skill directory, specifically to avoid extending `agents/kit.ts`'s single-skill installer (out of
scope per the spec); the Studio pieces are one new parser + one new service + one small UI addition
inside the existing `apps/studio` package, deliberately **not** touching `packages/core-model`,
`packages/renderer`, `packages/layout`, or `packages/viewer-components` — the drill-down UX those
packages provide for a `component`-kind element already works and needs no change.

## Complexity Tracking

_No Constitution Check violations — this section is intentionally empty._

## Phase 0 — Research (`research.md`)

Decisions to record (all low-risk; grounded in direct inspection of the existing codebase):

1. **No `core-model` change** — verified `ElementKind` already includes `'component'`, `Element`
   already has `parentId`, and `DiagramLevel`/`semantic-zoom.ts`/`useDiagramNavigation.ts`/
   `diagram-context.ts` already treat `'component'` as a real nested zoom level (comment in
   `diagram-context.ts`: "In container diagram, we add components"). This is an existing,
   general-purpose manual-editing capability; the feature adds a bulk, artifact-driven way to
   populate it for one container, not new rendering.
2. **No `gather-context` CLI change** — it already accepts `--repos <name>` and already produces
   exactly one `{name}.context.json` bundle for a single repository, deterministically. This is the
   same bounded input the new extraction mode needs; reuse it verbatim.
3. **Extend the existing skill file, don't add a second one** — `plugins/repo-analysis/skills/import/
SKILL.md` already branches on input shape (whole workspace / single repo / a context bundle).
   `agents/kit.ts` (the `archatlas init` installer) is hardcoded to exactly one `SKILL.md` per kit
   directory; teaching it to install a second skill is out of scope for this feature. Add one more
   optional section/mode to the existing file instead — zero `kit.ts` change.
4. **New CLI command needed for validation** — unlike `{repo}.analysis.json` (validated for free as a
   side effect of `import` parsing every artifact), `{repo}.components.json` is, by FR-010/FR-013,
   never read by `import`. FR-011 ("rejected with a clear error at the point it is read") therefore
   needs its own entrypoint: `validate-components <file>`, parsed against `ComponentAnalysisSchema`,
   exit 0 (prints "valid") or 1 (prints the zod error). The new skill-file section calls this exactly
   the way the existing section's "Validate" step calls `import`.
5. **Golden dataset content strategy** — reuse the already-committed `examples/bookshop/repos/
catalog-service` (Java/Spring Boot) and `examples/bookshop/repos/order-service` (TypeScript/
   Express) source trees (8 files each — small, hand-auditable, already differ in language/framework
   per the spec's Assumption). For each, hand-author `ground-truth.json` independently from reading
   the real source, then hand-author the committed `{repo}.components.json` as a **deliberately
   imperfect** guess (missing one real internal component, one relationship pointed the wrong
   direction) — not identical to ground truth. This makes the initial baseline meaningfully below
   1.0/1.0, so FR-005 ("runs correctly against a... deliberately-wrong artifact") and SC-003
   ("omitting a component drops recall") are demonstrated by the initial commit itself, not just a
   hypothetical later edit, and the harness is proven to actually discriminate before anything real
   is scored against it.
6. **Scoring reuses existing primitives, not new matching logic** — `eval/score.ts`'s generic
   `prf(predicted, expected, matcher)` plus the existing `nameMatch()` (case/whitespace-insensitive,
   substring-tolerant) is exactly the Q3-clarified matching rule for components. For relationships,
   key each as `` `${normalize(source)}->${normalize(target)}` `` (direction-sensitive, mirroring
   `scoreConnections`'s own `key()` helper) and reuse `prf()` again with exact-string matching on that
   key. No new matcher primitive; two new thin wrapper functions (`scoreComponents`,
   `scoreRelationships`) in `score.ts`, each covered by the same style of unit test already there for
   `scoreConnections`.
7. **Separate `eval:components` command, not a flag on `eval`** — keeps the two harnesses' reports,
   baselines, and golden-set directories independent (components vs. correlation are different
   extraction concerns scored against different kinds of ground truth), mirrors the existing
   `eval` / `eval:extract` split, and lets FR-006's ordering ("merged and runnable... before any
   component-extraction procedure is authored") land as its own reviewable, mergeable PR with nothing
   else riding along.
8. **CI placement** — one new step in the existing `test` job in `ci.yml`, immediately after the
   existing `eval -- --check` step, so either harness blocks the PR independently and the failure
   message names which one.
9. **Publish safety** — `eval/`, including `golden-components/`, stays out of the npm tarball via the
   existing `files: ["dist"]` allowlist; no new check needed beyond confirming `npm pack --dry-run`
   still shows no `eval/` entry after these additions (same proof 013 already established).

## Phase 1 — Design & Contracts

- **`data-model.md`** — exact shapes: `ComponentAnalysis` (the `{repo}.components.json` artifact:
  `schemaVersion`, `analyzedAt`, `repository`, `analysisStatus`, `retryCount`, `components: [{name,
kind, description}]`, `relationships: [{source, target, description}]`), `ComponentGroundTruth`
  (`{components: [{name, kind, description}], relationships: [{from, to}]}`),
  `ComponentWorkspaceGroundTruth` / `eval.config.yaml` shape (single-repo, simpler than the
  multi-repo correlation config), `ComponentBaseline`, `ComponentReport`. Note which are
  zod-validated on read and on which side (importer vs. Studio).
- **`contracts/components-cli-contract.md`** — `validate-components <file>` (exit 0 "valid" / 1 with
  schema error) and `eval:components` (`report` / `--check` / `--update-baseline`, same exit-code
  contract as `eval`: 0 / 1 / 2).
- **`contracts/components-artifact-schema.md`** — the exact JSON shape of `{repo}.components.json`,
  worked example, and the one validation rule unique to Studio's side (FR-012a: artifact's
  `repository.name` must match the target container's name/tag before attaching).
- **`quickstart.md`** — copy-paste: run `eval:components`; add a third golden dataset; request a
  component analysis for one repo end-to-end (`gather-context --repos X` → agent runs the skill's new
  mode → `validate-components` → attach in Studio).
- **Agent context update** — run `.specify/scripts/bash/update-agent-context.sh claude` to add this
  feature's entry to `CLAUDE.md`.
- **Re-run Constitution Check** — no change expected; the design still adds no dependency, no
  `core-model` change, and no new cross-package import.

## Phase 2 — Tasks

Created by `/speckit.tasks`. Expected shape (strict eval-first order, matching FR-006 and the
clarified User Story 1 priority):

1. **US1 — eval harness first (P1), gates everything below:**
   - Schema: `component-analysis.schema.ts` + tests.
   - Scoring: `scoreComponents`/`scoreRelationships` in `score.ts` + tests (exact/partial/empty/
     direction-reversed cases, mirroring existing `scoreConnections` tests).
   - Harness: `component-types.ts`, `component-schema.ts`, `component-load.ts`, `component-run.ts`.
   - Golden datasets: both `golden-components/{catalog-service,order-service}/` directories
     (ground-truth + deliberately-imperfect components.json each).
   - Baseline: generate + commit `component-baseline.json`.
   - CI: add the `eval:components -- --check` step.
   - **Checkpoint**: `eval:components` runs green in CI with no extraction procedure anywhere in the
     repo yet — merge here before continuing.
2. **US2 — the opt-in request path (P2):**
   - CLI: `validate-components <file>` subcommand + tests.
   - Skill: new section in `plugins/repo-analysis/skills/import/SKILL.md`.
   - Verify against both golden repos: run the real procedure (an agent) against
     `catalog-service`/`order-service`, confirm `validate-components` accepts the result, optionally
     update `component-baseline.json` if the real run scores differently from the hand-authored
     stand-ins (reviewable diff, per US4's loop).
3. **US3 — Studio attach + render (P2):**
   - `lib/import/parse-components.ts` + tests.
   - `services/attach-components.ts` (+ FR-012a mismatch rejection) + tests.
   - `StudioSidebarPanel.tsx` action wiring (file picker → parse → attach → existing save path).
   - Manual/e2e check: attach to one container, zoom in, reload, confirm persistence (SC-004).
4. **Docs & polish:** `eval/README.md`, `apps/llm-importer/README.md` pointer, root `README.md` if it
   documents the import flow, `CHANGELOG.md`.
5. **Verify:** full monorepo lint/typecheck/test; `npm pack --dry-run` shows no `eval/`;
   `eval:components -- --check` green; `eval -- --check` (correlation) still green and unchanged
   (FR-013); `import`/`gather-context` byte-identical output before/after (SC-005).
