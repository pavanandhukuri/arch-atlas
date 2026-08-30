# Data Model: Bounded Per-Repository Analysis

Only entities this feature introduces or changes are detailed. Entities marked **unchanged from 007** are referenced, not redefined — see `specs/007-llm-repo-importer/data-model.md`.

---

## ImportConfig (run-config input) — unchanged from 007

Shape and the v2.0 version literal are unchanged. Notes: `analysis.maxFilesPerRepo` now bounds the number of files the deterministic context walk examines per repository (it previously bounded agent file reads); `analysis.maxConcurrency` **default changed 2 → 1** (research.md D13 — one local model serving two large concurrent requests was unreliable). No field is added, removed, or re-typed.

---

## AnalysisContext (transient — not persisted)

Assembled by `gather-context.ts` for one repository and handed to the bounded call. Never written to disk.

| Field             | Type                                                           | Description                                                                     |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `repoName`        | `string`                                                       | Display name (config `name` or directory basename)                              |
| `repoPath`        | `string`                                                       | Absolute path on disk                                                           |
| `descriptionHint` | `string \| undefined`                                          | Config `description` for this repo, if any                                      |
| `readmes`         | `Array<{ relPath: string; text: string }>`                     | READMEs / top-level docs, each ≤ `MAX_README_BYTES`                             |
| `manifests`       | `Array<{ relPath: string; text: string }>`                     | Dependency/build/compose files, each ≤ per-file cap                             |
| `listing`         | `string[]`                                                     | Repo-relative paths from the bounded walk (no content), ≤ `MAX_LISTING_ENTRIES` |
| `sourceExcerpts`  | `Array<{ relPath: string; text: string; truncated: boolean }>` | ≤ `MAX_SOURCE_FILES` relevance-ranked files, each ≤ `MAX_SOURCE_BYTES`          |
| `totalBytes`      | `number`                                                       | Sum of all embedded text; ≤ `MAX_TOTAL_CONTEXT_BYTES`                           |

**Validation rules**:

- No entry's `relPath` matches `matchesSecretPattern` (SC-007).
- `totalBytes ≤ MAX_TOTAL_CONTEXT_BYTES`; source excerpts are added in rank order and stop when the ceiling is reached.
- Walk honours `MAX_DEPTH` (12 — deep enough for `src/main/java/<group>/<pkg…>`), `MAX_LISTING_ENTRIES`, and the perf-skip dir set from `evidence/collect.ts`.
- READMEs, manifests, and source excerpts have independent byte/count budgets (research.md D13) so a README-heavy repo cannot starve source excerpts.

---

## RepoAnalysis (per-repository analysis output — NEW, persisted)

Written to `{output.directory}/{repo-name}.analysis.json`. Also the exact shape the bounded model call must return (after JSON extraction). Validated with `zod` before persisting (FR-006). Successor to 007's `RepositoryKnowledgeGraph` artifact — different name, different shape.

