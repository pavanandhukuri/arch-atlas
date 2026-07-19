# Feature Specification: Repository Architecture Importer

**Feature Branch**: `007-llm-repo-importer`  
**Created**: 2026-05-14  
**Revised**: 2026-06-04  
**Status**: Active

## Approach

**Graph extraction pipeline with LLM enrichment** — not LLM-first.

Most architecture information is already encoded in deployment manifests, framework annotations, dependency declarations, and integration client usage patterns. Static analysis extracts this with high precision and confidence. The LLM is called once, after extraction, to perform component grouping, naming, and architectural abstraction — tasks where language understanding adds value that pattern matching cannot provide.

Pipeline stages:

```
Repository
    ↓
Manifest Extractor       (docker-compose, k8s, pom.xml, package.json, build.gradle)
    ↓
Code Parser              (Tree-sitter — symbols, imports, classes, annotations)
    ↓
Rule Engine              (Semgrep — framework/integration detection rules)
    ↓
Relationship Extractor   (combine signals → connections with confidence scores)
    ↓
Architecture Graph       (in-memory or Neo4j — nodes + typed relationships)
    ↓
Cross-Repo Correlator    (match Kafka topics, REST endpoints across all repos)
    ↓
LLM Enrichment           (grouping, naming, abstraction — pluggable provider)
    ↓
C4 / arch.json Exporter  (conforming to @arch-atlas/model-schema)
```

---

## User Stories & Testing

### User Story 1 — Single Repository Analysis (P1)

An architect wants to understand what external services a single codebase depends on. They run the import tool against one repository and get a metadata file listing all detected outgoing connections — service calls, database connections, message queue integrations — each with a confidence score.

**Why P1**: Atomic unit of the entire feature. Validates the extraction pipeline before multi-repo work.

**Independent Test**: Point the tool at a repository with known connections. Verify the metadata file lists each connection with correct type, target, and confidence ≥ 0.7 for anything declared in manifests or framework annotations.

**Acceptance Scenarios**:

1. **Given** a valid repository path, **When** the user runs analysis, **Then** the tool runs the full extraction pipeline (manifest → code parse → semgrep rules → relationship extraction) and writes a `.metadata.json` file.
2. **Given** analysis completes, **When** the metadata is reviewed, **Then** every detected connection has a `type`, `targetService`, `confidence` (0–1), and at least one `evidence` entry with a file:line reference.
3. **Given** a repository with no detectable connections, **When** analysis completes, **Then** metadata is produced with an empty connections list and confidence `"low"`.

---

### User Story 2 — Multi-Repository Architecture Diagram (P2)

An architect manages a microservice suite and wants a complete architecture diagram showing how all services interconnect — generated without reading source code manually.

**Why P2**: Primary end-to-end value proposition. The cross-repo correlator is what turns individual metadata files into a meaningful architecture view.

**Independent Test**: 3+ repositories with known inter-service relationships. Verify the output diagram correctly captures connections including those that are only visible by correlating producers and consumers across repos (e.g., a shared Kafka topic).

**Acceptance Scenarios**:

1. **Given** multiple repos are configured, **When** the import runs, **Then** each repo is analyzed in parallel (respecting concurrency limit) with per-repo progress reported.
2. **Given** all per-repo metadata exists, **When** cross-repo correlation runs, **Then** shared topics/endpoints are matched and appear as explicit relationships in the final diagram.
3. **Given** one repo analysis fails, **When** the rest complete, **Then** a partial diagram is generated from successful repos and the failure is clearly reported.

---

### User Story 3 — Incremental Re-Import (P3)

An architect has already imported a service suite. After a code change in one service, they want to regenerate the final diagram without re-analyzing every repository.

**Why P3**: Re-extraction is fast (seconds per repo) but re-running LLM enrichment costs tokens. Incremental mode reuses existing metadata.

**Acceptance Scenarios**:

1. **Given** `.metadata.json` files already exist, **When** the tool runs, **Then** repos with valid existing metadata are skipped.
2. **Given** the user passes `--force-refresh`, **Then** all repos are re-extracted regardless of cached metadata.
3. **Given** `--aggregate-only` is passed, **Then** only the cross-repo correlation + LLM enrichment + export runs; no per-repo extraction.

---

### User Story 4 — AI Provider Configuration (P4)

A developer wants to control which AI backend performs the enrichment step — cloud or local — based on cost and privacy requirements.

**Why P4**: Provider flexibility is important for air-gapped environments and privacy-sensitive codebases. The LLM is only called for enrichment, so this only affects that stage.

**Acceptance Scenarios**:

