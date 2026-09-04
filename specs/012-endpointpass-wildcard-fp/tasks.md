# Tasks: endpointPass — a bare data string is not a call

**Input**: Design documents from `/specs/012-endpointpass-wildcard-fp/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/endpointpass-behavior.md, quickstart.md

**Tests**: REQUIRED — TDD per constitution III; the spec's success criteria are eval-verified.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task — may run in parallel
- **[Story]**: US1 is the feature's only user story (single P1); all tasks map to it

## Path Conventions

Single package touched: `apps/llm-importer/`. Eval baseline in
`packages/analysis-runner-local/eval/`.

---

## Phase 1: Setup

- [x] T001 Confirm baseline is green and record starting numbers: run
      `pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` and
      `pnpm --filter @arch-atlas/llm-importer test -- evidence-parsers`; note the current
      6 `describe('endpointPass')` cases all pass. Capture `online-boutique`
      `connectionsPrecision 0.933 / recall 1.0` from
      `packages/analysis-runner-local/eval/baseline.json` into `proof.md` "before".

---

## Phase 2: Foundational (the new helper + constant)

**⚠️ Blocks the user-story implementation. Two files, sequential within each.**

- [x] T002 [P] In `apps/llm-importer/src/correlate/evidence/parsers/routes.ts`, add and
      export `staticSegmentCount(path: string): number` beside `segmentCount` /
      `pathsEqual` (data-model.md "New helper") — count of `/`-split, non-empty segments
      that are not `'*'`.
- [x] T003 [P] In `apps/llm-importer/test/unit/evidence-parsers.test.ts`, add
      `describe('staticSegmentCount')` covering the 5 cases in
      `contracts/endpointpass-behavior.md` ("Helper-level contracts"):
      `/product/*` → 1, `/product/*/*` → 1, `/api/v1/*` → 2, `/*/*` → 0,
      `/v1/charge` → 2.
- [x] T004 In `apps/llm-importer/src/correlate/evidence-passes.ts`, above `endpointPass`,
      add the named constant with rationale comment:
      `MIN_STATIC_SEGMENTS_FOR_METHODLESS_MATCH = 1` (data-model.md "New constant").

**Checkpoint**: `pnpm --filter @arch-atlas/llm-importer typecheck` clean; T003 green; no
`endpointPass` behavior change yet.

---

## Phase 3: User Story 1 — a bare data string is not a call (P1) 🎯 MVP

**Goal**: A route-shaped literal with no HTTP-method hint no longer matches a served route
that has at most one static segment; every other match path is untouched.

**Independent Test**: `evidence-passes.test.ts` `describe('endpointPass')` — the
adservice/frontend shape (one-static-segment route, no-method-hint literal) produces zero
connections; a method-hinted literal against the same route, and any literal against a
two-static-segment route, still match exactly as before.

### Tests for User Story 1 (write first, must FAIL)

- [x] T005 [US1] In `evidence-passes.test.ts` `describe('endpointPass')`, add **"does not
      match a method-less literal against a low-specificity served route"** — callee serves
      `GET /product/{id}` (endpoint node `name: 'GET /product/{id}'`), caller literal
      `{ path: '/product/2ZYFJ3GM2N', template: false }` (no `method`); assert
      `connections` is empty. (Contract C1, FR-001.)
- [x] T006 [US1] Add **"still matches when the literal carries a method hint, even on a
      low-specificity route"** — same callee route, caller literal
      `{ path: '/product/42', method: 'GET', template: false }`; assert one connection at
      the existing exact-method weight (`0.85`). (Contract C2, FR-003.)
- [x] T007 [US1] Add **"still matches a method-less literal against a route with two or
      more static segments"** — callee serves `GET /api/v1/{id}`, caller literal
      `{ path: '/api/v1/999', template: false }` (no `method`); assert one connection at
      the existing non-exact weight (`0.7`). (Contract C3, FR-002.)
- [x] T008 [US1] Run the file — T005 FAILS against current `endpointPass` (today it
      matches); T006 and T007 already pass (regression guards, unaffected by the fix).
      Commit the failing test.

### Implementation for User Story 1

- [x] T009 [US1] In `endpointPass`'s endpoint-node matching loop, inside the
      `if (pathsEqual(literal.path, route.path))` branch, add the guard: when
      `literal.method === undefined` and
      `staticSegmentCount(route.path) <= MIN_STATIC_SEGMENTS_FOR_METHODLESS_MATCH`,
      `continue` before computing `exactMethod`/`weight`/pushing to `matches`
      (data-model.md decision table, row 1). Every other combination falls through
      unchanged.
- [x] T010 [US1] Run `pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` —
      T005/T006/T007 green; all 6 pre-existing `endpointPass` cases and all `schemaPass`
      cases still green. Commit.

**Checkpoint**: the adservice/frontend false-positive shape no longer matches; every other
`endpointPass` scenario is provably unchanged (D8 blast-radius table).

---

## Phase 4: Cross-cutting verification

- [x] T011 Determinism: `pnpm --filter @arch-atlas/llm-importer test -- multi-repo-correlation`
      — byte-identical connection set across runs (unaffected pure-function change; contract
      C6, SC-005).
- [x] T012 No collateral movement: `pnpm --filter @arch-atlas/llm-importer test` (full
      suite) + `lint` + `typecheck`. Confirm `grpc-pass`, `schemaPass`,
      `grpc-correlation.integration`, `review-assembly`, and every other `endpointPass`
      branch (gateway-prefixed variant, literal-vs-literal fallback, OIDC exclusion,
      multi-repo demotion) are byte-identical. (Contracts C4, C5, FR-004, FR-005.)
- [x] T013 Coverage: `pnpm --filter @arch-atlas/llm-importer test -- --coverage` ≥ 80 %
      lines/branches; both branches of the new guard (skip / fall-through) hit.
      (Constitution III.)
- [x] T014 Eval — reference workspace: `pnpm --filter @arch-atlas/analysis-runner-local
    eval --set online-boutique --runs 3`. Expect `connectionsPrecision 1.0` (up from
      0.933), `connectionsRecall 1.0` unchanged, 0 residual false positives. (SC-001, SC-002,
      SC-003.)
- [x] T015 Eval — fixtures: `pnpm --filter @arch-atlas/analysis-runner-local eval --set
    fixtures --runs 3`. Expect connection metrics within `TOLERANCE` (0.05) of the
      currently-committed baseline (011's regenerated fixtures entry) — no fixtures repo
      serves a wildcard-segment route, so the new guard cannot fire there. (SC-004.)
- [x] T016 Regenerate `packages/analysis-runner-local/eval/baseline.json` for
      `online-boutique` (and `fixtures` only if it moved outside tolerance).

---

## Phase 5: Docs & proof

- [x] T017 [P] `CHANGELOG.md` — add a 012 entry under a new "Changed" heading (endpointPass
      no longer treats a bare data string as a call against a low-specificity route).
- [x] T018 [P] `specs/011-schemapass-shared-contract/research.md` (or `spec.md`'s Out of
      Scope note) — append a line pointing at 012 as the closure of the one remaining
      documented false positive.
- [x] T019 [P] Write `specs/012-endpointpass-wildcard-fp/proof.md`: before/after eval
      numbers, the failing→passing unit tests, `git diff --stat` showing only `routes.ts` +
      `evidence-passes.ts` + their tests + `baseline.json` + `specs/012-*` (+ CHANGELOG /
      011 pointer), determinism confirmation.
- [x] T020 Final: `pnpm turbo run lint typecheck build` and `pnpm turbo run test -- --coverage`
      green across the monorepo; commit; open PR stacked on `main`.

---

## Dependencies & Execution Order

- **T001** → **T002/T003** `[P]` (different files) + **T004** (same file as T002, so
  sequential with it, but independent of T003) → **US1 tests (T005–T008)** →
  **US1 implementation (T009–T010)** → **T011–T016** (verification; T014/T015 need a
  reachable local model) → **T017–T020** (T017/T018/T019 are `[P]` — different files).
- Every test task precedes its implementation task and must be observed failing first
  (constitution III) — here, only T005 is expected to fail; T006/T007 are regression
  guards expected green from the start (they exercise paths the fix does not touch).

## Parallel Opportunities

- T002 and T003 can start together (helper implementation and its own unit tests are
  independent files), though T003 obviously can't turn green until T002 exists.
- T017, T018, T019 — three different files, after verification passes.

## Implementation Strategy

Single-story feature: the whole change is one guard clause plus one helper. No MVP-vs-later
split — ship after T014 confirms `connectionsPrecision` reaches 1.0 on the reference
workspace and T015 confirms fixtures are unaffected.

## Notes

- No new files under `src/`. No `RepoEvidence` / `UrlLiteral` / `EndpointRoute` /
  persisted-schema / CLI / Studio change (FR-007, FR-008).
- Commit after each task or logical group; keep the importer suite green at every commit.
- If T014 shows the guard is too narrow (a residual FP survives) or too broad (a real edge
  is lost), the fallback per research.md D6 is to revisit the `staticSegmentCount`
  threshold — do not broaden into general call-site/dataflow detection, which stays
  explicitly out of scope.
