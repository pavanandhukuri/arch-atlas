# Proof: endpointPass — a bare data string is not a call (012)

Branch `012-endpointpass-wildcard-fp`, cut from `main` @ `8cfe034` (011 merged).

## 1. Scope of the diff

```
apps/llm-importer/src/correlate/evidence/parsers/routes.ts   # + staticSegmentCount(), exported
apps/llm-importer/src/correlate/evidence-passes.ts            # endpointPass: + 1 constant, + 1 guard
apps/llm-importer/test/unit/evidence-parsers.test.ts          # + staticSegmentCount cases (5)
apps/llm-importer/test/unit/evidence-passes.test.ts           # + endpointPass 012 cases (3)
CHANGELOG.md                                                    # Unreleased → Changed (012)
specs/011-schemapass-shared-contract/research.md               # D2 "Update:" pointer to 012
specs/009-grpc-cross-repo-correlation/research.md               # D14 "Update:" pointer to 012
specs/012-endpointpass-wildcard-fp/*                            # spec / plan / research / data-model /
                                                                 #   contract / quickstart / tasks / this file
packages/analysis-runner-local/eval/baseline.json               # regenerated online-boutique aggregate
```

No parser-shape, no `RepoEvidence`/`UrlLiteral`/`EndpointRoute`/persisted-schema, no CLI, no
Studio change. `git diff --stat main` confirms.

## 2. Behaviour contracts (unit) — evidence-passes.test.ts / evidence-parsers.test.ts

`pnpm --filter @arch-atlas/llm-importer test -- evidence-passes` → **31 passed** (28
pre-existing + 3 new). `pnpm --filter @arch-atlas/llm-importer test -- evidence-parsers` →
**26 passed** (25 pre-existing + 1 new, covering 5 assertions).

| Test                                                                                            | Contract        | Result              |
| ----------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| `012 C1: does not match a method-less literal against a low-specificity served route`           | C1, FR-001      | `connections` empty |
| `012 C2: still matches when the literal carries a method hint, even on a low-specificity route` | C2, FR-003      | one edge @ 0.85     |
| `012 C3: still matches a method-less literal against a route with two or more static segments`  | C3, FR-002      | one edge @ 0.7      |
| `staticSegmentCount counts only non-wildcard segments`                                          | helper contract | 5/5 assertions pass |
| 6 pre-existing `endpointPass` cases                                                             | C4, C5, FR-004  | unchanged, green    |

TDD: C1 was written first and observed **failing** against pre-012 `endpointPass` (`expected
[...] to have a length of +0 but got 1` — the exact adservice/frontend shape). C2 and C3 were
green from the start as regression guards, confirming the fix does not touch the paths it
must leave alone.

## 3. No collateral movement (FR-004, FR-005)

- `pnpm --filter @arch-atlas/llm-importer test` → **247 passed** (25 files, up from 243).
  `grpc-pass`, `grpc-correlation.integration`, `schemaPass`, `multi-repo-correlation.integration`,
  `model-free-pipeline.integration` all green and untouched.
- `multi-repo-correlation.integration.test.ts`'s `JSON.stringify` equality assertion holds —
  determinism preserved through the new guard (pure, order-independent per-pair check).
- `pnpm --filter @arch-atlas/llm-importer lint` — clean.
- `pnpm --filter @arch-atlas/llm-importer typecheck` — clean.
- `pnpm --filter @arch-atlas/llm-importer test -- --coverage` — importer aggregate 94.58 %
  lines / 85.45 % branch; `routes.ts` 100 % lines / 94.8 % branch; `evidence-passes.ts` 94.8 %
  lines / 88.97 % branch. ≥ 80 % gate met (constitution III).
- `pnpm turbo run lint typecheck build` → 28/28; `pnpm turbo run test -- --coverage` → 13/13.

## 4. Eval — reference-workspace numbers (SC-001..SC-004)

Run against a live local oMLX endpoint (`Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`,
`http://127.0.0.1:8000/v1`), 3 runs per set.

**Gotcha hit and fixed along the way (not a code defect, a process one):** the first eval
run came back with `connectionsPrecision` still at `0.933` — the fix appeared to do nothing.
Root cause: `packages/analysis-runner-local` depends on `@arch-atlas/llm-importer`'s **built**
`dist/`, not its TS source; the source edit was invisible to the eval until
`pnpm --filter @arch-atlas/llm-importer build` was re-run. Confirmed via
`grep staticSegmentCount dist/correlate/evidence-passes.js` that the rebuilt output carried
the new guard, then re-ran the eval. Documented as a gotcha in `quickstart.md`.

### online-boutique (SC-001, SC-002, SC-003, SC-004)

| Metric                   | Pre-012 baseline (011's) | Post-012 (this run) | Target                 |
| ------------------------ | -----------------------: | ------------------: | ---------------------- |
| `connectionsPrecision`   |                    0.933 |             **1.0** | 1.0 (SC-001) — **met** |
| `connectionsRecall`      |                      1.0 |             **1.0** | unchanged — **met**    |
| residual false positives |       1 (`endpointPass`) |      **0** (SC-002) | 0 — **met**            |

`connectionsPrecision` reaching a clean `1.0` means all 14 predicted connections on this
workspace are now true positives (14/14) — the entire 7-false-positive set documented across
009's D14 and 011's D2 is now gone (6 from `schemaPass`, 1 from `endpointPass`).

### fixtures (SC-004)

| Metric                 | Pre-012 baseline (011's) | Post-012 (this run) |
| ---------------------- | -----------------------: | ------------------: |
| `connectionsPrecision` |                      0.8 |                 0.8 |
| `connectionsRecall`    |                      0.8 |                 0.8 |

Byte-identical — as predicted, no fixtures repo serves a wildcard-segment route, so the new
guard's condition (`staticSegmentCount(route.path) <= 1`) never evaluates true there.
`eval/baseline.json`'s `fixtures` entry needed no regeneration; only `online-boutique`'s
aggregate changed (`connectionsPrecision` 0.933 → 1, plus small same-direction model-call
variance in `frameworksF1`/`meanDescriptionScore` unrelated to this fix, consistent with
011's documented "best-effort consistent, not byte-deterministic" LLM-call behaviour).

## 5. Constitution

III TDD + ≥ 80 % coverage — met (§2, §3). II type-safety — no `any`, no new cast; the new
helper and constant are plain, fully-typed primitives. I boundaries — change confined to
`src/correlate/` (two files). IV security / V supply-chain — no new external surface, zero
dependency change. No violations.
