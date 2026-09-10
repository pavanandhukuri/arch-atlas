# Phase 1 Data Model: Correlation Eval Harness Rebuild

All shapes are plain TypeScript interfaces in `apps/llm-importer/eval/types.ts`. Files read from
disk (`eval.config.yaml`, `ground-truth.json`, `baseline.json`) are additionally validated by zod
schemas in `eval/schema.ts` on read; a parse failure is exit code 2 with the file path and the
zod issue list.

## PRF

The unit of measurement. Unchanged from the deleted harness.

| field       | type   | meaning                                                           |
| ----------- | ------ | ----------------------------------------------------------------- |
| `tp`        | number | true positives (predicted items that matched a ground-truth item) |
| `fp`        | number | false positives (predicted, no ground-truth match)                |
| `fn`        | number | false negatives (ground-truth items with no predicted match)      |
| `precision` | number | `tp / (tp + fp)`; `1` when both predicted and expected are empty  |
| `recall`    | number | `tp / (tp + fn)`; `1` when expected is empty                      |
| `f1`        | number | harmonic mean of precision & recall; `0` when both are `0`        |

Matching is deliberately lenient (`nameMatch` / `tokenOverlap` / `normalizeRoute`): the eval measures
whether the tool found the right _things_, not whether it spelled them the reference way.

## RepoGroundTruth

The checkable subset of one repo's true architecture. Used by the **extraction** eval only.

| field                 | type      | notes                                                                        |
| --------------------- | --------- | ---------------------------------------------------------------------------- |
| `role`                | string    | one-line true purpose (reference text; not scored in this feature)           |
| `languages`           | string[]  |                                                                              |
| `frameworks`          | string[]  |                                                                              |
| `served.httpRoutes`   | string[]? | route paths; normalized (`{id}`/`:id`/`*` collapsed) before matching         |
| `served.grpcServices` | string[]? | matched on the last dotted segment                                           |
| `served.topics`       | string[]? | `"topic"` or `"topic:pub"` / `"topic:sub"` (suffix stripped before matching) |
| `served.datastores`   | string[]? |                                                                              |
| `outbound`            | string[]? | names of other systems this repo calls / depends on / publishes to           |

## WorkspaceGroundTruth

The whole `ground-truth.json` for a golden set.

| field             | type                                                 | notes                                                                                                                  |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `repos`           | `Record<string, RepoGroundTruth>`                    | keyed by repo name; consumed by the extraction eval                                                                    |
| `connections`     | `Array<{ from: string; to: string; kind?: string }>` | **directed** expected cross-repo edges; `kind` is documentation only                                                   |
| `externalSystems` | `string[]`                                           | **NEW** — canonical names of non-workspace systems every candidate set must recover (e.g. `"Amazon S3"`, `"Keycloak"`) |

**Consistency rule** (spec edge case): every name in `connections[].from` / `connections[].to` must
be a key in `repos` **or** appear in `externalSystems`. A violation → exit 2, "ground-truth file
names `<x>` which is neither a repo nor a declared external system".

## EvalConfig

`eval/golden/<set>/eval.config.yaml`. Trimmed from the deleted version — the `clone` variant is
gone (FR-004: no eval-time cloning).

| field             | type                                    | notes                                                                                                                      |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `name`            | string                                  | golden-set id; the key used in `baseline.json`                                                                             |
| `workspace.local` | string                                  | path **relative to the config file** to a dir containing the repo trees                                                    |
| `repos`           | `Array<{ name: string; path: string }>` | `name` matches `ground-truth.repos` keys and the committed `<name>.analysis.json`; `path` is relative to `workspace.local` |

For the synthetic set: `workspace.local: ../../../test/fixtures/repos`, `repos` = the four core
fixture repos, each `path` = its own name. No `analyses/` dir — the committed
`test/fixtures/analyses/<name>.analysis.json` are used directly (path-patched in memory per
research D3).

## Baseline

`eval/baseline.json`. Written by `eval -- --update-baseline`, read by `eval -- --check`.

```jsonc
{
  "<set name>": {
    "connections":     { "precision": <number>, "recall": <number>, "f1": <number> },
    "externalSystems": { "precision": <number>, "recall": <number>, "f1": <number> }
  }
}
```

Pretty-printed, keys in a fixed order, trailing newline → deliberate updates are a clean diff.

## CorrelationReport

In-memory result of one correlation-eval run; also what `--check` compares and `--update-baseline`
persists (minus `tp/fp/fn`, keeping `precision/recall/f1`).

| field             | type                                                   | notes                                                                  |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `set`             | string                                                 | golden-set name                                                        |
| `generatedAt`     | string                                                 | ISO; **not** written to `baseline.json` (would churn the diff)         |
| `connections`     | `PRF`                                                  | from `scoreConnections(connections, gt, { directed: true })`           |
| `externalSystems` | `PRF`                                                  | from `scoreExternalSystems(candidates, gt.externalSystems, repoNames)` |
| `expected`        | `{ connections: string[]; externalSystems: string[] }` | echoed for the report table                                            |
| `predicted`       | `{ connections: string[]; externalSystems: string[] }` | echoed for the report table                                            |

## ExtractionReport

In-memory result of `eval:extract`. Never persisted, never gates.

| field       | type                                  | notes                                                                                                        |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `set`       | string                                |                                                                                                              |
| `perRepo`   | `Record<string, Record<string, PRF>>` | repo → field (`languages`/`frameworks`/`httpRoutes`/`grpcServices`/`topics`/`datastores`/`outbound`) → `PRF` |
| `aggregate` | `Record<string, PRF>`                 | mean `PRF` per field across repos                                                                            |

## Zod schemas (`eval/schema.ts`)

- `EvalConfigSchema` — mirrors `EvalConfig`; `workspace` is `z.object({ local: z.string() })`.
- `WorkspaceGroundTruthSchema` — mirrors `WorkspaceGroundTruth`; the consistency rule is a
  `.superRefine` (not expressible structurally).
- `BaselineSchema` — `z.record(z.object({ connections: PrfLiteSchema, externalSystems: PrfLiteSchema }))`
  where `PrfLiteSchema = z.object({ precision: z.number(), recall: z.number(), f1: z.number() })`.

`RepoAnalysis` files are validated by the importer's own `RepoAnalysisSchema` (already exported),
not re-schematized here.
