# Implementation Plan: Repository Architecture Importer

**Branch**: `007-llm-repo-importer` | **Revised**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

## Summary

Replace the LLM-first analysis approach with a **graph extraction pipeline + LLM enrichment** architecture. Static analysis (Tree-sitter + Semgrep + manifest parsing) extracts connections with confidence scores. A single LLM call at the end handles component grouping, naming, and abstraction. The LLM provider interface remains pluggable (Anthropic, Ollama, or any future provider).

**What is preserved from the existing implementation**:

- `providers/` module — `LLMProvider` ABC, `AnthropicProvider`, `OllamaProvider`, `factory.py`
- `config/` module — loader, schema (schema updated for new fields)
- `cli.py` skeleton — commands, flags, Docker wiring
- `output/diagram_builder.py` — post-processing to final `.arch.json`
- Docker setup, `docker-run.sh`, samples config

**What is replaced**:

- `analysis/` → `extraction/` (tree-sitter + semgrep replace file-sampling + LLM prompt)
- `aggregation/` → `enrichment/` (single LLM enrichment call replaces aggregation prompt)
- `session/session_manager.py` — updated to new pipeline stages

**What is added**:

- `graph/` module — in-memory graph (default) + optional Neo4j backend
- `extraction/manifest_extractor.py` — manifest file parsing
- `extraction/code_parser.py` — tree-sitter symbol/import extraction
- `extraction/rule_engine.py` — semgrep rule execution
- `extraction/relationship_extractor.py` — signal combination + confidence scoring
- `graph/cross_repo_correlator.py` — topic/endpoint matching across repos

---

## Technical Context

**Language**: Python 3.11+  
**New dependencies**:

- `tree-sitter ^0.21` + `tree-sitter-python`, `tree-sitter-java`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-go` — multi-language code parsing
- `semgrep ^1.70` — pattern-based framework/integration detection
- `pydantic ^2.7` — typed data models for graph nodes/edges
- `networkx ^3.3` — in-memory graph operations (cross-repo correlation, path queries)
- `neo4j ^5.20` — optional Neo4j driver (feature-flagged via config)

**Retained dependencies**:

- `anthropic ^0.39`, `httpx ^0.27`, `pyyaml ^6.0`, `jsonschema ^4.23`, `anyio ^4.4`, `click ^8.1`

**Storage**: Local filesystem for metadata and final diagram; in-memory graph during a session; optional Neo4j for persistent cross-session graph  
**Testing**: `pytest ^8.2` + `pytest-asyncio ^0.23`; ≥80% coverage; Semgrep rules tested against fixture repos  
**Scale**: Up to 50 repositories; graph fits in memory for typical microservice suites

---

## Project Structure

```text
apps/llm-importer/
├── llm_importer/
│   ├── cli.py                              # Click CLI (update existing)
│   ├── config/
│   │   ├── loader.py                       # Keep; update schema reference
│   │   └── import_config.schema.json       # Update: add graph_backend, semgrep fields
│   ├── providers/                          # Keep entirely as-is
│   │   ├── base.py
│   │   ├── anthropic_provider.py
│   │   ├── ollama_provider.py
│   │   └── factory.py
│   ├── extraction/                         # NEW — replaces analysis/
│   │   ├── __init__.py
│   │   ├── manifest_extractor.py           # Parse docker-compose, k8s, pom.xml, package.json
│   │   ├── code_parser.py                  # Tree-sitter AST extraction (symbols, imports)
│   │   ├── rule_engine.py                  # Run semgrep rules; return match list
│   │   ├── relationship_extractor.py       # Combine signals → RepositoryMetadata
│   │   └── rules/                          # Semgrep YAML rule files
│   │       ├── http_clients.yml            # requests, axios, fetch, httpx, RestTemplate, WebClient
│   │       ├── db_clients.yml              # SQLAlchemy, JdbcTemplate, Mongoose, pg, redis-py
│   │       ├── kafka_clients.yml           # KafkaTemplate.send, @KafkaListener, confluent-kafka
│   │       ├── queue_clients.yml           # pika/RabbitMQ, boto3 SQS, celery
│   │       └── grpc_clients.yml            # grpc channel/stub creation patterns
│   ├── graph/                              # NEW
│   │   ├── __init__.py
│   │   ├── base.py                         # ArchGraph ABC (add_node, add_edge, query_*)
│   │   ├── memory_graph.py                 # networkx-backed default implementation
│   │   ├── neo4j_graph.py                  # neo4j-driver implementation (optional)
│   │   ├── graph_factory.py                # Instantiate graph backend from config
│   │   └── cross_repo_correlator.py        # Match producers/consumers; REST endpoint correlation
│   ├── enrichment/                         # NEW — replaces aggregation/
│   │   ├── __init__.py
│   │   ├── prompts.py                      # LLM prompt: graph JSON → C4 groupings
│   │   └── llm_enricher.py                 # Single LLM call; parse + validate output
│   ├── session/
│   │   └── session_manager.py              # Update: pipeline stages, graph accumulation
│   └── output/
│       └── diagram_builder.py              # Keep; minor updates for enriched graph input
├── tests/
│   ├── conftest.py
│   ├── unit/
│   │   ├── test_config_loader.py           # Keep
│   │   ├── test_manifest_extractor.py      # NEW
│   │   ├── test_code_parser.py             # NEW
│   │   ├── test_rule_engine.py             # NEW (semgrep rules against fixtures)
│   │   ├── test_relationship_extractor.py  # NEW
│   │   ├── test_memory_graph.py            # NEW
│   │   ├── test_cross_repo_correlator.py   # NEW
│   │   ├── test_llm_enricher.py            # NEW
│   │   ├── test_session_manager.py         # Update
│   │   ├── test_diagram_builder.py         # Keep
│   │   ├── test_anthropic_provider.py      # Keep
│   │   ├── test_ollama_provider.py         # Keep
│   │   └── test_provider_factory.py        # Keep
│   ├── integration/
│   │   ├── test_single_repo_pipeline.py    # Full extraction on fixture repo
│   │   ├── test_multi_repo_pipeline.py     # Multi-repo + cross-repo correlation
│   │   ├── test_incremental.py             # Skip existing metadata
│   │   └── test_provider_switch.py         # Keep
│   ├── contract/
│   │   ├── test_metadata_schema.py         # Keep; update schema assertions
│   │   └── test_output_schema.py           # Keep
│   └── fixtures/
│       ├── repos/
│       │   ├── python_service/             # Django app with requests, celery, psycopg2
│       │   ├── java_service/               # Spring Boot with @FeignClient, KafkaTemplate
│       │   └── node_service/               # Express with axios, pg, amqplib
│       └── metadata/                       # Pre-canned .metadata.json files
├── pyproject.toml                          # Add new deps
├── Dockerfile                              # Add semgrep + tree-sitter grammars
├── docker-run.sh                           # Keep
└── README.md                               # Update
```

---

## Semgrep Rules Design

Each rule file targets one integration category. Rules are run with `--json` output and matched by `rule_id`.

Example — `http_clients.yml`:

```yaml
rules:
  - id: python-requests-get
    patterns:
      - pattern: requests.get(...)
      - pattern: requests.post(...)
    message: HTTP call via requests
    languages: [python]
    severity: INFO
    metadata: { category: http, confidence: 0.85 }

  - id: java-feign-client
    pattern: '@FeignClient($NAME)'
    message: 'FeignClient: $NAME'
    languages: [java]
    severity: INFO
    metadata: { category: http, confidence: 0.97 }
