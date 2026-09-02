# Tasks: schemaPass — shared multi-service contract is not a dependency

**Input**: Design documents from `/specs/011-schemapass-shared-contract/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schemapass-behavior.md, quickstart.md

**Tests**: REQUIRED — the spec's Proof Gate mandates unit tests (a–d) and an eval pass. TDD per constitution III.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task — may run in parallel
- **[Story]**: US1 / US2 / US3 from spec.md (all three modify the same `schemaPass`
  function, so their _implementation_ tasks are sequential; their _test_ tasks share one
  file and are also sequential)

## Path Conventions

Single package touched: `apps/llm-importer/`. Eval baseline in
`packages/analysis-runner-local/eval/`.

---

## Phase 1: Setup

- [ ] T001 Confirm baseline is green and record starting numbers: run
      `pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` and
      `pnpm --filter @arch-atlas/llm-importer typecheck`; note the current
      `describe('schemaPass')` cases (3) all pass. Capture `online-boutique`
      `connectionsPrecision 0.667 / recall 1.0` and `fixtures 0.822 / 0.933` from
      `packages/analysis-runner-local/eval/baseline.json` into `proof.md` "before".

---

## Phase 2: Foundational (shared helpers + constants)

**⚠️ Blocks all user-story implementation. One file, sequential.**

- [ ] T002 In `apps/llm-importer/src/correlate/evidence-passes.ts`, above `schemaPass`,
      add the two named constants with rationale comments:
      `AGGREGATE_CONTRACT_MIN_SERVICES = 2`, `SHARED_NAMESPACE_MIN_REPOS = 3`
      (data-model.md "Named constants").
- [ ] T003 In the same file, add module-local pure helpers used by `schemaPass`:
      `serviceIdsOf(digest): string[]` (filter `identifiers` for `service:` prefix, strip
      prefix) and `ownersOf(digest, holders): RepoEvidence[]` (holders whose `grpcServices`
      cover every `serviceIdsOf` name, matched via the existing `normalizeServiceName`).
      Keep them beside the other pass helpers (`stripServiceWord`, `servedGrpcServices`).

**Checkpoint**: helpers compile (`pnpm --filter @arch-atlas/llm-importer typecheck`), no
behaviour change yet, existing tests still green.

---

## Phase 3: User Story 1 — shared multi-service contract ⇒ no edge between holders (P1) 🎯 MVP

**Goal**: 3+ repos vendoring an identical multi-service `.proto` produce zero cross-repo
edges from that digest; the proto-package drift signal is suppressed for a workspace
namespace.

**Independent Test**: `evidence-passes.test.ts` schemaPass cases — identical
`demo.proto`-style digest across 3 repos ⇒ `connections` empty for it; `package` held by
3 repos with drift ⇒ no drift edge. Reference-workspace eval precision jumps.

### Tests for User Story 1 (write first, must FAIL)

- [ ] T004 [US1] In `apps/llm-importer/test/unit/evidence-passes.test.ts`
      `describe('schemaPass')`, add: **"identical multi-service proto vendored by 3 repos ⇒ no
      cross-repo edge"** — 3 `emptyEvidence` repos each with a `schemaDigest` sharing one
      `sha256` and `identifiers` = `['package:hipstershop','service:CurrencyService',
'service:PaymentService','service:AdService']`, none serving all three; assert
      `schemaPass(input([a,b,c])).connections` has no `depends_on` between a/b/c. (Contract
      C1.)
- [ ] T005 [US1] Add **"proto-package drift suppressed when package held by ≥3 repos"** —
      3 repos declare `package:hipstershop` + shared `message:Money`, two with differing
      `sha256`; assert no drift (`weight 0.4`) connection emitted. (Contract C4.)
- [ ] T006 [US1] Verify the pre-existing `'flags proto drift'` test (2 repos,
      `package:acme.events`, shared message, differing content ⇒ one `depends_on` @ 0.4 with
      "drift" evidence) still expresses the intended 2-repo behaviour; leave it unchanged.
      (Contract C5. The ≥3-repo flip-off assertion lives in T019.)
- [ ] T007 [US1] Run the file — T004/T005 FAIL against current `schemaPass`; the 3
      pre-existing schemaPass tests and T006 pass. Commit the failing tests.

### Implementation for User Story 1

- [ ] T008 [US1] In `evidence-passes.ts` `schemaPass`, build the once-per-pass pre-scan
      `pkgHolders: Map<string, Set<string>>` over every `digest.identifiers` `package:` entry
      across `repos` (data-model.md "Derived values").
- [ ] T009 [US1] In the proto-drift branch, before emitting: if
      `pkgHolders.get(pkg).size >= SHARED_NAMESPACE_MIN_REPOS` → `continue` (no edge).
      Leave the ≤2 path exactly as-is.
- [ ] T010 [US1] Rework the identical-copy branch (`da.sha256 === db.sha256`): gather
      `holders` for that `sha256`; compute `svcIds = serviceIdsOf(digest)`. If
      `svcIds.length >= AGGREGATE_CONTRACT_MIN_SERVICES` and `ownersOf(...)` is not exactly
      one → emit no connection (optionally push one `notes` line per FR-009). Keep
      `svcIds.length === 0` on the current pairwise `depends_on` @ 0.9 path unchanged (US2
      handles the 1..N-with-owner sub-case). (Contracts C1, C3.)
- [ ] T011 [US1] Run `pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` —
      T004/T005/T006 green; the 3 pre-existing schemaPass tests still green. Commit.

**Checkpoint**: multi-service vendored contracts and namespace drift no longer create
edges; single-service / service-less / OpenAPI behaviour unchanged.

---

## Phase 4: User Story 2 — single-owner contract ⇒ directed edge to the owner (P1)

**Goal**: When one repo serves every service a vendored identical `.proto` declares, each
other copy-holder still gets a directed `depends_on` toward that owner (recall preserved).

**Independent Test**: 2-repo fixture — B serves one service defined in `orders.proto`, A
vendors a byte-identical copy ⇒ `A --depends_on--> B`.

### Tests for User Story 2 (write first, must FAIL or be absent)

- [ ] T012 [US2] In `evidence-passes.test.ts` `describe('schemaPass')`, add **"identical
      single-service proto ⇒ edge points to the serving owner"** — repo B `grpcServices:
