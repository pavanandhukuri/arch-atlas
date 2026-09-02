# Proof: schemaPass — shared multi-service contract is not a dependency (011)

Branch `011-schemapass-shared-contract`, cut from `main` @ `4498405`.

## 1. Scope of the diff

```
apps/llm-importer/src/correlate/evidence-passes.ts   # schemaPass: 2 consts + serviceIdsOf() + rewritten signal-1 / signal-2 guards
apps/llm-importer/test/unit/evidence-passes.test.ts   # +10 schemaPass cases (011 C1..C7), existing 3 unchanged
CHANGELOG.md                                          # Unreleased → Changed (011)
specs/009-grpc-cross-repo-correlation/research.md      # D14 "Update:" pointer to 011
specs/011-schemapass-shared-contract/*                 # spec / plan / research / data-model / contract / quickstart / tasks / this file
```

No parser, no `RepoEvidence` / `SchemaDigest` field, no persisted-schema, no CLI, no Studio
change. `git diff --stat main` confirms.

## 2. Behaviour contracts (unit) — `apps/llm-importer/test/unit/evidence-passes.test.ts`

`pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` → **28 passed** (19 pre-existing

- 10 new; one pre-existing `schemaPass` case renamed content-equivalent).

| Test                                                                                          | Contract         | Result                                                                                          |
| --------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `011 C1: identical multi-service proto vendored by 3 repos ⇒ no cross-repo edge`              | C1, FR-001       | `connections` empty; a `notes` line names it a shared contract (FR-009)                         |
| `011 C1: multi-service copy — a full owner still gets directed edges, non-owners do not link` | C2 edge case     | only `currencyservice→checkoutservice`, `paymentservice→checkoutservice`; no `currency↔payment` |
| `011 C2: identical single-service proto ⇒ edge points to the serving owner`                   | C2, FR-002       | one edge `gateway --depends_on--> orders-service` @ 0.9                                         |
| `011 C2/FR-003: identical single-service proto nobody serves ⇒ no edge`                       | C2, FR-003       | `connections` empty                                                                             |
| `011 C3: identical service-less schema copy ⇒ unchanged pairwise depends_on`                  | C3               | `producer --depends_on--> consumer` @ 0.9, evidence "identical schema content …"                |
| `011 C4: proto-package drift suppressed when the package is held by ≥3 repos`                 | C4, FR-004       | `connections` empty                                                                             |
| `011 C5: proto-package drift between exactly 2 repos still fires`                             | C5               | one edge @ 0.4, evidence "drift"                                                                |
| `011: drift with a shared package but no shared message ⇒ still no edge`                      | regression guard | `connections` empty                                                                             |
| `011 C7: schemaPass output is byte-identical across repeated runs`                            | C7, SC-005       | `JSON.stringify` equal                                                                          |
| pre-existing `links identical schema copies at high weight` (`package:acme`, 0 svc, 2 repos)  | C3               | unchanged, green                                                                                |
| pre-existing `flags proto drift` (`package:acme.events`, 2 repos)                             | C5               | unchanged, green                                                                                |
| pre-existing `scores OpenAPI client coverage inclusively at the 50% boundary`                 | C6, FR-005       | unchanged, green                                                                                |

TDD: C1 (×2), C2/FR-003, C4 were written first and observed **failing** against the pre-011
`schemaPass` (`git show` of the test-only commit); the remaining new cases were green from the
start as regression guards.

## 3. No collateral movement (C8, FR-006, FR-007)

- `pnpm --filter @arch-atlas/llm-importer test` → **243 passed** (25 files). `grpc-pass` (12),
  `grpc-correlation.integration` (2), `deterministic-correlator`, `review-assembly`,
  `multi-repo-correlation.integration` (2), `model-free-pipeline.integration` all green and
  untouched.
- `multi-repo-correlation.integration.test.ts` asserts `JSON.stringify(run2.connections) ===
JSON.stringify(run1.connections)` — determinism holds through the restructure.
- `pnpm --filter @arch-atlas/llm-importer lint` — clean (the rewrite uses no non-null assertion;
  `holders.entries()` / `.slice()` satisfy `noUncheckedIndexedAccess`).
- `pnpm --filter @arch-atlas/llm-importer typecheck` — clean.
- `pnpm turbo run lint typecheck build` → **28/28**; `pnpm turbo run test -- --coverage` →
  **13/13** (importer coverage 94.5 % lines / 85.3 % branch, `src/correlate` 95.4 % / 88.6 %;
  ≥ 80 % gate met — constitution III).

## 4. Eval — reference-workspace numbers (SC-001..SC-004) — PENDING

Blocked in this session: the local OpenAI-compatible endpoint (`http://127.0.0.1:8000/v1`) was
not running (`curl` → connection refused), so the per-repo analysis half of
`pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique` could not execute.

The deterministic behaviour the eval would measure is, however, fully pinned by §2:

- C1 / C4 encode exactly the Online Boutique false-positive scenario (3 repos with an identical
  `demo.proto` declaring ≥ 2 services; `package hipstershop` in ≥ 3 repos with drift) and both
  assert **zero** emitted connections. Per 009 D14 these are the 6 `schema` FP edges → expected
  `connectionsPrecision` 0.667 → ~0.93 (14 gRPC TP / 15 predictions), `connectionsRecall` 1.0
  unchanged, gRPC edges 14/14 unchanged.
- `fixtures` set has no vendored multi-service contract → `schemaPass` emits nothing for it →
  connection metrics unchanged (within `TOLERANCE`).

**To close:** start the local model, then

```
pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique --runs 3
pnpm --filter @arch-atlas/analysis-runner-local eval --set fixtures --runs 3
# then regenerate the online-boutique baseline entry
```

and record the numbers here (§4) + `eval/baseline.json`.

## 5. Constitution

III TDD + ≥ 80 % coverage — met (§2, §3). II type-safety — no `any`, no new cast, reuses typed
`SchemaDigest` / `serviceNamesMatch`. I boundaries — change confined to `src/correlate/`.
IV security / V supply-chain — no external surface, zero dependency change. No violations.