1. **Given** Anthropic is configured, **When** enrichment runs, **Then** the tool calls the Anthropic API (respecting `ANTHROPIC_API_KEY`).
2. **Given** Ollama is configured with an endpoint, **When** enrichment runs, **Then** calls go to that endpoint; no cloud calls are made.
3. **Given** an invalid provider or unreachable endpoint, **Then** a clear error is raised before any extraction runs.

---

## Requirements

### Functional

- **FR-001**: Accept one or more local repository paths via a YAML/JSON config file
- **FR-002**: Extract connections from each repository using static analysis (manifests, code parsing, semgrep rules) — no LLM call at this stage
- **FR-003**: Produce a `.metadata.json` per repository listing detected connections with type, target, confidence, and evidence
- **FR-004**: Support confidence scoring: manifest/annotation-derived connections ≥ 0.90; code-pattern matches 0.60–0.89; LLM-only inferences 0.40–0.59
- **FR-005**: Support pluggable LLM providers (Anthropic, Ollama) for the enrichment stage; new providers addable without changing extraction code
- **FR-006**: Correlate connections across all repositories (e.g., match Kafka producer topics to consumer annotations) before enrichment
- **FR-007**: Invoke LLM enrichment once per import session across the full graph — not per repository
- **FR-008**: Produce a final `.arch.json` diagram conforming to `@arch-atlas/model-schema`
- **FR-009**: Report real-time progress: per-repo extraction stage + overall completion
- **FR-010**: Handle per-repo extraction failures without halting remaining repos; produce partial diagram
- **FR-011**: Skip repos with valid existing `.metadata.json` unless `--force-refresh` is passed
- **FR-012**: Support `--aggregate-only` to re-run only correlation + enrichment + export
- **FR-013**: Validate final diagram against schema before writing
- **FR-014**: Accept repositories as local filesystem paths only (no remote URL fetching)
- **FR-015**: Exclude secrets unconditionally: `.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*`, `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`

### Non-Functional

- **NFR-001**: 5 repositories fully extracted + enriched + diagram written in < 5 minutes
- **NFR-002**: Static extraction (no LLM) of a single repo completes in < 10 seconds
- **NFR-003**: Extraction results are deterministic — same repo produces same metadata on repeated runs
- **NFR-004**: Graph backend is pluggable (in-memory default; Neo4j optional via config)

---

## Key Entities

- **Repository**: A local source code project to be analyzed
- **Manifest**: A deployment or dependency file (docker-compose, Helm, pom.xml, package.json) from which services and infrastructure are declared
- **Extraction Signal**: A single piece of evidence — a file:line reference — that a connection exists, with an associated confidence weight
- **Connection**: A directed dependency between two named entities, composed from one or more signals; has `type`, `targetService`, `confidence`, `evidence[]`
- **Repository Metadata**: Per-repo document listing all detected connections, produced by the extraction pipeline
- **Architecture Graph**: In-memory (or Neo4j-backed) graph of all services, databases, queues, and their relationships across all repos
- **LLM Enrichment**: A single LLM call that takes the full graph and returns C4 component groupings, canonical names, and relationship labels
- **Architecture Diagram**: Final `.arch.json` conforming to the Arch Atlas schema

---

## Confidence Scoring Reference

| Signal source                                       | Example                                      | Confidence |
| --------------------------------------------------- | -------------------------------------------- | ---------- |
| Manifest declaration (`depends_on`, `DATABASE_URL`) | `docker-compose.yml: depends_on: postgres`   | 0.99       |
| Framework annotation                                | `@FeignClient("inventory-service")`          | 0.97       |
| Typed client with hardcoded URL                     | `requests.get("https://api.stripe.com/...")` | 0.95       |
| Semgrep pattern match                               | `KafkaTemplate.send("order-created", ...)`   | 0.90       |
| Import + usage pattern                              | `import redis; redis.Redis(host=REDIS_HOST)` | 0.80       |
| Dynamic URL from config var                         | `httpClient.post(os.environ["PAYMENT_URL"])` | 0.65       |
| LLM-inferred only                                   | LLM: "probably calls auth service"           | 0.50       |

Final connection confidence = `max(static_signals)` if any static signal exists; otherwise LLM confidence.

---

## Assumptions

- Repositories are in languages supported by Tree-sitter grammars: Python, Java, JavaScript, TypeScript, Go (extensible)
- Semgrep is available in the execution environment (Docker image includes it)
- The configured LLM provider has sufficient context window for the full graph JSON (~50 repos × ~500 tokens each = ~25k tokens)
- Users have read access to all repository paths
- The project's standard `.arch.json` format is defined and stable (`@arch-atlas/model-schema`)
- Repositories are pre-cloned; the tool does not fetch remote repos
