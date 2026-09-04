# `test/eval/` — analysis-quality eval

Measures how well the bounded analysis call (`analyzeRepo`) + the deterministic
correlator recover a repo's real architecture, against hand-labelled ground
truth. Not part of `pnpm test` — needs a live local model.

```bash
export EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1
export EVAL_MODEL_ID=Qwen3-Coder-30B-A3B-Instruct-MLX-4bit
export EVAL_MODEL_API_KEY=…            # if your server needs one

pnpm eval                              # all sets, 3 runs each, writes baseline.json
pnpm eval --set fixtures --runs 5      # one set, more runs (better variance estimate)
pnpm eval --check                      # diff a fresh run vs the committed baseline; exit 1 on regression
pnpm eval --no-judge                   # skip the description LLM-judge (faster)
pnpm eval --agentic                    # include the agentic fallback in connection scoring
```

## Golden sets (`golden/<name>/`)

| Set               | Source                                                                                                                                                                                 | Notes                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `fixtures`        | the in-repo `test/fixtures/repos/`                                                                                                                                                     | tiny, offline, exact ground truth — a fast regression guard   |
| `online-boutique` | `GoogleCloudPlatform/microservices-demo`, cloned at a **pinned SHA** into `golden/online-boutique/workspace/` (git-ignored) — the polyglot demo Understand-Anything's README points at | real Go/C#/Node/Python/Java; all inter-service calls are gRPC |

Each has `eval.config.yaml` (where the repos are) and `ground-truth.json` (the
checkable subset of the true architecture — see `types.ts`). Matching is
deliberately lenient (`ASP.NET Core` ~ `ASP.NET`, `cart-service` ~ `cartservice`,
`/v1/users/:id` ~ `/v1/users/{userId}`).

## Metrics

Per repo, averaged over N runs:

- **precision / recall / F1** for `languages`, `frameworks`, `served.{httpRoutes,grpcServices,topics,datastores}`, and `outbound` targets
- **consistency** — mean pairwise Jaccard of each served-field set across the N runs (`1.0` = the model returned the same set every run; this is the number that shows whether the low sampling temperature is doing its job)
- **descriptionScore** — an LLM-judge (the same local model) rates `description` 1–5 against the repo's true role

Workspace-level: **connection precision / recall** vs. the known service graph.

`baseline.json` holds the aggregate metrics per set; `--check` fails when any
metric drops more than `0.05` below it. Run `--check` with the **same `--runs`
and judge setting** the baseline was written with (metrics like `meanConsistency`
and `meanDescriptionScore` are sensitive to both). Re-run `pnpm eval --set <name>`
and commit `baseline.json` when a change is a genuine improvement.

## Current baseline reading (Qwen3-Coder-30B on oMLX, as of 011)

- **Connections are solid:** `connectionsPrecision` 0.933, `connectionsRecall` 1.0 on Online
  Boutique — `grpcPass` (009) draws the gRPC call edges, `schemaPass` (011) no longer
  over-links repos that merely vendor a copy of the same multi-service `.proto`. The one
  remaining precision point is an `endpointPass` false positive (out of scope for 011 — see
  research.md D2).
- **Per-repo extraction is solid:** languages F1 = 1.0, frameworks F1 ≈ 0.89, http routes F1 =
  0.9 on the real polyglot workspace; `consistency` ≈ 0.95 (temperature 0.1 makes runs
  near-identical).
- **Known gaps the eval still surfaces:** `grpcServices` F1 ≈ 0.82 (occasional own-service
  miss / extra service on `frontend`); Redis on the C# `cartservice` not always detected. These
  affect per-repo `served` extraction only, not `grpcPass`'s connection-drawing (it reads
  literal `.proto`/stub-construction sites, not this field) — see 009's research for that
  pass's own scope.

Historical note: prior to 009, `connectionsRecall` on Online Boutique was 0 (every edge there
is gRPC and the correlator had no gRPC-aware pass). Prior to 011, `connectionsPrecision` was
capped at ~0.667 by the shared-`.proto`-vendoring false positives above.
