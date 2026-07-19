# Data Model: LLM Repository Importer

## Entities

### ImportConfig (config file input)

The JSON or YAML file provided by the user to describe the import operation.

| Field          | Type                | Required | Description               |
| -------------- | ------------------- | -------- | ------------------------- |
| `version`      | `"1.0"`             | Yes      | Config schema version     |
| `provider`     | `ProviderConfig`    | Yes      | LLM provider settings     |
| `output`       | `OutputConfig`      | Yes      | Output location settings  |
| `analysis`     | `AnalysisConfig`    | No       | Tuning knobs for analysis |
| `repositories` | `RepositoryEntry[]` | Yes      | Repos to analyze (min 1)  |

**ProviderConfig**

| Field          | Type                      | Required | Description                                                    |
| -------------- | ------------------------- | -------- | -------------------------------------------------------------- |
| `type`         | `"anthropic" \| "ollama"` | Yes      | Provider backend                                               |
| `model`        | `string`                  | No       | Model ID (e.g., `claude-opus-4-7`, `llama3`)                   |
| `endpoint`     | `string`                  | No       | Base URL (required for ollama)                                 |
| `apiKeyEnvVar` | `string`                  | No       | Name of env var holding API key (default: `ANTHROPIC_API_KEY`) |

**OutputConfig**

| Field             | Type     | Required | Description                                                 |
| ----------------- | -------- | -------- | ----------------------------------------------------------- |
| `directory`       | `string` | Yes      | Output directory path (absolute or relative to config file) |
| `diagramFileName` | `string` | No       | Output diagram filename (default: `architecture.arch.json`) |

**AnalysisConfig**

| Field             | Type       | Required | Description                                                                     |
| ----------------- | ---------- | -------- | ------------------------------------------------------------------------------- |
| `maxFilesPerRepo` | `number`   | No       | Cap on files sent to LLM per repo (default: 200)                                |
| `excludePatterns` | `string[]` | No       | Additional glob patterns to exclude (merged with hardcoded security exclusions) |
| `forceRefresh`    | `boolean`  | No       | Re-analyze even if metadata file exists (default: false)                        |
| `concurrency`     | `number`   | No       | Max parallel repo analyses (default: 3)                                         |

**RepositoryEntry**

| Field         | Type     | Required | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `path`        | `string` | Yes      | Absolute or relative local filesystem path                 |
| `name`        | `string` | No       | Display name for the service (default: directory basename) |
| `description` | `string` | No       | Context hint provided to the AI during analysis            |

---

### RepositoryMetadata (per-repo analysis output)

Written to `{output.directory}/{repo-name}.metadata.json` after analysis.

| Field           | Type                          | Required | Description                                  |
| --------------- | ----------------------------- | -------- | -------------------------------------------- |
| `schemaVersion` | `"1.0"`                       | Yes      | Metadata schema version                      |
| `analyzedAt`    | `string`                      | Yes      | ISO 8601 timestamp                           |
| `repository`    | `RepositoryRef`               | Yes      | Source repo info                             |
| `connections`   | `Connection[]`                | Yes      | All detected outgoing connections            |
| `confidence`    | `"high" \| "medium" \| "low"` | Yes      | Overall analysis confidence                  |
| `filesSampled`  | `number`                      | Yes      | How many files were included in the analysis |
| `filesTotal`    | `number`                      | Yes      | Total files found (before exclusions/limits) |
| `notes`         | `string`                      | No       | AI-generated notes about the analysis        |

**RepositoryRef**

| Field         | Type     | Required | Description                            |
| ------------- | -------- | -------- | -------------------------------------- |
| `name`        | `string` | Yes      | Service name (from config or inferred) |
| `path`        | `string` | Yes      | Absolute path analyzed                 |
| `description` | `string` | No       | Description from config                |

**Connection**

| Field             | Type                          | Required | Description                                           |
| ----------------- | ----------------------------- | -------- | ----------------------------------------------------- |
| `type`            | `ConnectionType`              | Yes      | Category of connection                                |
| `targetService`   | `string`                      | Yes      | Canonical name of the target service/system           |
| `targetAddresses` | `string[]`                    | No       | Known addresses (URLs, hostnames, env var references) |
| `label`           | `string`                      | No       | Human-readable description of the call                |
| `confidence`      | `"high" \| "medium" \| "low"` | Yes      | Confidence in this specific connection                |
| `evidence`        | `string[]`                    | Yes      | File paths or code snippets supporting the inference  |

**ConnectionType enum**: `"http"` | `"database"` | `"message-queue"` | `"grpc"` | `"file-system"` | `"unknown"`

---

### ImportSession (in-memory, not persisted)

Tracks state during a running import operation.

| Field          | Type                | Description                 |
| -------------- | ------------------- | --------------------------- |
| `config`       | `ImportConfig`      | Loaded and validated config |
| `repositories` | `RepositoryState[]` | Per-repo analysis state     |
| `startedAt`    | `Date`              | Session start time          |

**RepositoryState**

| Field      | Type                                                              | Description                |
| ---------- | ----------------------------------------------------------------- | -------------------------- |
| `entry`    | `RepositoryEntry`                                                 | Config entry for this repo |
| `status`   | `"pending" \| "analyzing" \| "complete" \| "skipped" \| "failed"` | Current state              |
| `metadata` | `RepositoryMetadata \| null`                                      | Result when complete       |
| `error`    | `string \| null`                                                  | Error message if failed    |

---

### ArchitectureModel (final output — existing format)

Defined in `@arch-atlas/model-schema`. The importer produces output conforming to this schema.

**Mapping from import to diagram**:

| Import concept                     | Diagram element                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Analyzed repository                | `Element` with `kind: "container"`, `containerSubtype: "backend-service"`                |
| External service (detected target) | `Element` with `kind: "system"`, `isExternal: true`                                      |
| Database connection                | `Element` with `kind: "container"`, `containerSubtype: "database"`                       |
| Message queue                      | `Element` with `kind: "container"`, `containerSubtype: "default"`                        |
| `Connection`                       | `Relationship` with `type` from connection type, `integrationMode` from connection label |

---

## State Transitions

### RepositoryState transitions

```
pending → analyzing  (analysis starts)
analyzing → complete (metadata written successfully)
analyzing → failed   (LLM error or validation failure)
pending → skipped    (valid metadata already exists and forceRefresh=false)
```

### Import session lifecycle

```
config loaded → session created → repos analyzed (parallel) → aggregation → diagram written → done
                                                ↓
                                      failed repos → partial diagram (if ≥1 success)
```

---

## Validation Rules

- `ImportConfig.repositories` must contain at least one entry
- All `RepositoryEntry.path` values must resolve to existing, readable directories
- `Connection.evidence` must contain at least one entry
- `RepositoryMetadata` written to disk is validated against its JSON schema before persisting
- `ArchitectureModel` is validated against `architecture-model.schema.json` before writing output
- Relationship `sourceId` and `targetId` must reference `id` values present in the `elements` array
