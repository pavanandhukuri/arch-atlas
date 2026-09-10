# Importer eval harness

Dev-only. Nothing here ships — `files: ["dist"]` keeps every byte of `eval/` out of the npm
tarball. Two evals:

| eval            | command                                              | model? | CI? |
| --------------- | ---------------------------------------------------- | ------ | --- |
| **correlation** | `pnpm --filter @archatlas/llm-importer eval`         | no     | yes |
| **extraction**  | `pnpm --filter @archatlas/llm-importer eval:extract` | yes    | no  |

## Correlation eval (the CI gate)

Deterministic and offline: it loads a golden set's committed `{repo}.analysis.json` artifacts,
runs the real `toCorrelationGraph` → `correlateDeterministically` pipeline against the repo
source on disk, and scores against `ground-truth.json`:

- **connections** — directed cross-repo edge precision / recall / F1 (external systems included:
  `gateway → Keycloak` is a real edge).
- **externalSystems** — precision / recall / F1 of the ground-truth `externalSystems` list
  against the connection targets that are not workspace repos. Recall is the headline — a
  dropped external dependency is the regression this exists to catch.

```bash
pnpm --filter @archatlas/llm-importer eval                     # report every golden set
pnpm --filter @archatlas/llm-importer eval -- --set fixtures   # just one
pnpm --filter @archatlas/llm-importer eval -- --check          # gate against baseline.json
pnpm --filter @archatlas/llm-importer eval -- --update-baseline
```

`--check` exit codes: `0` every metric within `0.02` of (or above) baseline · `1` a metric
regressed (the offending `set.group.metric` is printed) · `2` `baseline.json` missing/invalid or
a `ground-truth.json` is internally inconsistent.

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
connections collapses external recall to 0).

## Extraction eval (local only)

Scores produced `{repo}.analysis.json` against per-repo ground truth — `languages`,
`frameworks`, served interfaces, `outbound`. Needs analyses made by an agent per
`plugins/repo-analysis/AGENTS.md`. **Always exits 0. Never runs in CI.**

```bash
pnpm --filter @archatlas/llm-importer eval:extract -- --set fixtures --out ./architecture-output
```

With no `--out`, it scores the set's committed analyses (a sanity check on the fixtures
themselves).

## Adding a golden set

```
eval/golden/<name>/
├── eval.config.yaml     # name; workspace.local (dir of repo trees, relative to this file); repos[]
├── ground-truth.json    # repos{} + connections[] + externalSystems[]
└── analyses/            # optional: <repo>.analysis.json committed here …
```

Analyses resolve from `golden/<name>/analyses/` if that dir exists, otherwise from `../analyses`
relative to `workspace.local` (how `fixtures` reuses `test/fixtures/analyses` with no copy).
Every `connections[].from` / `.to` must be a `repos` key or an `externalSystems` entry — the
loader rejects anything else with exit 2.

A public source workspace (e.g. `microservices-demo`) is referenced by URL + pinned SHA in a
comment only — its analyses are produced once and committed; the source is never vendored or
cloned in CI. Private code (uds-sdk) is never committed in any form.

After adding a set: `eval -- --update-baseline --set <name>` and commit the new `baseline.json`
block.
