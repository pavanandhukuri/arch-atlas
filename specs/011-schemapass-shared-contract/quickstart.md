# Quickstart: verifying 011 (schemaPass shared-contract fix)

## Prerequisites

- Node ≥ 22, `pnpm install` at repo root.
- For the eval step only: local oMLX endpoint reachable (see
  `packages/analysis-runner-local` README) and the Online Boutique golden workspace
  cloned (`pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique`
  clones it on first run; SHA pinned in `eval/golden/online-boutique/eval.config.yaml`).

## Unit level (fast, no model)

```bash
pnpm --filter @arch-atlas/llm-importer test -- evidence-passes
```

Expect the new `schemaPass` cases to pass:

- 3 repos vendoring an identical multi-service `.proto` ⇒ `connections` empty for that
  digest.
- repo A vendors an identical copy of the single-service `.proto` repo B serves ⇒ one
  `A --depends_on--> B` edge.
- shared `package` name across 3+ repos with drift ⇒ no drift edge.
- 2-repo drift and OpenAPI coverage cases ⇒ unchanged (still green).

Full importer suite (no regression anywhere else):

```bash
pnpm --filter @arch-atlas/llm-importer test
pnpm --filter @arch-atlas/llm-importer lint
pnpm --filter @arch-atlas/llm-importer typecheck
```

## Determinism check

```bash
pnpm --filter @arch-atlas/llm-importer test -- multi-repo-correlation
```

Runs the deterministic correlator twice over the same fixtures and asserts a byte-identical
connection set.

## Eval level (with model)

```bash
pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique --runs 3
```

Expect:

- `connectionsPrecision` ≈ **0.93** (up from 0.667), `connectionsRecall` **1.0**.
- gRPC-pass edges still **14 / 14**.
- No `--REGRESSION` flags.

Then regenerate the baseline for this set:

```bash
pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique --runs 3 --write-baseline
```

(Leave `fixtures` baseline untouched if `pnpm ... eval --set fixtures` stays within
tolerance — it has no vendored multi-service contract, so it should be unaffected.)

## What "done" looks like

- `spec.md` SC-001..SC-006 all demonstrable from the commands above.
- `git diff --stat` touches only:
  `apps/llm-importer/src/correlate/evidence-passes.ts`,
  `apps/llm-importer/test/unit/evidence-passes.test.ts`,
  `packages/analysis-runner-local/eval/baseline.json`,
  and the `specs/011-*` docs. No parser, no schema, no CLI, no Studio file.
