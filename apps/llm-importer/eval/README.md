# Importer eval harness

Dev-only. Nothing here ships — `files: ["dist"]` keeps every byte of `eval/` out of the npm
tarball. Three evals:

| eval            | command                                                 | model? | CI?                                |
| --------------- | ------------------------------------------------------- | ------ | ---------------------------------- |
| **correlation** | `pnpm --filter @archatlas/llm-importer eval`            | no     | yes — `eval -- --check`            |
| **components**  | `pnpm --filter @archatlas/llm-importer eval:components` | no     | yes — `eval:components -- --check` |
| **extraction**  | `pnpm --filter @archatlas/llm-importer eval:extract`    | yes    | no                                 |

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
a `ground-truth.json` is internally inconsistent. `.github/workflows/ci.yml` runs
`eval -- --check` on every PR and blocks merge on regression.
`eval/run.integration.test.ts` additionally pins the same numbers as regular `pnpm test`
assertions, so a regression shows up twice — once in the eval step, once as a failing test.

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
connections collapses external recall to 0) — both that test and the `eval -- --check` CI step
catch it.

## Component eval

Deterministic and offline, same shape as the correlation eval but one repository at a time: loads
a golden-components set's committed `{repo}.components.json` artifact and scores it against
`ground-truth.json`.

- **components** — precision / recall / F1 over the artifact's named internal components, matched
  by normalized name alone (independent of `kind` — see `contracts/components-artifact-schema.md`
  in spec 014).
- **relationships** — precision / recall / F1 over directed `source -> target` pairs between those
  components. Direction-sensitive, same as the correlation eval's connection scoring.

```bash
pnpm --filter @archatlas/llm-importer eval:components                          # every set
pnpm --filter @archatlas/llm-importer eval:components -- --set catalog-service # just one
pnpm --filter @archatlas/llm-importer eval:components -- --check               # against component-baseline.json
pnpm --filter @archatlas/llm-importer eval:components -- --update-baseline
```

Same exit-code contract as `eval`: `0` / `1` (regression) / `2` (setup error). `ci.yml` runs
`eval:components -- --check` on every PR, independent of the correlation eval — a regression in
either blocks merge with its own named step.

### The golden-components sets

Two, both reused from the already-committed [`examples/bookshop`](../../../examples/bookshop)
repos — no new source vendored:

- **`catalog-service`** (Java/Spring Boot) — `golden-components/catalog-service/`
- **`order-service`** (TypeScript/Express) — `golden-components/order-service/`

Each directory holds:

```
golden-components/<name>/
├── eval.config.yaml          # name; workspace.local (reference only); artifact path; repo{name,path}
├── ground-truth.json         # components[] ({name,kind,description}) + relationships[] ({from,to})
└── <name>.components.json    # the artifact actually scored — see below
```

Both committed `<name>.components.json` artifacts are **deliberately imperfect** hand-authored
stand-ins, not copies of their ground truth: `catalog-service` omits a real component entirely
(`CoverStorage`) and has one relationship's direction reversed; `order-service` does the same with
`EventPublisher`. This is why neither golden set starts at a trivial 1.0/1.0 — the harness is
proven to discriminate from the moment it's merged (FR-005, SC-003), before any real
component-extraction procedure exists. Once that procedure (the "Component drill-down" mode in
`plugins/repo-analysis/skills/import/SKILL.md`) produces a real artifact for one of these repos,
replace the hand-authored stand-in with that real output and re-run
`eval:components -- --update-baseline` — the resulting `component-baseline.json` diff is reviewed
like any other.

Adding a third set follows the same shape as "Adding another golden set" above, substituting
`components[]`/`relationships[]` ground truth for `repos{}`/`connections[]`, and committing
`eval -- --update-baseline` → `eval:components -- --update-baseline` on `component-baseline.json`
instead of `baseline.json`.

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
block — and add a describe block to `eval/run.integration.test.ts` pinning its scores, so both the
CI `eval -- --check` step and the test suite catch a future regression.
