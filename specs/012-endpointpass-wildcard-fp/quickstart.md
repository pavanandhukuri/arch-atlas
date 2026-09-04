# Quickstart: endpointPass — a bare data string is not a call

## Verify the unit-level fix

```bash
pnpm --filter @arch-atlas/llm-importer test -- evidence-passes
pnpm --filter @arch-atlas/llm-importer test -- evidence-parsers
pnpm --filter @arch-atlas/llm-importer test          # full suite, no collateral movement
pnpm --filter @arch-atlas/llm-importer lint
pnpm --filter @arch-atlas/llm-importer typecheck
pnpm --filter @arch-atlas/llm-importer test -- --coverage
```

## Verify the live eval (requires a local model)

**Gotcha**: `packages/analysis-runner-local` depends on `@arch-atlas/llm-importer`'s built
`dist/`, not its TS source — a source-only edit is invisible to the eval until you rebuild:

```bash
pnpm --filter @arch-atlas/llm-importer build
```

```bash
export EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1
export EVAL_MODEL_ID=Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
export EVAL_MODEL_API_KEY=…

pnpm --filter @arch-atlas/analysis-runner-local eval --set online-boutique --runs 3
pnpm --filter @arch-atlas/analysis-runner-local eval --set fixtures --runs 3
```

Expect on `online-boutique`: `connectionsPrecision: 1`, `connectionsRecall: 1`.
Expect on `fixtures`: connection metrics within `TOLERANCE` (0.05) of the committed
baseline (this feature's guard only fires on wildcard-segment routes, and no fixtures repo
serves one).

## Monorepo-wide check before opening a PR

```bash
pnpm turbo run lint typecheck build
pnpm turbo run test -- --coverage
```

## The "done" diff shape

```
apps/llm-importer/src/correlate/evidence/parsers/routes.ts   # + staticSegmentCount, exported
apps/llm-importer/src/correlate/evidence-passes.ts            # endpointPass: + 1 constant, + 1 guard
apps/llm-importer/test/unit/evidence-parsers.test.ts          # + staticSegmentCount cases
apps/llm-importer/test/unit/evidence-passes.test.ts           # + endpointPass 012 cases
packages/analysis-runner-local/eval/baseline.json              # regenerated online-boutique
CHANGELOG.md                                                    # + 012 entry
specs/011-schemapass-shared-contract/research.md (or 009's)    # pointer to 012 closing the FP
specs/012-endpointpass-wildcard-fp/*                            # this feature's own docs
```
