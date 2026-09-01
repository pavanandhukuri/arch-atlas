# Quickstart: gRPC-Aware Cross-Repository Correlation

## What changes for a user

Nothing in how you run the importer. After this feature, a workspace whose services call each other
over gRPC produces an architecture diagram with the **connections between those services drawn**
(previously the containers appeared but nothing linked them). Each gRPC connection carries evidence
naming the source file and line where the client stub is constructed, and — where the downstream
chain allows — is labelled with the `gRPC` transport.

No config, no new flags, no new prerequisites. Still fully local, no model call in the correlation
path.

## Run it

```bash
pnpm --filter @arch-atlas/llm-importer build
node apps/llm-importer/dist/cli.js import.yaml
```

The per-step progress output gains a line:

```
  grpc: 12 connection(s)
```

alongside the existing `manifest:`, `endpoint:`, `schema:`, `compose:`, `topic:` lines.

## Verify (developer)

```bash
# Unit + integration (fast, no model)
pnpm --filter @arch-atlas/llm-importer test -- grpc

# Full package suite must stay green
pnpm --filter @arch-atlas/llm-importer test

# Typecheck + lint
pnpm --filter @arch-atlas/llm-importer lint
```

## Proof gate (live, one-time)

Requires a local OpenAI-compatible model server (e.g. oMLX at `http://127.0.0.1:8000/v1`).

```bash
cd apps/llm-importer

# Before/after on the all-gRPC reference workspace
EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1 \
EVAL_MODEL_ID=Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
EVAL_MODEL_API_KEY=… \
pnpm eval --set online-boutique --runs 2 --no-judge

# Regression check on the gRPC-free set
pnpm eval --set fixtures --runs 3 --no-judge --check
```

**Pass criteria** (recorded in `specs/009-grpc-cross-repo-correlation/proof.md`):

- `online-boutique` `connectionsRecall` rises from `0` to `≥ 0.70`, `connectionsPrecision ≥ 0.80`.
- `fixtures` metrics unchanged within `±0.05` (the harness `TOLERANCE`).
- Commit the refreshed `test/eval/baseline.json`.

## Try it on a minimal fixture

`test/fixtures/repos/catalog-service/` serves a gRPC `CatalogService` (`.proto` + a tiny Go server);
`test/fixtures/repos/storefront/` constructs a `CatalogService` client stub. The integration test
`test/integration/grpc-correlation.integration.test.ts` runs the mocked-model pipeline over that pair
and asserts a single directed `storefront → catalog-service` `calls` connection with gRPC evidence.