['orders.v1.OrderService']`, both A and B hold a digest with the same `sha256` and
      `identifiers: ['package:orders.v1','service:OrderService']`; assert exactly one
      connection `A --depends_on--> B` @ 0.9. (Contract C2.)
- [ ] T013 [US2] Add **"identical single-service proto, nobody serves it ⇒ no edge"** —
      same as T012 but neither repo lists the service in `grpcServices`; assert
      `connections` empty. (Contract C2 / FR-003.)
- [ ] T014 [US2] Add **"identical multi-service proto with one full owner ⇒ edges route to
      owner, not between non-owners"** — 3 repos, digest declares 2 services, repo C serves
      both; assert `A --depends_on--> C` and `B --depends_on--> C`, and no `A↔B` edge.
      (Contract C2, edge case.)
- [ ] T015 [US2] Run the file — T012/T014 FAIL (current code emits pairwise 0.9 for any
      identical copy, no owner routing). Commit failing tests.

### Implementation for User Story 2

- [ ] T016 [US2] Extend the identical-copy branch from T010: when `svcIds.length >= 1`
      and `ownersOf(digest, holders)` has **exactly one** owner `O`, emit
      `H --depends_on--> O` @ 0.9 for every other holder `H` (evidence text naming both
      files); emit nothing between non-owners. This subsumes the single-service case
      (`svcIds.length === 1`). Ensure the `svcIds.length === 0` path stays on the untouched
      pairwise branch. (Contracts C1–C3.)
- [ ] T017 [US2] Confirm direction and node ids reuse the existing `fileNodeId` helper
      for both endpoints exactly as the current branch does; `dedupeConnections` still wraps
      the return.
- [ ] T018 [US2] Run `pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` —
      T012/T013/T014 green; all US1 tests and the 3 pre-existing tests still green. Commit.

**Checkpoint**: the legitimate "A carries B's contract" signal is preserved and now
correctly directed; no non-owner↔non-owner edges.

---

## Phase 5: User Story 3 — proto-package-name drift on a workspace namespace (P2)

**Goal**: Sharing a package name + message with a large shared namespace is not treated as
bilateral drift. (Largely delivered by T008–T009; this phase adds the explicit scenarios
and the ≥3 boundary tests.)

**Independent Test**: `evidence-passes.test.ts` — package in 3+ repos with drift ⇒ no
edge; package in exactly 2 ⇒ edge unchanged.

### Tests for User Story 3

- [ ] T019 [US3] Add **"drift boundary: exactly 2 repos sharing a package ⇒ edge; adding
      a 3rd ⇒ edge gone"** — parametrised on holder count around `SHARED_NAMESPACE_MIN_REPOS`.
      (Contracts C4, C5.)
- [ ] T020 [US3] Add **"drift with no shared message ⇒ still no edge"** (regression guard
      for the untouched inner condition).
- [ ] T021 [US3] Run the file — new cases green (T008–T009 already implement the logic);
      if T019's 2-repo half fails, the guard was written too eagerly — fix in
      `evidence-passes.ts`. Commit.

**Checkpoint**: all three stories independently covered; drift signal precise on both
sides of the threshold.

---

## Phase 6: Cross-cutting verification

- [ ] T022 Determinism: `pnpm --filter @arch-atlas/llm-importer test -- multi-repo-correlation`
      and `deterministic-correlator` — byte-identical connection set across runs. (Contract C7,
      SC-005.)
- [ ] T023 No collateral movement: `pnpm --filter @arch-atlas/llm-importer test` (full
      suite — 234+ tests) + `lint` + `typecheck`. Confirm `grpc-pass`,
      `grpc-correlation.integration`, `review-assembly`, and the existing
      `'scores OpenAPI client coverage inclusively at the 50% boundary'` case are all
      unchanged. (Contract C6, C8, FR-005, FR-006.)
- [ ] T023a Assert FR-009: add a `describe('schemaPass')` case (or extend T004) proving a
      suppressed shared-contract case emits **zero** `connections` while any explanatory text
      it produces goes only to `notes` — and, via `assembleReviewFile` over that pass output,
      produces no review candidate / edge. (FR-009.)
- [ ] T024 Coverage: `pnpm --filter @arch-atlas/llm-importer test -- --coverage` ≥ 80 %
      lines/branches; every new branch in `schemaPass` (0-service / 1-owner / 0-owner /
      ≥2-owner / package≥3 / package≤2) hit. (Constitution III.)
- [ ] T025 Eval — reference workspace: `pnpm --filter @arch-atlas/analysis-runner-local
eval --set online-boutique --runs 3`. Expect `connectionsPrecision ≈ 0.93` (≥ 0.90),
      `connectionsRecall 1.0`, `grpcServicesF1` unchanged, no `--REGRESSION`. Record the 6→0
      schema-FP drop. (SC-001, SC-002, SC-003.)
- [ ] T026 Eval — fixtures: `pnpm --filter @arch-atlas/analysis-runner-local eval --set
fixtures --runs 3`. Expect connection metrics within `TOLERANCE` (0.05) of the committed
      baseline (no vendored multi-service contract → ~no change). (SC-004.)
- [ ] T027 Regenerate `packages/analysis-runner-local/eval/baseline.json` for
      `online-boutique` only (mirror 010's approach; leave `fixtures` values if they held).

---

## Phase 7: Docs & proof

- [ ] T028 [P] `CHANGELOG.md` — add an 011 entry under a new "Changed" heading (schemaPass
      no longer over-links shared multi-service contracts).
- [ ] T029 [P] `specs/009-grpc-cross-repo-correlation/research.md` D14 — append a line
      noting the follow-up landed as 011.
- [ ] T030 [P] Write `specs/011-schemapass-shared-contract/proof.md`: before/after eval
      numbers, the failing→passing unit tests, `git diff --stat` showing only
      `evidence-passes.ts` + its test + `baseline.json` + `specs/011-*` (+ CHANGELOG /
      009 research), determinism confirmation.
- [ ] T031 Final: `pnpm turbo run lint typecheck build` and `pnpm turbo run test -- --coverage`
      green across the monorepo; commit; open PR stacked on `main`.

---

## Dependencies & Execution Order

- **T001** → **T002, T003** (foundational, same file, sequential) → **US1 (T004–T011)** →
  **US2 (T012–T018)** (extends the same branch T010 built) → **US3 (T019–T021)** (asserts
  the T008–T009 guard) → **T022–T027** (verification, mostly sequential; T025/T026 need a
  reachable local model) → **T028–T031** (T028/T029/T030 are `[P]` — different files).
- US2's implementation (T016) directly edits the branch US1's T010 wrote → **not**
  parallelizable with US1.
- Every test task precedes its implementation task and must be observed failing first
  (constitution III).

## Parallel Opportunities

- T028, T029, T030 — three different files, after verification passes.
- Nothing else: the feature is one function in one file plus one test file.

## Implementation Strategy

MVP = Phase 3 (US1): kills the 6 false-positive edges and lifts precision. US2 restores
the one legitimate signal the blunt US1 rule would drop (recall guard); US3 hardens the
threshold. Ship after T025 confirms the eval target, with US2 included (recall must not
regress).

## Notes

- No new files. No `RepoEvidence` / `SchemaDigest` / parser / persisted-schema / CLI /
  Studio change (FR-008, FR-010).
- Commit after each task or logical group; keep the importer suite green at every commit.
- If the `SHARED_NAMESPACE_MIN_REPOS ≥ 3` guard proves insufficient on the eval, the
  research.md D5 fallback is to drop the drift signal entirely — do that only if T025
  still shows drift FPs.