| Field            | Type                      | Required | Description                                                                                                                            |
| ---------------- | ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`  | `"1.0"`                   | Yes      | Analysis-artifact schema version                                                                                                       |
| `analyzedAt`     | `string` (ISO 8601)       | Yes      | When analysis completed                                                                                                                |
| `repository`     | `RepositoryRef`           | Yes      | `{ name, path, description? }` — same shape as 007                                                                                     |
| `description`    | `string`                  | Yes      | One- to three-sentence summary of what the repository is/does (may be `""` if the model gave nothing usable, but the field is present) |
| `languages`      | `string[]`                | Yes      | Detected implementation languages, most-prominent first (may be empty)                                                                 |
| `frameworks`     | `string[]`                | Yes      | Detected frameworks/runtimes/major libraries (may be empty)                                                                            |
| `served`         | `ServedInterfaces`        | Yes      | External entry points this repository exposes                                                                                          |
| `outbound`       | `OutboundIntent[]`        | Yes      | This repository's own statements of what it calls/depends on (may be empty)                                                            |
| `analysisStatus` | `"complete" \| "partial"` | Yes      | `"partial"` if context assembly hit a hard cap before covering the repo                                                                |
| `retryCount`     | `0 \| 1`                  | Yes      | Whether this came from the first attempt or the one retry (FR-007)                                                                     |

### RepositoryRef — unchanged from 007

`{ name: string; path: string; description?: string }`

### ServedInterfaces

| Field          | Type               | Required | Description                                                          |
| -------------- | ------------------ | -------- | -------------------------------------------------------------------- |
| `httpRoutes`   | `HttpRoute[]`      | Yes      | HTTP routes the service serves (may be empty)                        |
| `grpcServices` | `string[]`         | Yes      | gRPC service names exposed (may be empty)                            |
| `topics`       | `TopicInterface[]` | Yes      | Message topics/queues this repo publishes or consumes (may be empty) |
| `datastores`   | `Datastore[]`      | Yes      | Databases / tables / buckets this repo owns or writes (may be empty) |

### HttpRoute

| Field      | Type                                                                | Required | Description                                              |
| ---------- | ------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| `method`   | `"GET"\|"POST"\|"PUT"\|"PATCH"\|"DELETE"\|"HEAD"\|"OPTIONS"\|"ANY"` | No       | Omitted when the model can't determine it                |
| `path`     | `string` (starts with `/`)                                          | Yes      | Route path; may contain `:param` / `{param}` segments    |
| `filePath` | `string`                                                            | No       | Repo-relative file the route was found in, if attributed |

### TopicInterface

| Field       | Type                                  | Required | Description                        |
| ----------- | ------------------------------------- | -------- | ---------------------------------- |
| `name`      | `string`                              | Yes      | Literal topic/queue name           |
| `direction` | `"publish" \| "consume" \| "unknown"` | Yes      | Producer / consumer / undetermined |
| `filePath`  | `string`                              | No       | Repo-relative file, if attributed  |

### Datastore

| Field  | Type                                                                        | Required | Description                                 |
| ------ | --------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| `name` | `string`                                                                    | Yes      | Database, table, collection, or bucket name |
| `kind` | `"relational" \| "document" \| "keyvalue" \| "blob" \| "search" \| "other"` | No       | Best-effort classification                  |

### OutboundIntent

| Field        | Type                                                                                    | Required | Description                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `target`     | `string`                                                                                | Yes      | Name of the system/service/library this repo says it depends on or talks to                                      |
| `verb`       | `"calls" \| "depends_on" \| "publishes" \| "subscribes" \| "reads_from" \| "writes_to"` | Yes      | Nature of the outbound relationship                                                                              |
| `detail`     | `string`                                                                                | Yes      | One-sentence prose describing the intent (consumed by the name-mention pass and the agentic-fallback summariser) |
| `confidence` | `number` (0–1)                                                                          | No       | Model's confidence; defaults to `0.5` when absent                                                                |

**Validation rules**:

- The whole object parses against `RepoAnalysisSchema`; a failure after the one retry ⇒ repository is `failed`, no file written (FR-006/FR-007).
- `httpRoutes[].path`, `topics[].name`, `datastores[].name` are non-empty strings.
- Unknown/extra keys in the model's response are stripped (schema is not `.passthrough()`), not errored on — tolerant of a chatty model.

---

## CorrelationGraph — the retained `RepositoryKnowledgeGraph` shape (`src/graph/schema.ts`)

**Not persisted after this feature.** Constructed in memory by `to-correlation-graph.ts` from a `RepoAnalysis` and consumed by `src/correlate/*` exactly as in 007. Types (`GraphNode`, `GraphEdge`, `RepositoryKnowledgeGraph`, `RepositoryKnowledgeGraphSchema`) are unchanged; `filterToTrimmedSchema` and the "trimmed subset of UA" framing are removed in Phase 7. See `contracts/correlation-adapter-contract.md` for the field-by-field mapping.

Adapter output invariants:

- Every `GraphEdge.source`/`target` references a `GraphNode.id` present in the same graph (dangling edges not emitted).
- Exactly one `module` node per graph (the `moduleNodeId()` anchor).
- One `endpoint` node per `served.httpRoutes[]` entry, `name` formatted so `parseEndpointRoute` recovers it (`contracts/correlation-adapter-contract.md` §Endpoint format).
- Output validates against `RepositoryKnowledgeGraphSchema` before return.

---

## CrossRepositoryConnection — unchanged from 007

Produced by `deterministic-correlator.ts` + `agentic-correlator.ts`. Shape, `foundBy` values (`evidence` / `deterministic` / `agentic-fallback`), evidence strings, and weights are all unchanged. It now derives from adapter-built graphs rather than UA-built ones, transparently.

---

## ReviewFile — additive change

`src/review/review-file.ts`. All 007 fields unchanged. **Added**:

| Field   | Type                                                                 | Required | Description                                                                                                                            |
| ------- | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `repos` | `Array<{ name: string; description?: string; technology?: string }>` | No       | Per-repository metadata for the Studio classify step to pre-fill; ignored by the current `parseReviewYaml` (verified — research.md D7) |

`assemble-review.ts` populates `repos` from the run's analyses. Absence of the field leaves the file byte-compatible with 007 output.

---

## ArchitectureModel (`.arch.json`) — additive change

Schema (`@arch-atlas/core-model`) unchanged. `buildDiagram` now sets, on each container element that corresponds to an analyzed repository:

| Element field | Source                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| `description` | `RepoAnalysis.description`                                                     |
| `technology`  | `RepoAnalysis.frameworks[0] ?? RepoAnalysis.languages.join('/')` (short label) |

External-system elements (candidate targets, not analyzed repos) are unaffected. Both fields are already optional on `Element`.

---

## State Transitions

### Per-repository analysis state

```
pending  → gathering      (context walk starts)
gathering → calling        (bounded model call issued)
calling  → complete        (response parses + validates → {repo}.analysis.json written)
calling  → retrying        (response unparseable or schema-invalid — FR-007, attempt 0 only)
retrying → complete        (retry parses + validates)
retrying → failed          (retry also fails — repo skipped, reported; no artifact)
pending  → skipped         (valid {repo}.analysis.json already exists and no force flag)
```

### Import session lifecycle (unchanged from 007 except the analysis box)

```
config loaded → local model reachability checked (fails fast if unreachable)
  → repos analyzed (bounded call each, parallel, bounded by shared maxConcurrency)
  → per-repo RepoAnalysis artifacts available
  → toCorrelationGraph adapter per repo
  → deterministic correlation (evidence passes + name-mention)   [UNCHANGED]
  → agentic correlation for unresolved pairs only               [UNCHANGED]
  → confidence bucketing                                        [UNCHANGED]
  → review artifact assembled (+ repos block)
  → diagram written (+ description/technology on containers)
  → done
                        ↓
              failed repos → partial review + diagram (if ≥1 success), failures reported
```

---

## Validation Rules (summary)

- `RepoAnalysis` written to disk validates against `RepoAnalysisSchema` (FR-006); post-retry failure ⇒ failed repo, no file.
- `AnalysisContext` never contains a secret-excluded path (SC-007) and never exceeds `MAX_TOTAL_CONTEXT_BYTES`.
- Adapter output validates against `RepositoryKnowledgeGraphSchema` and contains no dangling edges.
- The produced `architecture.review.yaml` still satisfies `parseReviewYaml`'s required-field checks (research.md D7).
- `.arch.json` validates against `@arch-atlas/core-model` before writing (unchanged from 007).
- No configuration path constructs a hosted-provider client; no code path invokes a Python interpreter (FR-010).
