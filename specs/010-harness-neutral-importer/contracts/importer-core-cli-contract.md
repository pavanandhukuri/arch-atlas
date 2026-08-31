# Contract: Importer Core CLI (`arch-atlas-import`)

## `import <config> [--output <dir>] [--repos <a,b>] [--verbose]`

Runs the deterministic pipeline from pre-produced artifacts. **No model call, no network.**

1. Load `<config>` (`ImportConfigSchema`; `localModel` optional and ignored here).
2. `outDir = --output ?? config.output.directory`; `ensureOutputDir`.
3. Load analysis artifacts: for each configured repo (respecting `--repos`), `readAnalysis(outDir, name)`.
   - missing → `[skip] <name>: no analysis artifact`
   - invalid → `[skip] <name>: invalid analysis artifact — <issue>`
4. If no valid artifacts: print `No valid analysis artifacts found in <outDir> — run a producer first (e.g. \`arch-atlas-import gather-context\` then packages/analysis-runner-local, or the repo-analysis skill).`and return`0` without writing a diagram.
5. `graphs = analyses.map(toCorrelationGraph)`.
6. `{ connections, unresolvedPairs, passSummaries } = correlateDeterministically(graphs)` — unchanged; print `passSummaries` (includes the `grpc:` line from 009).
7. `extra = readExtraConnections(outDir)` — `[]` if `architecture.extra-connections.json` absent; hard error if malformed. Print `  extra-connections: N loaded` when present.
8. `assembleReviewFile(graphs, [...connections, ...extra], repoMetaByName)` → write `architecture.review.yaml`.
9. `buildDiagram(review, title, repoMetaByName)` → write `config.output.diagramFileName`.

Removed vs. today: `--analyze-only`, `--force-refresh` (moves to the runner), the
`Checking local model endpoint...` reachability gate, exit code `2`,
`LocalModelUnreachableError`.

## `gather-context <config> [--out <dir>] [--repos <a,b>]`

See context-bundle-contract.md. Writes `{repoName}.context.json` per repo. No model, no network.

## Exit codes

| Code | Meaning                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------- |
| `0`  | success (including "no artifacts, nothing exported" and per-repo skips)                               |
| `1`  | config validation error, or a malformed `architecture.extra-connections.json`, or an unexpected error |

(No code `2` — the core never contacts an endpoint.)

## Guarantees

| #    | Guarantee                                                                                                 | Maps to                |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------- |
| CLI1 | `import` and `gather-context` make zero outbound network connections under any config.                    | FR-001, FR-002, SC-001 |
| CLI2 | A `localModel` block in the config changes nothing about an `import` run.                                 | FR-001 AS-4            |
| CLI3 | Two `import` runs over the same artifacts produce byte-identical `review.yaml` apart from `generated_at`. | FR-014, SC-006         |
| CLI4 | Missing/invalid per-repo artifacts are named and skipped; the run still completes for the rest.           | FR-003                 |
| CLI5 | `--repos` filters which artifacts enter correlation.                                                      | FR-016                 |

## Tests (`test/unit/cli.test.ts`, `test/unit/run-import.test.ts`, `test/integration/model-free-pipeline.integration.test.ts`)

- Full `import` over `test/fixtures/analyses/*` → review + diagram match a recorded snapshot
  (modulo timestamps); assert `fetch`/`http` are never called (spy).
- One artifact missing + one corrupt → both skipped, diagram built from the rest.
- Config with a `localModel` block → identical output to config without it.
- `architecture.extra-connections.json` present with one `agentic-fallback` connection → it appears
  as a `low`-confidence candidate.
- Malformed `architecture.extra-connections.json` → exit `1`.
- `gather-context` writes the bundles; `--repos user-service` writes only that one.