```

The rule engine extracts `path`, `start.line`, `extra.metavars.$NAME` from each match to populate connection evidence.

---

## Confidence Scoring

Scores are set per rule in `metadata.confidence`. The relationship extractor:

1. Collects all signals for a `(source_repo, target_service)` pair
2. Takes `max(signal.confidence)` as the connection confidence
3. Merges evidence lists from all signals

Manifest-derived connections (no rule needed — direct declaration) get confidence `0.99`.

---

## Graph Data Model (Pydantic)

```python
class NodeKind(str, Enum):
    SERVICE = "service"
    DATABASE = "database"
    QUEUE = "queue"
    TOPIC = "topic"
    EXTERNAL = "external"

class GraphNode(BaseModel):
    id: str
    kind: NodeKind
    name: str
    repo_path: str | None = None
    metadata: dict = {}

class EdgeKind(str, Enum):
    REST = "REST"
    GRPC = "gRPC"
    KAFKA_PUBLISH = "kafka-publish"
    KAFKA_CONSUME = "kafka-consume"
    DB_READ_WRITE = "db-read-write"
    QUEUE_PUBLISH = "queue-publish"
    QUEUE_CONSUME = "queue-consume"
    USES = "uses"

class GraphEdge(BaseModel):
    id: str
    source_id: str
    target_id: str
    kind: EdgeKind
    confidence: float
    evidence: list[str]
