# Contract: Context Bundle

## Producing side — `apps/llm-importer`

### CLI: `gather-context <config> [--out <dir>]`

- Loads `<config>` (`ImportConfigSchema`; `localModel` may be absent).
- For each entry in `repositories` (respecting `--repos` if given): builds the context with the
  **unchanged** `gatherContext(repoName, repoPath, descriptionHint)` and the `analysis.maxFilesPerRepo`
  / `analysis.excludePatterns` knobs, then writes `serializeContextBundle(ctx)` as pretty JSON to
  `{out ?? config.output.directory}/{repoName}.context.json`.
- A repository whose path is unavailable is reported (`[skip] <name>: path not found`) and does not
  abort the others.
- Exit `0` on completion (even with per-repo skips), `1` on config-validation error.
- **No network, no model call.**

### Library: `src/index.ts` re-exports

```ts
export { gatherContext } from './analysis/gather-context.js';
export type {
  AnalysisContext,
  ContextFile,
  SourceExcerpt,
  DependencySplit,
  DetectedInterfaces,
} from './analysis/gather-context.js';
export {
  serializeContextBundle,
  readContextBundle,
  ContextBundleSchema,
  ContextBundleVersionError,
} from './analysis/context-bundle.js';
export type { ContextBundle } from './analysis/context-bundle.js';
export { RepoAnalysisSchema, ModelAnalysisSchema } from './analysis/repo-analysis.schema.js';
export type { RepoAnalysis, ModelAnalysis } from './analysis/repo-analysis.schema.js';
export {
  readAnalysis,
  writeAnalysis,
  hasValidCachedAnalysis,
  listAllAnalyses,
  ensureOutputDir,
} from './analysis/analysis-store.js';
export { toCorrelationGraph } from './analysis/to-correlation-graph.js';
export { correlateDeterministically } from './correlate/deterministic-correlator.js';
export type {
  CrossRepositoryConnection,
  UnresolvedRepoPair,
} from './correlate/deterministic-correlator.js';
export { RepositoryKnowledgeGraphSchema, GRAPH_EDGE_TYPES } from './graph/schema.js';
export type {
  RepositoryKnowledgeGraph,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
} from './graph/schema.js';
export { readExtraConnections, ExtraConnectionsSchema } from './correlate/extra-connections.js';
```

`package.json` gains:

```json
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
             "./cli": { "default": "./dist/cli.js" } },
"main": "./dist/index.js", "types": "./dist/index.d.ts"
```

(`bin.arch-atlas-import` still → `./dist/cli.js`.)

## Schema — `ContextBundleSchema`

Per `data-model.md`. `schemaVersion: '1.0'`. `readContextBundle` throws `ContextBundleVersionError`
on any other version. Round-trip guarantee: for any repo,
`ContextBundleSchema.parse(JSON.parse(serialise(gatherContext(...))))` succeeds and its non-metadata
fields deep-equal the `AnalysisContext`.

## Guarantees

| #   | Guarantee                                                                                           | Maps to                   |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| CB1 | No `relPath` in any bundle array matches the secret-path exclusion set.                             | FR-005, SC-005            |
| CB2 | `gather-context` makes zero outbound network connections.                                           | FR-001, FR-004            |
| CB3 | The bundle is a pure function of (repo tree, `maxFilesPerRepo`, `excludePatterns`) — deterministic. | FR-004                    |
| CB4 | `totalBytes` equals the summed byte length of all `text` fields.                                    | data-model integrity rule |
| CB5 | A version-mismatched bundle is rejected with an actionable message, never silently used.            | Edge Cases                |

## Tests (`test/unit/context-bundle.test.ts`, `test/integration/*`)

- Round-trip: `gatherContext` on a fixture repo → serialise → `readContextBundle` → deep-equal.
- CB1: run over `user-service` (has the planted `.env`) → no `relPath` contains `.env`.
- CB4: tamper `totalBytes` → `parse` fails.
- CB5: `schemaVersion: '9.9'` → `ContextBundleVersionError`.
- CLI: `gather-context` over the fixtures workspace writes one `*.context.json` per repo; a
  missing-path repo is skipped, exit `0`.
