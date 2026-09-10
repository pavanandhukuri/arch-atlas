# Quickstart: Eval Harness

Everything runs from the repo root. The correlation eval is **deterministic, offline, no model**.

## Run the report

```bash
pnpm --filter @archatlas/llm-importer eval
```

Prints, per golden set: the expected vs. predicted cross-repo connections and external systems, and
precision / recall / F1 for each. With a `baseline.json` present, adds a `✓/✗ vs baseline` column.

## Gate (what CI runs)

```bash
pnpm --filter @archatlas/llm-importer eval -- --check
```

- exit `0` — every metric within `0.02` of (or above) the committed baseline
- exit `1` — a metric regressed; the output names `set.metric: baseline X → current Y (Δ −Z)`
- exit `2` — `baseline.json` missing/invalid, or a ground-truth file is internally inconsistent

## Accept a deliberate metric change

You changed a correlation pass and the numbers moved on purpose:

```bash
pnpm --filter @archatlas/llm-importer eval -- --update-baseline
git add apps/llm-importer/eval/baseline.json
```

The baseline diff is part of your PR and gets reviewed like a snapshot.

## Prove the gate works (SC-002)

```bash
git stash                                   # or comment out externalSystemConnections(...) in
                                            # src/correlate/deterministic-correlator.ts
pnpm --filter @archatlas/llm-importer eval -- --check   # → exit 1, externalSystems.recall collapsed
git stash pop
```

## Extraction eval (local only — needs analyses produced by an agent)

```bash
pnpm --filter @archatlas/llm-importer eval:extract -- --set fixtures --out ./architecture-output
```

Per-repo, per-field precision / recall / F1 for `languages` / `frameworks` / served interfaces /
`outbound`. Always exits `0` — it's a report. **Never runs in CI.**

## Add a golden set

1. `apps/llm-importer/eval/golden/<name>/eval.config.yaml`

   ```yaml
   name: <name>
   workspace:
     local: ../../../<path-to-a-dir-of-repo-trees> # relative to this file
   repos:
     - { name: svc-a, path: svc-a }
     - { name: svc-b, path: svc-b }
   ```

2. `apps/llm-importer/eval/golden/<name>/ground-truth.json`

   ```jsonc
   {
     "repos": {
       "svc-a": {
         "role": "...",
         "languages": ["Go"],
         "frameworks": ["Gin"],
         "served": { "httpRoutes": ["/v1/things"] },
         "outbound": ["svc-b"],
       },
       "svc-b": {
         "role": "...",
         "languages": ["Java"],
         "frameworks": ["Spring Boot"],
         "served": {},
         "outbound": [],
       },
     },
     "connections": [{ "from": "svc-a", "to": "svc-b", "kind": "http" }],
     "externalSystems": ["Amazon S3", "Keycloak"],
   }
   ```

   Every `from`/`to` must be a `repos` key or listed in `externalSystems`.

3. Provide the analyses: either commit `<name>.analysis.json` next to `eval.config.yaml` under an
   `analyses/` dir, **or** (like the `fixtures` set) point `workspace.local` at an existing tree and
   rely on committed analyses elsewhere. The public `microservices-demo` set commits its analyses;
   its source repo is referenced by URL + pinned SHA in a comment only — never vendored.

4. `pnpm --filter @archatlas/llm-importer eval -- --update-baseline` and commit the new
   `baseline.json` block.

## Where things live

```
apps/llm-importer/eval/
├── README.md            # the canonical version of this doc
├── run.ts               # correlation eval (this is `eval`)
├── extract.ts           # extraction eval (`eval:extract`)
├── score.ts             # pure scoring math — importable, no I/O, no model
├── score.test.ts        # runs with `pnpm test`
├── types.ts  schema.ts  load.ts
├── baseline.json        # committed regression reference
└── golden/<name>/{eval.config.yaml, ground-truth.json[, analyses/]}
```
