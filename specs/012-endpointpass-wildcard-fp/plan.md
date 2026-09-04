# Implementation Plan: endpointPass — a bare data string is not a call

**Branch**: `012-endpointpass-wildcard-fp` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-endpointpass-wildcard-fp/spec.md`

## Summary

`endpointPass`'s endpoint-node matching block accepts a caller's route-shaped string
literal as evidence of a real cross-repo call whenever it path-matches a served route,
using wildcard-tolerant `pathsEqual` (minimum one concrete-aligned segment). For a served
route with only one static segment (e.g. `GET /product/{id}` → `/product/*`), that one
segment is the _only_ possible concrete-aligned position, so any literal sharing that one
word matches — regardless of what its other, wildcard-aligned segment contains, and
regardless of whether the literal sits anywhere near HTTP-call syntax. On the Online
Boutique reference workspace this misreads `adservice`'s ad-content redirect strings
(`/product/<opaque-id>`, plain data) as calls to `frontend`'s `GET /product/{id}` route —
the single remaining false positive left after 011, capping workspace precision at ~0.93.

Fix, scoped to `endpointPass`'s endpoint-node matching branch only: when a served route has
at most one static segment **and** the matching literal carries no HTTP-method signal at
all, do not accept the match — skip it exactly like the existing method-contradiction
check does. Routes with two or more static segments, and literals that carry any method
signal (exact or merely non-contradictory), are completely unaffected. The
gateway-prefixed-variant branch and the literal-vs-literal fallback branch are untouched.
No evidence/parser/schema/CLI change — the check is a pure function of data already carried
on the served route and the literal.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node ≥ 22
**Primary Dependencies**: none added. Existing `vitest` (tests). New logic lives beside the
existing `pathsEqual` / `isGatewayPrefixedVariant` path-shape helpers in
`evidence/parsers/routes.ts`.
**Storage**: N/A — in-memory correlation over collected `RepoEvidence`. No persisted
artifact changes (`{repo}.analysis.json`, `architecture.review.yaml`, `.arch.json` all
unchanged).
**Testing**: `vitest` — new cases in the existing `describe('endpointPass')` block in
`apps/llm-importer/test/unit/evidence-passes.test.ts`, plus five pure-function cases
for the new `routes.ts` helper alongside its neighbors in
`apps/llm-importer/test/unit/evidence-parsers.test.ts`; determinism already covered by
`multi-repo-correlation.integration.test.ts`; full-workspace numbers via
`packages/analysis-runner-local/eval`.
**Target Platform**: Node CLI / library (`@arch-atlas/llm-importer`).
**Project Type**: monorepo — single package touched (`apps/llm-importer`), plus an eval
baseline file in `packages/analysis-runner-local`.
**Performance Goals**: no change — the new check is O(1) per (literal, route) pair already
being compared; no new loop, no new pass.
**Constraints**: byte-deterministic correlation output (FR-006/SC-005); ≥ 80 % coverage on
changed project (constitution III); no new dependency (constitution V).
**Scale/Scope**: ~15 changed/added lines across two functions in two files + 1 new named
helper + 1 named constant; ~4 new unit tests; 1 regenerated eval baseline entry.

## Constitution Check

_GATE: must pass before Phase 0 and after Phase 1._

| Principle                                   | Status         | Notes                                                                                                                           |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo boundaries                      | PASS           | Change confined to `apps/llm-importer/src/correlate/`; no new cross-package import; eval baseline is data.                      |
| II. Type safety & explicit contracts        | PASS           | No `any`, no new casts; the new helper takes/returns primitives already in scope. No boundary/schema change.                    |
| III. TDD (NON-NEGOTIABLE) + ≥ 80 % coverage | PASS (planned) | Failing test reproducing the adservice/frontend FP written first; both branches of the new check (guarded / unguarded) covered. |
| IV. Security & privacy by design            | PASS           | No new external surface; deterministic literal analysis; no secrets, no LLM call in `endpointPass`.                             |
| V. Latest versions & supply-chain hygiene   | PASS           | Zero dependency changes; lockfile untouched.                                                                                    |

Post-design re-check: unchanged — see `research.md` D8. **No violations; Complexity
Tracking table omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/012-endpointpass-wildcard-fp/
├── plan.md              # this file
├── spec.md              # /speckit.specify output
├── research.md          # Phase 0 — D1..D8
├── data-model.md        # Phase 1 — types read + the new helper + decision table
├── contracts/
│   └── endpointpass-behavior.md   # Phase 1 — C1..C6 behavioural contract
├── quickstart.md        # Phase 1 — how to verify
├── checklists/
│   └── requirements.md  # spec quality checklist (all pass)
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
apps/llm-importer/
├── src/correlate/
│   ├── evidence/parsers/routes.ts   # CHANGED — new exported helper
│   │                                #   (route static-segment specificity check)
│   └── evidence-passes.ts           # CHANGED — endpointPass: one new guard in the
│                                    #   endpoint-node matching loop
└── test/unit/
    ├── evidence-parsers.test.ts     # CHANGED — new cases for the routes.ts helper
    └── evidence-passes.test.ts      # CHANGED — new describe('endpointPass') cases;
                                     #   existing 6 endpointPass cases unchanged

packages/analysis-runner-local/
└── eval/
    └── baseline.json                # CHANGED — regenerated `online-boutique` aggregate
                                     #   (connectionsPrecision 0.933 → 1.0)
```

**Explicitly NOT touched**: `src/correlate/evidence/collect.ts` and every other parser
(`grpc.ts`, `manifests.ts`, `schemas.ts`, `topics.ts`, `compose.ts`), every other pass
(`manifestPass`, `grpcPass`, `schemaPass`, `composePass`, `topicPass`, name-mention),
`deterministic-correlator.ts`, `src/confidence/*`, `src/review/*`, `src/export/*`,
`src/config/*`, `src/index.ts`, `src/cli.ts`, the `.arch.json` / review-artifact schemas,
and all of `apps/studio`.

**Structure Decision**: Single-package change in `apps/llm-importer`, mirroring 011's
shape exactly — a pure path-shape predicate added to `routes.ts` (where `pathsEqual` and
`isGatewayPrefixedVariant` already live) and one new guard clause inside `endpointPass`'s
existing endpoint-node matching loop. The eval baseline lives with the eval harness in
`packages/analysis-runner-local` (010 D10, reused by 011). No new files in `src/`.

## Phase 0 — Outline & Research

Complete → `research.md`. All unknowns resolved:

- **D1** exact code path producing the FP (`pathsEqual` default `minConcrete = 1` +
  `resolveMethodHint` returning `undefined` for `adservice`'s literal).
- **D2** confirmed via `score.ts` that weight does not gate `connectionsPrecision` — the
  edge must not be emitted, not merely down-weighted.
- **D3** confirmed against both golden ground-truth files that no true positive depends on
  this match — safe to remove entirely.
- **D4** confirmed via the existing `endpointPass` test suite that no test exercises a
  wildcard-segment served route through `pathsEqual` — untested territory, not a codified
  behavior this change would break.
- **D5** the new rule: static-segment count ≤ 1 on the route **and** no method signal on
  the literal ⇒ skip. One named constant + one named helper.
- **D6** why "static segment count", not "total segment count" or "wildcard ratio" — ties
  the threshold to the same normalized-segment representation `pathsEqual` already uses.
- **D7** determinism argument (pure, order-independent per-pair check; no new mutable
  state).
- **D8** blast-radius table against the 6 pre-existing `endpointPass` unit tests — none use
  a wildcard-segment route, so all 6 assertions are provably unaffected.

## Phase 1 — Design & Contracts

Complete → `data-model.md`, `contracts/endpointpass-behavior.md`, `quickstart.md`.

- **data-model.md**: existing types read (unchanged), the one new helper's signature, the
  one named constant, and the decision table (static-segment count × method-signal
  presence → match / skip).
- **contracts/endpointpass-behavior.md**: C1–C6 — GIVEN/WHEN/THEN for the FP-reproduction
  case, the method-hint-present passthrough, the higher-specificity-route passthrough, the
  gateway-prefixed-variant passthrough, the literal-vs-literal-fallback passthrough, and
  determinism. Each maps directly to a unit test.
- **quickstart.md**: unit / determinism / eval commands and the "done" diff shape.

### Agent context update

Run `.specify/scripts/bash/update-agent-context.sh claude` — adds no new tech (TS/Node
already present); records the 012 line only.

## Phase 2 — (handled by `/speckit.tasks`)

Task ordering will be, TDD-first:

1. Add a failing unit test in `evidence-passes.test.ts` reproducing the adservice/frontend
   shape (a served route with one static segment matched by a no-method-hint literal) —
   confirm it fails against current `endpointPass`.
2. Add the new pure helper to `routes.ts` + its own unit tests (both branches: ≤ 1 static
   segment, ≥ 2 static segments).
3. Add the one guard clause to `endpointPass`'s endpoint-node matching loop, using the new
   helper + `literal.method === undefined`.
4. Add the passthrough regression tests (method-hint present; higher-specificity route) —
   confirm green from the start as safety nets.
5. Run importer `test` + `lint` + `typecheck`; confirm the 6 pre-existing `endpointPass`
   assertions and all other passes' tests are untouched.
6. Run eval `--set online-boutique --runs 3`; confirm precision reaches 1.0, recall stays
   1.0; run `--set fixtures --runs 3` and confirm within tolerance.
7. Regenerate `eval/baseline.json` for `online-boutique` (and `fixtures` if it moved).
8. Docs: `CHANGELOG.md` entry; point `specs/011` (or `specs/009` D14) at 012 as the closure
   of the last documented FP; `proof.md`.

## Complexity Tracking

No constitution violations — table intentionally empty.
