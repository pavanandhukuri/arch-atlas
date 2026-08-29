# Data Model: Repository Architecture Importer (Agentic Local-Model Rewrite)

## Entities

### ImportConfig (config file input)

The JSON or YAML file provided by the user to describe the import operation. Schema validated with `zod` (research.md D10-adjacent boundary rule: every artifact boundary has an explicit schema).

| Field          | Type                | Required | Description                                                                                     |
| -------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `version`      | `"2.0"`             | Yes      | Config schema version — bumped from `"1.0"` since the shape changes                             |
| `localModel`   | `LocalModelConfig`  | Yes      | Local model endpoint settings (research.md D9) — no cloud provider option exists in this schema |
| `output`       | `OutputConfig`      | Yes      | Output location settings                                                                        |
| `analysis`     | `AnalysisConfig`    | No       | Tuning knobs for analysis                                                                       |
| `repositories` | `RepositoryEntry[]` | Yes      | Repos to analyze (min 1, max 50 per FR-001/Scale)                                               |

**LocalModelConfig** (research.md D9)

| Field      | Type                                       | Required | Description                                                    |
| ---------- | ------------------------------------------ | -------- | -------------------------------------------------------------- |
| `provider` | `"ollama" \| "mlx" \| "openai-compatible"` | Yes      | Local runtime style — determines how `endpoint` is interpreted |
| `endpoint` | `string`                                   | Yes      | Base URL of the local model server                             |
| `modelId`  | `string`                                   | Yes      | Model identifier as known to the local runtime                 |

There is intentionally no `apiKeyEnvVar`/hosted-provider field — FR-017 requires the tool to be fully usable with no outbound call to a hosted LLM API, so no such option is exposed in config.

**OutputConfig**

| Field             | Type     | Required | Description                                                             |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `directory`       | `string` | Yes      | Output directory path (absolute or relative to config file)             |
| `diagramFileName` | `string` | No       | Output diagram filename (default: `architecture.arch.json`) — unchanged |

**AnalysisConfig**