```

---

## LLM Enrichment Prompt Design

The enrichment prompt receives the serialized graph (nodes + edges) and asks the LLM to:

1. Assign canonical C4-style names to nodes
2. Group related nodes into logical services
3. Flag low-confidence relationships for review
4. Return updated node names and any inferred relationships not already in the graph

The prompt uses a **concrete JSON example output** (not schema definition) — same pattern proven to work with local models in the previous implementation.

---

## Implementation Phases

### Phase A: Extraction Foundation (Manifest + Tree-sitter)

**Deliverables**:

- Update `pyproject.toml` with new deps
- `extraction/manifest_extractor.py` — parse docker-compose v2/v3, k8s Deployment/Service, pom.xml dependencies, package.json dependencies/scripts
- `extraction/code_parser.py` — tree-sitter setup, language autodetection, import/symbol extraction for Python, Java, JS/TS
- Unit tests for both modules against fixture files

**Acceptance**: `manifest_extractor` correctly identifies 3 services, 1 database, 1 queue from a docker-compose fixture. `code_parser` returns import list from a Python fixture file.

---

### Phase B: Rule Engine (Semgrep)

**Deliverables**:

- `extraction/rules/*.yml` — HTTP, DB, Kafka, queue, gRPC rule files
- `extraction/rule_engine.py` — run semgrep programmatically (`subprocess` + `--json` output), parse results, return `list[RuleMatch]`
- Unit tests: each rule category tested against matching/non-matching fixture code

**Acceptance**: Semgrep detects `@FeignClient` in Java fixture with confidence ≥ 0.95. `requests.get` in Python fixture with confidence ≥ 0.80.

---

### Phase C: Relationship Extractor + Metadata Schema

**Deliverables**:

- `extraction/relationship_extractor.py` — combine manifest signals + semgrep matches → `RepositoryMetadata` with confidence scores
- Updated `analysis/repo_metadata.schema.json` → move to `extraction/repo_metadata.schema.json`, add `confidence`, `evidence` fields per connection
- Unit tests: multi-signal deduplication, confidence max-merge, evidence accumulation

**Acceptance**: Single repo with both manifest entry and semgrep match produces one connection with `confidence = max(0.99, 0.85) = 0.99` and two evidence entries.

---

### Phase D: Architecture Graph + Cross-Repo Correlator

**Deliverables**:

- `graph/base.py`, `graph/memory_graph.py` — `ArchGraph` ABC + networkx implementation
- `graph/cross_repo_correlator.py` — match Kafka topic names published in repo A to `@KafkaListener` in repo B; match REST endpoint declarations to call-site evidence
- `graph/graph_factory.py` — return `MemoryGraph` by default; `Neo4jGraph` if `graph_backend: neo4j` in config
- Unit tests: graph add/query, Kafka correlation, REST endpoint matching

**Acceptance**: Producer `KafkaTemplate.send("order-created")` in repo A + `@KafkaListener("order-created")` in repo B → one `KAFKA_PUBLISH` edge A→topic + one `KAFKA_CONSUME` edge topic→B.

---

### Phase E: LLM Enrichment

**Deliverables**:

- `enrichment/prompts.py` — concrete example output, not schema definition
- `enrichment/llm_enricher.py` — serialize graph → prompt → LLM call via provider → parse → validate → return enriched node/edge updates
- Unit tests: valid enrichment response, invalid JSON fallback (return graph unchanged), schema validation failure fallback

**Acceptance**: Enrichment call returns updated node names. On LLM failure, original graph is returned unchanged (enrichment is additive, never destructive).

---

### Phase F: Session Manager Update

**Deliverables**:

- Update `session/session_manager.py` to new pipeline: `extract_repo()` per-repo (parallel) → `build_graph()` → `correlate()` → `enrich()` → `export()`
- Progress callbacks updated: extraction stage names surfaced
- Incremental skip: check for `.metadata.json` before extraction (same as before)

**Acceptance**: 3 repos with concurrency=2 run extraction in parallel; graph build, correlation, enrichment, export run sequentially after all extractions.

---

### Phase G: CLI + Docker Update

**Deliverables**:

- Update `cli.py` — wire new session manager; update consent prompt (now only relevant for enrichment step)
- Update `Dockerfile` — add `semgrep`, tree-sitter grammar install steps
- Update `README.md` — new pipeline description, semgrep rules, confidence scores
- End-to-end integration test with fixture repos + mock LLM provider

**Acceptance**: `arch-atlas-import run config.yaml --yes` with mock provider writes valid `.arch.json`. `--aggregate-only` skips extraction.

---

### Phase H: Neo4j Backend (Optional)

**Deliverables**:

- `graph/neo4j_graph.py` — `Neo4jGraph` implementing `ArchGraph` ABC
- Config schema update: `graph_backend: { type: neo4j, uri: ..., user: ..., password: ... }`
- Integration test: full pipeline with Neo4j (skipped if Neo4j not available)

**Acceptance**: Pipeline completes with Neo4j backend producing identical output to in-memory backend.
