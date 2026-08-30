# Tasks: gRPC-Aware Cross-Repository Correlation

**Input**: Design documents from `/specs/009-grpc-cross-repo-correlation/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md, contracts/ (3)

**Tests**: MANDATORY — constitution Principle III (TDD, NON-NEGOTIABLE). Every implementation task
is preceded by a test task that must be written first and must fail before the implementation task
starts. Coverage gate ≥ 80% on changed files.

**Working directory for all paths**: `apps/llm-importer/`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task — may run in parallel
- **[Story]**: US1 / US2 / US3 (from spec.md); Setup / Foundational / Polish have no story label

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] Add gRPC caller/callee test fixture pair:
      `test/fixtures/repos/catalog-service/` — `catalog.proto` (`package shop; service CatalogService { rpc GetItem(...) returns (...); }`), `go.mod` (`module shop/catalog-service`), `cmd/server/main.go` (registers `RegisterCatalogServiceServer`), `README.md`.
      `test/fixtures/repos/storefront/` — `go.mod` (`module shop/storefront`), `internal/catalog/client.go` (`client := pb.NewCatalogServiceClient(conn)`), `README.md`. Keep both minimal (mirrors existing `audit-service`/`gateway` fixtures).
- [x] T002 [P] Add pre-canned analysis fixtures for the pair:
      `test/fixtures/analyses/catalog-service.analysis.json` (`served.grpcServices: ["shop.CatalogService"]`), `test/fixtures/analyses/storefront.analysis.json` (`outbound: [{ target: "catalog-service", verb: "calls", detail: "..." }]`, no `grpcServices`). Match the existing pre-canned `*.analysis.json` shape.
- [x] T003 Update `test/fixtures/README.md` to list the new `catalog-service` / `storefront` repos and their intended gRPC caller→callee relationship.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user-story work starts until this phase is done.** These are the shared type contracts.

- [x] T004 [P] In `src/correlate/evidence/types.ts`: add the `GrpcClientRef` interface (fields
      `relPath`, `line`, `service`, `form: 'go'|'csharp'|'node'|'python'|'java'|'generic'`) per
      `data-model.md`. Add `grpcServices: string[]` and `grpcClientRefs: GrpcClientRef[]` to the
      `RepoEvidence` interface (both required, populated as `[]` when absent). TSDoc per data-model.
- [x] T005 [P] In `src/correlate/deterministic-correlator.ts`: add optional `transport?: 'grpc'` to
      the `CrossRepositoryConnection` interface with the TSDoc from `data-model.md` (in-memory only,
      consumed solely by `assemble-review.ts`).
- [x] T006 Fix all resulting type errors in existing `RepoEvidence` constructions (there is exactly
      one, in `src/correlate/evidence/collect.ts` `collectRepoEvidence` — initialise both new fields to
      `[]`). Run `pnpm --filter @arch-atlas/llm-importer typecheck` → clean. No behaviour change yet.

**Checkpoint**: types compile; every existing test still green (`pnpm test`).

---

## Phase 3: User Story 1 — gRPC calls appear in the architecture diagram (Priority: P1) 🎯 MVP

**Goal**: A workspace whose services talk over gRPC yields directed `calls` connections with
file/line evidence.

**Independent Test**: run the mocked-model integration test over the `catalog-service` / `storefront`
fixture pair → exactly one `storefront → catalog-service` `calls` connection, `foundBy: 'evidence'`,
gRPC evidence text; nothing in reverse.

### Tests for User Story 1 (write first, must fail)

- [x] T007 [P] [US1] `test/unit/grpc-parser.test.ts` — per `contracts/grpc-client-parser-contract.md`
      test matrix: one positive per `form` (go/csharp/node/python/java) with a realistic line, `generic`
      fallback, every "MUST NOT emit" negative (HTTP client, DB/SDK client, bare type ref, import,
      comment/string), `normalizeServiceName` table, `serviceNamesMatch` table (both arg orders),
      multi-match line collapses to one ref, ascending-line ordering.
- [x] T008 [P] [US1] `test/unit/grpc-pass.test.ts` — per `contracts/grpc-pass-contract.md` G1–G9
      matrix: single match → one directed connection (weight 0.8, `foundBy 'evidence'`,
      `transport 'grpc'`, evidence asserts file/line/service); proto-only served name →
      `targetNodeId === moduleNodeId`; `generic` form → weight 0.7; `C === P` → no connection;
      unknown service → no connection + no note; 2-repo ambiguity → 2 connections weight ≤ 0.45 + one
      note naming both; 3 refs same pair → 1 connection after dedupe; determinism (`JSON.stringify`
      equal across two runs); package-qualified vs bare Go stub → match.
- [x] T009 [P] [US1] `test/unit/evidence-collect.test.ts` — additions per
      `contracts/evidence-collection-contract.md`: `grpcServices` = union (graph `endpoint:grpc:*` names
      ∪ proto `service:` ids), de-duped + sorted; `grpcClientRefs` populated from a Go client file with
      correct `relPath`/`line`/`service`/`form`; no-gRPC repo → both `=== []` (not `undefined`);
      root-unavailable repo → `grpcClientRefs === []` but `grpcServices` still has the graph contribution.
- [x] T010 [P] [US1] `test/integration/grpc-correlation.integration.test.ts` — stub the model to
      return the pre-canned `RepoAnalysis` per fixture repo (or read `test/fixtures/analyses/*.json`),
      `toCorrelationGraph` → `correlateDeterministically` → assert exactly the directed
      `storefront → catalog-service` `calls` connection with `foundBy: 'evidence'` + gRPC evidence, and
      that the `passSummaries` include a `grpc: 1 connection(s)` line (FR-015).

### Implementation for User Story 1

- [x] T011 [US1] Create `src/correlate/evidence/parsers/grpc.ts`: `extractGrpcClientRefs(relPath,
content): GrpcClientRef[]`, `normalizeServiceName(raw): string`, `serviceNamesMatch(a, b): boolean`
      — exactly per `contracts/grpc-client-parser-contract.md` (line-oriented regex scan, same style as
      `parsers/routes.ts`/`parsers/topics.ts`, no filesystem, no new dependency). Make T007 pass.
- [x] T012 [US1] In `src/correlate/evidence/collect.ts`: call `extractGrpcClientRefs(rel, content)`
      inside the existing `CODE_EXTENSIONS.has(ext)` branch (next to `extractUrlLiterals` /
      `extractTopicRefs`); after the walk loop compute `evidence.grpcServices` (union of
      `graph.nodes` `endpoint:grpc:*` names and `schemaDigests` `service:` ids, de-duped + sorted); set
      `grpcServices` from the graph on the early `return evidence` (root-unavailable) path too. Make T009
      pass. No change to any existing field or to `collectEvidence`'s signature.
- [x] T013 [US1] In `src/correlate/evidence-passes.ts`: implement `grpcPass: EvidencePass` per
      `contracts/grpc-pass-contract.md` (helpers: local `grpcEndpointNodeId`, reuse existing
      `fileNodeId` / `moduleNodeId` / `dedupeConnections`). Import `normalizeServiceName` /
      `serviceNamesMatch` from `parsers/grpc.js`. Register in `EVIDENCE_PASSES` between `endpointPass`
      and `schemaPass`. Make T008 pass.
- [x] T014 [US1] Run T010; fix any wiring gaps. Confirm the reverse-direction connection is absent
      and `catalog-service → storefront` is not produced by any pass.

**Checkpoint**: US1 fully functional — `pnpm test -- grpc` green; MVP deliverable.

---

## Phase 4: User Story 2 — existing correlations unaffected (Priority: P1)

**Goal**: HTTP / topic / manifest / schema / compose correlation output is byte-identical; a
gRPC-free run is unchanged; the pipeline is deterministic.

**Independent Test**: full existing correlation regression suite + the `fixtures` eval set (no gRPC)
show identical connection counts, directions, confidence buckets, evidence strings.

### Tests for User Story 2 (write first, must fail if a regression exists)

- [x] T015 [P] [US2] `test/unit/evidence-passes.test.ts` (or the existing correlator test file) —
      add: with a `CorrelationInput` containing **no** `grpcClientRefs` and **no** `grpcServices`,
      `grpcPass` returns `{ pass: 'grpc', connections: [], notes: [] }`; and the full
      `EVIDENCE_PASSES` run over an all-HTTP fixture set produces the same connection set as before
      (snapshot / explicit assertions).
- [x] T016 [P] [US2] Determinism assertion in `test/unit/grpc-pass.test.ts` extended: two
      `correlateDeterministically` runs over the same fixture graphs yield deep-equal ordered
      `connections` arrays (SC-004).

### Implementation / verification for User Story 2

- [x] T017 [US2] Run the whole package suite: `pnpm --filter @arch-atlas/llm-importer test`. Every
      pre-existing test passes unmodified. If any existing test needed a change, it is a regression —
      fix the pass, not the test (only exception: tests that construct `RepoEvidence` literals may need
      the two new `[]` fields added — that is mechanical, not a behaviour change).
- [x] T018 [US2] `pnpm --filter @arch-atlas/llm-importer lint` and `... typecheck` → clean
      (`noUncheckedIndexedAccess`, no `any`, no non-null assertions in new code).

**Checkpoint**: US1 + US2 both hold; no regression.

---

## Phase 5: User Story 3 — gRPC connections carry a transport label (Priority: P3)

**Goal**: gRPC `calls` connections surface as review candidate `type: 'grpc'` (already a valid
`CandidateType`; `diagram-builder.ts` already maps `grpc → 'calls'`; Studio already parses it) instead
of the generic `http`.

**Independent Test**: assemble a review file from a connection list containing one
`transport: 'grpc'` `calls` connection and one plain `calls` connection → first candidate `type` is
`'grpc'`, second is `'http'`; everything else identical.

### Tests for User Story 3 (write first, must fail)

- [x] T019 [P] [US3] `test/unit/review-assembly.test.ts` — add: a `CrossRepositoryConnection` with
      `type: 'calls'` + `transport: 'grpc'` → `Candidate.type === 'grpc'`; a `calls` connection without
      `transport` → `Candidate.type === 'http'` (unchanged); confidence bucket + reasoning text
      unchanged in both cases.

### Implementation for User Story 3

- [x] T020 [US3] In `src/review/assemble-review.ts`: in the candidate-type resolution, add a single
      leading branch — `connection.type === 'calls' && connection.transport === 'grpc'` ⇒ `'grpc'` —
      before the existing `EDGE_TYPE_TO_CANDIDATE_TYPE[...] ?? 'http'`. No other change; existing
      connections (no `transport`) map exactly as before (FR-013).
- [x] T021 [US3] Extend `test/integration/grpc-correlation.integration.test.ts`: assert the
      assembled review file's candidate for `storefront → catalog-service` has `type: 'grpc'`, and the
      built `.arch.json` relationship has `type: 'calls'` (via the existing `grpc → 'calls'` map). If any
      downstream consumer breaks, drop T020 (FR-016 fallback) and record that in `proof.md`.

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Proof Gate

- [x] T022 [P] Update `apps/llm-importer/README.md` — correlation-passes section: add `grpc` to the
      list of deterministic evidence passes with a one-line description (client stub construction ↔
      served gRPC service).
- [x] T023 [P] Update `apps/llm-importer/CHANGELOG.md` — user-facing: "gRPC service-to-service calls
      are now detected and drawn as connections (previously only HTTP, topics, manifests, compose)."
- [x] T024 [P] Update root `CHANGELOG.md` if it tracks importer features (match the 008 entry style).
- [x] T025 Coverage check: `pnpm --filter @arch-atlas/llm-importer test -- --coverage` — new files
      (`parsers/grpc.ts`, `grpcPass`) ≥ 80% line/statement; add cases if short.
- [x] T026 **Live proof gate** — with local oMLX running, from `apps/llm-importer/`:
      `pnpm eval --set online-boutique --runs 3 --no-judge` and `pnpm eval --set fixtures --runs 3 --no-judge`.
      Record before (online-boutique recall 0 / precision 0) and after in
      `specs/009-grpc-cross-repo-correlation/proof.md` with the full aggregate blocks and a per-edge
      TP/FP/FN table for the gRPC pass. Pass:
  - online-boutique `connectionsRecall` = 1.0; **every `transport: 'grpc'` connection is a
    true positive** (see D14 — workspace-wide `connectionsPrecision` is capped by pre-existing
    `schemaPass`/`endpointPass` FPs that FR-013 forbids touching);
  - `fixtures` connection metrics within ±0.05 of the committed baseline.
- [x] T027 Commit the refreshed `test/eval/baseline.json` (both `online-boutique` and, if it moved
      within tolerance, `fixtures`). Note the delta in `proof.md`.
- [x] T028 Run `specs/009-grpc-cross-repo-correlation/quickstart.md` end-to-end as written; fix any
      drift between the doc and reality.
- [x] T029 Final gate: `pnpm --filter @arch-atlas/llm-importer lint build test` all green; `git status`
      reviewed (no stray fixture workspace, no `tsbuildinfo`).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: T001–T003 independent, all [P].
- **Phase 2 (Foundational)**: T004, T005 [P]; T006 after both. **Blocks Phases 3–5.**
- **Phase 3 (US1)**: tests T007–T010 [P] first (must fail) → T011 → T012 → T013 → T014. T012 & T013
  both edit different files but T013's pass logic needs T011's exports; T012 independent of T011.
- **Phase 4 (US2)**: T015–T016 [P] after Phase 3; T017–T018 after. Can overlap Phase 5.
- **Phase 5 (US3)**: T019 [P] → T020 → T021. Depends only on Phase 2 (needs `transport` field) +
  Phase 3 (needs `grpcPass` to set it for the integration assertion in T021).
- **Phase 6 (Polish)**: T022–T024 [P] anytime after Phase 3; T025–T029 last, in order.

### Story independence

- US1 is the MVP and stands alone.
- US2 is verification of US1's additivity — no new production code beyond mechanical `[]` fields.
- US3 is a 3-line additive change gated behind its own flag (`transport`), fully removable per FR-016.

## Parallel example (Phase 3 kickoff)

```
T007 grpc-parser.test.ts   ┐
T008 grpc-pass.test.ts     ├─ all [P], write together, watch them fail
T009 evidence-collect.test ┘
T010 grpc-correlation.integration.test.ts  [P]
```

## Implementation strategy

MVP = Phases 1 + 2 + 3 (US1). Ship/demo. Then Phase 4 (prove no regression), Phase 5 (label polish),
Phase 6 (docs + live eval proof + baseline commit).
