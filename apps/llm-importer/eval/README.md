# Importer eval harness

Dev-only. Nothing here ships — `files: ["dist"]` keeps every byte of `eval/` out of the npm
tarball. Two evals, **neither runs in CI** — both are local benchmarks you run when you touch a
correlation pass or the extraction procedure:

| eval            | command                                              | model? | CI? |
| --------------- | ---------------------------------------------------- | ------ | --- |
| **correlation** | `pnpm --filter @archatlas/llm-importer eval`         | no     | no  |
| **extraction**  | `pnpm --filter @archatlas/llm-importer eval:extract` | yes    | no  |

## Correlation eval

Deterministic and offline: it loads a golden set's committed `{repo}.analysis.json` artifacts,
runs the real `toCorrelationGraph` → `correlateDeterministically` pipeline against the repo
source on disk, and scores against `ground-truth.json`:

- **connections** — precision / recall / F1 over **every** directed cross-repo edge in
  `ground-truth.json`'s `connections[]`, edges to external systems included (`gateway → Keycloak`
  is a real edge). So an external system the correlator recovers must also appear as a
  `connections[]` row or it scores as a false positive here.
- **externalSystems** — precision / recall / F1 of the ground-truth `externalSystems[]` list
  against the connection targets that are not workspace repos. A focused second view on the same
  external edges. Recall is the headline — a dropped external dependency is the regression this
  exists to catch.

```bash
pnpm --filter @archatlas/llm-importer eval                     # report every golden set
pnpm --filter @archatlas/llm-importer eval -- --set bookshop   # just one
pnpm --filter @archatlas/llm-importer eval -- --check          # check against baseline.json
pnpm --filter @archatlas/llm-importer eval -- --update-baseline
```

`--check` exit codes: `0` every metric within `0.02` of (or above) baseline · `1` a metric
regressed (the offending `set.group.metric` is printed) · `2` `baseline.json` missing/invalid or
a `ground-truth.json` is internally inconsistent. Nothing calls `--check` in CI — run it yourself
before and after a correlation-pass change, the way you'd re-run a benchmark.
`eval/run.integration.test.ts` pins the same numbers as regular `pnpm test` assertions instead;
that suite is what CI actually gates on (see below).

### Moving the baseline

Changed a correlation pass and the numbers moved on purpose:

```bash
pnpm --filter @archatlas/llm-importer eval -- --update-baseline
git add apps/llm-importer/eval/baseline.json
```

The `baseline.json` diff is part of your PR and is reviewed like a snapshot.

### Prove the gate bites (SC-002)

```bash
# comment out `externalSystemConnections(...)` in src/correlate/deterministic-correlator.ts
pnpm --filter @archatlas/llm-importer eval -- --check   # → exit 1, externalSystems.recall → 0
```

`eval/run.integration.test.ts` pins this automatically (dropping `foundBy: 'external-outbound'`
connections collapses external recall to 0) — that test IS what runs in CI.

## Extraction eval (local only)

Scores produced `{repo}.analysis.json` against per-repo ground truth — `languages`,
`frameworks`, served interfaces, `outbound`. Needs analyses made by an agent per
`plugins/repo-analysis/AGENTS.md`. **Always exits 0. Never runs in CI.**

```bash
pnpm --filter @archatlas/llm-importer eval:extract -- --set bookshop --out ./architecture-output
```

With no `--out`, it scores the set's committed analyses (a sanity check on them, and — since
there's currently one golden set — the default when `--set` is omitted).

## The golden set

**`bookshop`** — the public [`examples/bookshop`](../../../examples/bookshop) demo workspace,
read in place via its `analyses:` config (no copy). Real polyglot code (Go, Java, TypeScript ×2,
Python) across HTTP, Kafka and six external systems — the benchmark, not a disposable synthetic
fixture. `pnpm test` runs it as `eval/run.integration.test.ts`; that suite, not this harness, is
what CI actually gates on.

### Adding another golden set

```
eval/golden/<name>/
├── eval.config.yaml     # name; workspace.local (dir of repo trees, relative to this file); repos[]
├── ground-truth.json    # repos{} + connections[] + externalSystems[]
└── analyses/            # optional: <repo>.analysis.json committed here …
```

`ground-truth.json`:

```jsonc
{
  "repos": {
    "svc-a": {
      "role": "…",
      "languages": ["Go"],
      "frameworks": ["Gin"],
      "served": {},
      "outbound": ["svc-b", "Keycloak"],
    },
    // …one entry per repo in eval.config.yaml
  },
  "connections": [
    { "from": "svc-a", "to": "svc-b", "kind": "http" },
    { "from": "svc-a", "to": "Keycloak", "kind": "auth" }, // external edges go here too
  ],
  "externalSystems": ["Keycloak"], // the non-repo targets, repeated for the focused recall metric
}
```

Analyses resolve from, in order: the config's `analyses:` path (relative to the config file) if
set — how `bookshop` reads the demo's committed analyses in place — else `golden/<name>/analyses/`
if that dir exists, else `../analyses` relative to `workspace.local`. Every `connections[].from` /
`.to` must be a `repos` key or an `externalSystems` entry — the loader rejects anything else with
exit 2.

A public source workspace committed as its own repo tree (rather than referenced in place like
`bookshop`) should be pinned by URL + SHA in a comment, analyses produced once and committed, the
source never vendored or cloned in CI. Private code (uds-sdk) is never committed in any form.

After adding a set: `eval -- --update-baseline --set <name>` and commit the new `baseline.json`
block — and add a describe block to `eval/run.integration.test.ts` pinning its scores, since that
test (not this harness on its own) is what CI gates on.