| Field             | Type       | Required | Description                                                                                                                                                          |
| ----------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxFilesPerRepo` | `number`   | No       | Cap on files the agent session may read per repo (default: 200) — carried over as a safety bound                                                                     |
| `excludePatterns` | `string[]` | No       | Additional glob patterns to exclude (merged with hardcoded security exclusions, FR-015)                                                                              |
| `forceRefresh`    | `boolean`  | No       | Re-analyze even if a knowledge-graph artifact exists (default: false)                                                                                                |
| `maxConcurrency`  | `number`   | No       | **New** (research.md D8/FR-016) — single limit shared by repo-level fan-out _and_ internal agent-batch fan-out. Default: 2 (conservative, single local model server) |

Note: the prior revision's `concurrency` field (repo-level only) is renamed `maxConcurrency` and its meaning changes — it now bounds _total_ concurrent local-model load across both fan-out layers, not just the number of repos analyzed in parallel. This is a breaking config-format change, consistent with the version bump to `"2.0"` and the "immediate full replacement" decision (spec Question 2).

**RepositoryEntry**

| Field         | Type     | Required | Description                                                               |
| ------------- | -------- | -------- | ------------------------------------------------------------------------- |
| `path`        | `string` | Yes      | Absolute or relative local filesystem path — unchanged                    |
| `name`        | `string` | No       | Display name for the service (default: directory basename) — unchanged    |
| `description` | `string` | No       | Context hint passed into the agent session's prompt — unchanged in spirit |

---

### RepositoryKnowledgeGraph (per-repo analysis output)

Written to `{output.directory}/{repo-name}.knowledge-graph.json` after analysis — successor to the prior revision's `{repo-name}.metadata.json`. Structure per research.md D10 (trimmed subset of Understand-Anything's schema).

| Field            | Type                      | Required | Description                                                                                          |
| ---------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `schemaVersion`  | `"1.0"`                   | Yes      | Knowledge-graph schema version (independent of `ImportConfig.version`)                               |
| `analyzedAt`     | `string`                  | Yes      | ISO 8601 timestamp                                                                                   |
| `repository`     | `RepositoryRef`           | Yes      | Source repo info                                                                                     |
| `nodes`          | `GraphNode[]`             | Yes      | Structural elements found in the repo                                                                |
| `edges`          | `GraphEdge[]`             | Yes      | Relationships between nodes, including connections to other systems                                  |
| `analysisStatus` | `"complete" \| "partial"` | Yes      | `"partial"` when the agent session hit `maxFilesPerRepo` or a bounded-timeout limit before finishing |
| `retryCount`     | `0 \| 1`                  | Yes      | Whether this result came from the initial attempt or the one retry (FR-010a)                         |

**RepositoryRef** — unchanged shape from the prior revision (`name`, `path`, `description`).

**GraphNode** (research.md D10 — trimmed)

| Field      | Type                                                                                                                                                  | Required | Description                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `id`       | `string`                                                                                                                                              | Yes      | e.g. `file:src/db/client.ts`, `service:Dockerfile`                      |
| `type`     | `"file" \| "function" \| "class" \| "module" \| "config" \| "document" \| "service" \| "table" \| "endpoint" \| "pipeline" \| "schema" \| "resource"` | Yes      | Kept subset of UA's 13 node types (design/knowledge-base types dropped) |
| `name`     | `string`                                                                                                                                              | Yes      | Human-readable name                                                     |
| `filePath` | `string`                                                                                                                                              | No       | Repo-relative path, when applicable                                     |
| `summary`  | `string`                                                                                                                                              | Yes      | Short agent-generated description                                       |

**GraphEdge** (research.md D10 — trimmed)

| Field         | Type                                                                                                                                                                                    | Required | Description                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `source`      | `string`                                                                                                                                                                                | Yes      | Source node id                                                                                                                   |
| `target`      | `string`                                                                                                                                                                                | Yes      | Target node id                                                                                                                   |
| `type`        | `"imports" \| "calls" \| "publishes" \| "subscribes" \| "reads_from" \| "writes_to" \| "depends_on" \| "serves" \| "routes" \| "configures" \| "deploys" \| "provisions" \| "triggers"` | Yes      | Kept subset of UA's ~38 edge types                                                                                               |
| `weight`      | `number` (0–1)                                                                                                                                                                          | Yes      | Agent-asserted relationship strength — raw signal, not yet bucketed (bucketing happens at review-assembly time, research.md D11) |
| `description` | `string`                                                                                                                                                                                | No       | Short agent-generated explanation                                                                                                |

---

### CrossRepositoryConnection (correlator output, new entity)

Produced by the hybrid correlator (research.md D7) once all per-repo knowledge graphs exist. Not persisted as its own artifact — consumed directly by review-artifact assembly, but modeled here because it's a new, distinct shape from anything in the prior revision.

| Field          | Type                                    | Required                             | Description                                                                                                         |
| -------------- | --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `sourceRepo`   | `string`                                | Yes                                  | Repository name on the originating side                                                                             |
| `sourceNodeId` | `string`                                | Yes                                  | Node id within the source repo's knowledge graph                                                                    |
| `targetRepo`   | `string`                                | Yes                                  | Repository name on the receiving side                                                                               |
| `targetNodeId` | `string`                                | Yes                                  | Node id within the target repo's knowledge graph                                                                    |
| `type`         | Same enum as `GraphEdge.type`           | Yes                                  | Relationship type                                                                                                   |
| `foundBy`      | `"deterministic" \| "agentic-fallback"` | Yes                                  | Which correlator pass found this (research.md D7) — drives confidence adjustment in D11                             |
| `evidence`     | `string[]`                              | Yes (if `foundBy = "deterministic"`) | Literal matched identifiers (service name, port, topic, env var) — omitted/best-effort for agentic-fallback matches |
| `weight`       | `number` (0–1)                          | Yes                                  | Raw signal before bucketing                                                                                         |

---

### Connection / ReviewCandidate (review artifact — schema UNCHANGED)

The review artifact's shape is explicitly out of scope for this revision (spec: "Explicitly out of scope"). Its authoritative schema already lives in `apps/studio/src/lib/import/types.ts` (`ReviewFile`, `SystemGroup`, `ReviewCandidate`, `ElementConfig`) and is not redefined here. This plan's `review/review-file.ts` (see `plan.md` Project Structure) is a TypeScript port of the _producing_ side (what the retired Python `review/models.py` + `review_manager.py` did), not a schema change — field-for-field compatible with what Studio already parses.

The only new mapping work is populating `ReviewCandidate.confidence` from `GraphEdge.weight`/`CrossRepositoryConnection.weight` via the bucket mapper (research.md D11) instead of from the retired static-signal confidence table.

---

### ArchitectureModel (final output — existing format, UNCHANGED)

Defined in `@arch-atlas/model-schema`. Mapping from knowledge-graph/connection concepts to diagram elements is unchanged in kind from the prior revision:

| Import concept                                                           | Diagram element                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| Analyzed repository                                                      | `Element` with `kind: "container"`                  |
| External service (detected target, human-classified per Studio wizard)   | `Element` with `kind: "system"`, `isExternal: true` |
| `CrossRepositoryConnection` / within-repo `GraphEdge` accepted in review | `Relationship`                                      |

---

## State Transitions

### Per-repository analysis state (successor to prior `RepositoryState`)

```
pending → analyzing        (agent session starts)
analyzing → complete       (knowledge-graph artifact written successfully)
analyzing → retrying       (session failed or produced unparseable output — FR-010a)
retrying → complete        (retry succeeded)
retrying → failed          (retry also failed — repo skipped, failure reported per FR-010)
pending → skipped          (valid knowledge-graph artifact already exists and forceRefresh=false)
```

### Import session lifecycle

```
config loaded → local model reachability checked (US4 scenario 2, fails fast if unreachable)
    → repos analyzed (parallel, bounded by shared maxConcurrency limiter, D8)
    → per-repo knowledge graphs available
    → deterministic correlation pass (D7 pass 1)
    → agentic correlation pass for unresolved pairs only (D7 pass 2)
    → confidence bucketing (D11)
    → review artifact assembled
    → diagram written
    → done
                          ↓
                failed repos → partial diagram (if ≥1 success), failures reported
```

---

## Validation Rules

- `ImportConfig.repositories` must contain at least one entry, at most 50
- All `RepositoryEntry.path` values must resolve to existing, readable directories
- `ImportConfig.localModel.endpoint` must be reachable (validated at startup, before any repository analysis begins — US4 scenario 2)
- `RepositoryKnowledgeGraph` written to disk is validated against its `zod` schema before persisting; a value that fails validation after the one allowed retry (FR-010a) is treated as a failed repository, not written
- Every `GraphEdge.source`/`GraphEdge.target` must reference a `GraphNode.id` present in the same knowledge graph (dangling edges are dropped during merge — ported from UA's `merge-batch-graphs.py` behavior, research.md D5)
- Every `CrossRepositoryConnection.sourceNodeId`/`targetNodeId` must reference a node id present in the respective repo's knowledge graph
- `ArchitectureModel` is validated against the existing `@arch-atlas/model-schema` before writing output — unchanged
- Relationship `sourceId`/`targetId` in the final diagram must reference `id` values present in the `elements` array — unchanged
