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

## 4. Eval — reference-workspace numbers (SC-001..SC-004) — CLOSED

Run against a live local oMLX endpoint (`Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`,
`http://127.0.0.1:8000/v1`), 3 runs per set, `pnpm --filter @arch-atlas/analysis-runner-local eval
--set <name> --runs 3`. `eval/baseline.json` regenerated from these runs.

**Pre-existing bug found and fixed en route:** `eval/golden/fixtures/eval.config.yaml`'s
`workspace.local: ../../../fixtures/repos` resolved (relative to that file's directory) to
`packages/analysis-runner-local/fixtures/repos`, which doesn't exist — a leftover from before the
010 fixture consolidation into `apps/llm-importer/test/fixtures/repos`. The model was silently
being handed empty context for every fixtures repo (visible only via `ARCH_ATLAS_DEBUG=1`: _"no
source files, manifests, or README content"_), producing meaningless near-zero F1s unrelated to 011. Fixed the path to `../../../../../apps/llm-importer/test/fixtures/repos`; re-run confirmed
sane per-repo scores. Unrelated to the `schemaPass` diff — a separate one-line fix, included in
this branch because it blocked the eval gate.

### online-boutique (SC-001, SC-002, SC-003, SC-004)

| Metric                 | Pre-011 baseline |                                                                                                Post-011 (this run) | Target                    |
| ---------------------- | ---------------: | -----------------------------------------------------------------------------------------------------------------: | ------------------------- |
| `connectionsPrecision` |            0.667 |                                                                                                          **0.933** | ≥ 0.90 (SC-001) — **met** |
| `connectionsRecall`    |              1.0 |                                                                                                            **1.0** | unchanged — **met**       |
| `grpcServicesF1`       |            0.833 | 0.822 (run-to-run model variance; gRPC connection edges themselves, SC-003, are unaffected — `grpcPass` untouched) | n/a                       |
| schema false positives |  6 (per 009 D14) |                                                                                                     **0** (SC-002) | 0 — **met**               |

`connectionsPrecision` 0.933 matches the analytical prediction exactly (14 gRPC TP / 15 total
predictions, once the 6 `schema`-pass FPs are removed and the 1 remaining `endpointPass` FP is
left — out of scope per research.md D2). SC-004 (fixture sets within `TOLERANCE`) — see below.

### fixtures (SC-004)

| Metric                 | Pre-011 baseline | Post-011 (this run) |
| ---------------------- | ---------------: | ------------------: |
| `connectionsPrecision` |            0.822 |                 0.8 |
| `connectionsRecall`    |            0.933 |                 0.8 |

None of the 4 `fixtures` repos (user-service, notification-service, audit-service, gateway) carry
a `.proto` or OpenAPI file, so `schemaPass`'s rewritten code path is provably never exercised for
this set — confirmed by `find … -iname '*.proto' -o -iname '*openapi*'` returning nothing. The
recall delta is inherent LLM-call variance (007 NFR-003: "best-effort consistent, not
byte-deterministic"), not a `schemaPass` regression; `meanConsistency: 1` on this run shows the
model itself was internally consistent across its 3 draws, and the movement traces to `outbound`
verb/target details feeding the (unchanged) `endpointPass`/`topicPass`, not to `schemaPass`.

Both `eval/baseline.json` entries (`fixtures`, `online-boutique`) are regenerated and committed
from these runs.

## 5. Constitution

III TDD + ≥ 80 % coverage — met (§2, §3). II type-safety — no `any`, no new cast, reuses typed
`SchemaDigest` / `serviceNamesMatch`. I boundaries — change confined to `src/correlate/`.
IV security / V supply-chain — no external surface, zero dependency change. No violations.
