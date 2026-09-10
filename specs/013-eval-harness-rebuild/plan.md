# Implementation Plan: Correlation Eval Harness Rebuild

**Branch**: `013-eval-harness-rebuild` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-eval-harness-rebuild/spec.md`

## Summary

Rebuild the scored regression gate for the deterministic correlator. Resurrect the model-call-free
scoring math (`score.ts`/`types.ts`, recoverable from git `dda7094`) into `apps/llm-importer/eval/`,
add a **correlation runner** that reads committed `{repo}.analysis.json` + a ground-truth file for a
golden workspace, runs `toCorrelationGraph → correlateDeterministically → assembleReviewFile`, and
scores cross-repo connection P/R/F1 plus external-system recall against a committed `baseline.json`.
`pnpm --filter @archatlas/llm-importer eval` reports; `eval --check` gates CI; `eval --update-baseline`
rewrites the baseline as a reviewable diff. A separate `eval:extract` script scores on-disk analysis
artifacts per-field, local-only, never gating. The synthetic golden set reuses
`apps/llm-importer/test/fixtures/`; two fixture analyses gain an external outbound intent (S3, an
IdP) so external-system recall is exercised. `online-boutique` is a P3 follow-on.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node ≥ 22
**Primary Dependencies**: none new — `tsx` (run scripts), `js-yaml` (config), `zod` (validate
ground-truth / config), `vitest` (`score.test.ts`) are all already present in `apps/llm-importer`
**Storage**: git-committed dev fixtures — `eval/golden/<set>/{eval.config.yaml, ground-truth.json,
analyses/}` and `eval/baseline.json`. No database, no runtime persistence.
**Testing**: `vitest` for `score.test.ts` (resurrected + extended) and a runner integration test;
the eval scripts themselves are exercised by that integration test.
**Target Platform**: local dev + CI (Linux) — Node, no browser
**Project Type**: single package — dev tooling added under `apps/llm-importer/eval/`
**Performance Goals**: a full `eval` over the committed golden set(s) completes in < 10s (SC-001);
scoring is O(edges) greedy set-match
**Constraints**: no model call, no network, no external-repo clone at eval time (FR-004); nothing
under `eval/` ships in the npm tarball (`files: ["dist"]` already enforces — verified by
`npm pack --dry-run`, SC-005); deterministic — byte-identical output on rerun (SC-003)
**Scale/Scope**: 1 synthetic golden set at ship (4-repo core + 2 external systems); framework
supports N sets; `online-boutique` (~11 services) as a later set

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Assessment                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Monorepo boundaries**               | PASS. `eval/` is inside `apps/llm-importer` — it imports that package's own `src/**` by relative path (in-package, not a cross-boundary reach). `score.ts`/`types.ts` stay dependency-light and importable by any in-repo script. Nothing new is exported from the package's public entrypoint; nothing under `eval/` is published. |
| **II. Type safety & explicit contracts** | PASS. Strict TS throughout. `ground-truth.json` and `eval.config.yaml` get a zod schema so a malformed or internally-inconsistent ground-truth file fails loudly (spec edge case) rather than silently scoring as misses. `baseline.json` is written by the tool and validated on read.                                             |
| **III. TDD (NON-NEGOTIABLE)**            | PASS. `score.test.ts` is resurrected and extended test-first for the new `scoreExternalSystems` and the connection-direction cases (SC-004). The runner gets an integration test that runs it against the committed synthetic golden set and asserts the resulting scores.                                                          |
| **IV. Security & privacy**               | PASS. No secrets, no network, no untrusted input beyond local dev files the maintainer controls. No LLM call in the CI-gating path. The extraction script reads only local analysis artifacts.                                                                                                                                      |
| **V. Latest versions & supply-chain**    | PASS. Zero new dependencies. No runtime-surface change to the published `@archatlas/llm-importer`.                                                                                                                                                                                                                                  |
| **Coverage ≥ 80% (changed files)**       | PASS by design. `score.ts` is fully unit-tested; `run.ts`/`extract.ts` are covered by the runner integration test.                                                                                                                                                                                                                  |
| **OSS hygiene**                          | `apps/llm-importer/README.md` gains a short "Eval" pointer; `eval/README.md` is the detailed doc (FR-011); `CHANGELOG.md` gets an entry.                                                                                                                                                                                            |

No violations → **Complexity Tracking is empty**.

**Post-design re-check (after Phase 1)**: unchanged — the design adds zero dependencies, zero
published-surface change, and `eval/` reaches only its own package's `src/**` by relative import.
All gates still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/013-eval-harness-rebuild/
├── plan.md              # this file
├── research.md          # Phase 0 — decisions (reuse vs rewrite, fixture path handling,
│                        #   external-system scoring, tolerance, baseline shape)
├── data-model.md        # Phase 1 — ground-truth / config / baseline / report shapes
├── quickstart.md        # Phase 1 — how to run report / --check / --update-baseline; add a golden set
├── contracts/
│   └── eval-cli-contract.md   # the `eval` / `eval:extract` command surface + exit codes
├── checklists/
│   └── requirements.md  # (from /speckit.specify) — all items pass
└── tasks.md             # Phase 2 — created by /speckit.tasks, NOT here
```

### Source Code (repository root)

```text
apps/llm-importer/
├── eval/                              # NEW — dev-only, never in the npm tarball
│   ├── README.md                     # run modes, ground-truth structure, adding a golden set (FR-011)
│   ├── types.ts                      # RepoGroundTruth, WorkspaceGroundTruth (+ externalSystems),
│   │                                 #   EvalConfig, PRF, Baseline, CorrelationReport — model-call-free
│   ├── score.ts                      # resurrected pure math + NEW scoreExternalSystems; no I/O, no model
│   ├── score.test.ts                 # resurrected + extended (vitest picks it up as a unit test)
│   ├── schema.ts                     # zod schemas for ground-truth.json + eval.config.yaml + baseline.json
│   ├── load.ts                       # read a golden set: config → committed analyses (path-patched) → GT
│   ├── run.ts                        # CORRELATION eval — report | --check | --update-baseline; CI-gating
│   ├── extract.ts                    # EXTRACTION eval — local-only, per-field P/R/F1, always exit 0
│   ├── run.integration.test.ts       # runs run.ts against the committed synthetic set, asserts scores
│   ├── baseline.json                 # committed; the --check reference
│   └── golden/
│       └── fixtures/
│           ├── eval.config.yaml      # workspace: local ../../../test/fixtures/repos ; repo list
│           └── ground-truth.json     # expected connections + externalSystems (+ per-repo fields for extract)
├── test/fixtures/analyses/
│   ├── user-service.analysis.json    # + one external outbound intent (e.g. Amazon S3)  ── shared with
│   └── gateway.analysis.json         # + one external outbound intent (e.g. Keycloak)    ── the integ test
├── package.json                      # + scripts: "eval", "eval:extract"
├── vitest.config.ts                  # unchanged (already excludes eval/golden/*/workspace/**)
└── README.md                         # + "## Eval" pointer to eval/README.md

.github/workflows/ci.yml              # + step: pnpm --filter @archatlas/llm-importer eval -- --check
apps/llm-importer/test/integration/model-free-pipeline.integration.test.ts  # snapshot updated for the
                                                                            #   two new external edges
```

**Structure Decision**: single-package dev tooling. The eval is a sibling of `src/` and `test/`
inside `apps/llm-importer` (the package that now owns the correlator), not a separate package —
this keeps `score.ts` able to import the correlator's real functions/types without a cross-package
boundary and without a published subpath, while `files: ["dist"]` keeps every byte of it out of the
shipped tarball.

## Phase 0 — Research (`research.md`)

Decisions to record (all low-risk; the old harness is recoverable):

1. **Reuse vs rewrite `score.ts`** — reuse verbatim except: swap `@arch-atlas/*` → relative
   `../src/*` type imports; drop the model-run aggregation helpers that only served the deleted
   N-runs-against-a-live-model flow (`meanPairwiseJaccard` kept for the extraction script's
   consistency line; `averagePrf`/`stddev` kept — cheap, tested). Add `scoreExternalSystems`.
2. **`scoreExternalSystems` definition** — recall (and, reported alongside, precision/F1) of the
   ground-truth `externalSystems` list against the set of review candidates whose `target` is not a
   workspace repo name. Name match reuses `nameMatch` (so "Amazon S3" ~ "S3", "Keycloak" ~
   "Keycloak"). Recall is the headline metric (a dropped external dependency is the failure we care
   about); precision guards against the dictionary over-firing.
3. **Fixture path handling** — the committed `{repo}.analysis.json` carry a placeholder
   `repository.path`; `load.ts` rewrites each to `<repo>` under the config's `workspace.local` dir
   (same trick `model-free-pipeline.integration.test.ts` uses) so the evidence passes can re-walk
   real source. The synthetic golden set references `test/fixtures/` by relative path — no copy.
4. **External-system fixtures** — add one `outbound` intent to `user-service` (→ Amazon S3,
   `writes_to`) and one to `gateway` (→ Keycloak, `depends_on`) in the shared fixture analyses;
   update the one integration snapshot to include `user-service -> Amazon S3` and
   `gateway -> Keycloak`. This makes external-system recall a live metric with a non-trivial value.
5. **Baseline shape & tolerance** — `baseline.json` = `{ "<set>": { "connections": {precision,
recall, f1}, "externalSystems": {precision, recall, f1} } }`. `--check` fails if any recorded
   metric drops by more than **0.02** absolute; improvements never fail. Missing baseline in
   `--check` mode is a hard error with a "run --update-baseline" hint.
6. **CI placement** — one step in the existing `test` job (`ci.yml`), after the coverage run, so a
   correlator regression blocks the PR. No matrix, no new workflow.
7. **Publish safety proof** — `research.md` records the `npm pack --dry-run` output showing no
   `eval/` entry (also asserted by an existing/updated test if cheap).

## Phase 1 — Design & Contracts

- **`data-model.md`** — the exact shapes: `RepoGroundTruth`, `WorkspaceGroundTruth`
  (`{ repos, connections: [{from,to,kind?}], externalSystems: string[] }`), `EvalConfig`
  (`{ name, workspace: {local}, repos: [{name,path}] }`), `PRF`, `Baseline`, `CorrelationReport`,
  `ExtractionReport`. Note which are zod-validated on read.
- **`contracts/eval-cli-contract.md`** — the two commands:
  - `eval` → report; exit 0 always in report mode.
  - `eval --check` → exit 0 if every metric ≥ baseline − 0.02; exit 1 (naming metric + delta) on
    regression; exit 2 on missing/invalid baseline or inconsistent ground truth.
  - `eval --update-baseline` → rewrite `baseline.json` from current scores; exit 0.
  - `eval:extract [--out <dir>] [--set <name>]` → per-field P/R/F1 table; exit 0 always.
- **`quickstart.md`** — copy-paste for each mode + "adding a golden set" (config, analyses,
  ground-truth, regenerate baseline).
- **Agent context** — run `.specify/scripts/bash/update-agent-context.sh claude` to add the eval
  entry to `CLAUDE.md`.
- **Re-run Constitution Check** — no change expected; the design adds no dependency, no published
  surface, no cross-package reach.

## Phase 2 — Tasks

Created by `/speckit.tasks`. Expected shape (TDD order):

1. Setup: `eval/` dir, `package.json` scripts, `eval/README.md` skeleton.
2. Test-first: resurrect `score.test.ts`; add failing tests for `scoreExternalSystems`, reversed
   direction, empty sets; add `run.integration.test.ts` asserting synthetic-set scores.
3. Implement: `types.ts`, `score.ts` (port + `scoreExternalSystems`), `schema.ts`, `load.ts`,
   `run.ts`, `extract.ts`.
4. Golden set: `eval/golden/fixtures/{eval.config.yaml, ground-truth.json}`; extend the two fixture
   analyses; update the integration snapshot.
5. Baseline: generate + commit `eval/baseline.json`.
6. CI: add the `eval --check` step to `ci.yml`.
7. Docs: `eval/README.md`, `apps/llm-importer/README.md` pointer, `CHANGELOG.md` entry.
8. Verify: full monorepo lint/typecheck/build/test; `npm pack --dry-run` shows no `eval/`;
   `eval --check` green; revert-the-pass smoke check (SC-002).
