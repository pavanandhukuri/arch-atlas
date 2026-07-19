# Tasks: Repository Architecture Importer (Graph Extraction Pipeline)

**Revised**: 2026-06-04 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)  
**Language**: Python 3.11+ in `apps/llm-importer/`

**Approach**: Static analysis first (manifests → tree-sitter → semgrep → graph), LLM enrichment last (once, across full graph). TDD throughout — write each test first, confirm it fails, then implement.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: US1–US4

---

## Phase 1: Scaffold & Dependency Update

**Purpose**: Update the existing package to add new dependencies and directory structure.

- [ ] T001 Update `apps/llm-importer/pyproject.toml` — add `tree-sitter ^0.21`, `tree-sitter-python`, `tree-sitter-java`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-go`, `semgrep ^1.70`, `pydantic ^2.7`, `networkx ^3.3`; add optional `neo4j ^5.20` under `[project.optional-dependencies] neo4j`
- [ ] T002 Create `apps/llm-importer/llm_importer/extraction/` directory with `__init__.py`, `rules/` subdirectory; create `apps/llm-importer/llm_importer/graph/` with `__init__.py`; create `apps/llm-importer/llm_importer/enrichment/` with `__init__.py`
- [ ] T003 [P] Delete `apps/llm-importer/llm_importer/analysis/prompts.py` and `apps/llm-importer/llm_importer/analysis/repo_analyzer.py` and `apps/llm-importer/llm_importer/analysis/file_sampler.py` (replaced by extraction pipeline); keep `analysis/repo_metadata.schema.json` — will be moved in T010
- [ ] T004 [P] Delete `apps/llm-importer/llm_importer/aggregation/` directory (replaced by `enrichment/`)
- [ ] T005 [P] Update `apps/llm-importer/tests/fixtures/repos/` — add `python_service/` (Django-style app with `requests`, `psycopg2`, `celery`), `java_service/` (Spring Boot stub with `@FeignClient`, `KafkaTemplate`), `node_service/` (Express with `axios`, `pg`, `amqplib`); keep existing fixtures

**Checkpoint**: `pip install -e ".[dev]"` succeeds with new deps.

---

## Phase 2: Manifest Extractor (US1)

**Purpose**: Extract services, databases, and queues declared in deployment/dependency manifests.

- [ ] T006 [P] Write `apps/llm-importer/tests/unit/test_manifest_extractor.py` FIRST — cover: `docker-compose.yml` with `services:`, `depends_on:`, `environment: DATABASE_URL`; `package.json` with `dependencies` containing `pg`, `redis`, `amqplib`; `pom.xml` with `spring-data-jpa`, `spring-kafka`; missing file returns empty result; unsupported format skipped gracefully
- [ ] T007 Implement `apps/llm-importer/llm_importer/extraction/manifest_extractor.py` — `extract_from_manifest(path) -> list[ManifestSignal]`; `ManifestSignal(source_file, line, target_service, service_type, confidence=0.99)`; handle docker-compose v2/v3, package.json, pom.xml, build.gradle; all T006 tests must pass
- [ ] T008 [P] Add `apps/llm-importer/tests/fixtures/repos/python_service/docker-compose.yml` (postgres + redis + celery worker), `java_service/pom.xml` (spring-boot, spring-kafka, spring-data-jpa), `node_service/package.json` (express, pg, amqplib, axios)

**Checkpoint**: `pytest tests/unit/test_manifest_extractor.py` passes.

---

## Phase 3: Code Parser — Tree-sitter (US1)

**Purpose**: Extract import statements and framework annotations from source files using Tree-sitter ASTs.

- [ ] T009 [P] Write `apps/llm-importer/tests/unit/test_code_parser.py` FIRST — cover: Python file imports extracted correctly; Java `import` + annotation `@FeignClient` extracted; JS/TS `require`/`import` extracted; unknown extension returns empty; binary file skipped; truncation at 500 nodes
- [ ] T010 Implement `apps/llm-importer/llm_importer/extraction/code_parser.py` — `parse_file(path) -> ParseResult`; `ParseResult(imports: list[str], annotations: list[Annotation], symbols: list[str])`; language detected from extension; tree-sitter parser per language; `Annotation(name, args, file, line)`; all T009 tests must pass
- [ ] T011 [P] Move `apps/llm-importer/llm_importer/analysis/repo_metadata.schema.json` → `apps/llm-importer/llm_importer/extraction/repo_metadata.schema.json`; update `confidence` to `number` (0–1), add required `evidence` array of strings to each connection

**Checkpoint**: `pytest tests/unit/test_code_parser.py` passes.

---

## Phase 4: Rule Engine — Semgrep (US1)

**Purpose**: Detect framework-specific integration patterns using Semgrep rules.

- [ ] T012 [P] Create `apps/llm-importer/llm_importer/extraction/rules/http_clients.yml` — rules: `python-requests` (requests.get/post/put/delete, confidence 0.85), `python-httpx` (httpx.get/post, 0.85), `java-feign-client` (@FeignClient annotation, 0.97), `java-rest-template` (RestTemplate.exchange/getForObject, 0.88), `java-web-client` (WebClient.create, 0.88), `js-axios` (axios.get/post, 0.85), `js-fetch` (fetch(...), 0.75)
- [ ] T013 [P] Create `apps/llm-importer/llm_importer/extraction/rules/db_clients.yml` — rules: `python-sqlalchemy` (create_engine/sessionmaker, 0.90), `python-psycopg2` (psycopg2.connect, 0.92), `python-redis` (redis.Redis/StrictRedis, 0.92), `java-jdbc` (JdbcTemplate/DriverManager.getConnection, 0.90), `java-spring-data` (@Repository extends JpaRepository, 0.93), `js-pg` (new Pool/new Client from 'pg', 0.92), `js-mongoose` (mongoose.connect, 0.92)
- [ ] T014 [P] Create `apps/llm-importer/llm_importer/extraction/rules/kafka_clients.yml` — rules: `java-kafka-template` (KafkaTemplate.send("$TOPIC",...), 0.93 — capture `$TOPIC`), `java-kafka-listener`(@KafkaListener(topics="$TOPIC"), 0.93 — capture`$TOPIC`), `python-confluent-kafka-producer` (Producer.produce("$TOPIC",...), 0.90), `python-confluent-kafka-consumer` (Consumer.subscribe(["$TOPIC"]), 0.90)
- [ ] T015 [P] Create `apps/llm-importer/llm_importer/extraction/rules/queue_clients.yml` — rules: `python-pika` (pika channel.basic_publish, 0.88), `python-celery` (app.send_task/delay, 0.82), `js-amqplib` (channel.sendToQueue/publish, 0.88), `java-rabbit-template` (RabbitTemplate.convertAndSend, 0.88)
- [ ] T016 [P] Create `apps/llm-importer/llm_importer/extraction/rules/grpc_clients.yml` — rules: `python-grpc-channel` (grpc.insecure_channel/secure_channel, 0.90), `java-grpc-channel` (ManagedChannelBuilder.forAddress, 0.90), `js-grpc-client` (new grpc.Client, 0.88)
- [ ] T017 [P] Write `apps/llm-importer/tests/unit/test_rule_engine.py` FIRST — cover: HTTP rule fires on fixture Python file; Kafka producer rule fires and captures topic name; Kafka consumer rule fires and captures topic name; DB rule fires on Spring Data annotation; non-matching file returns empty list; semgrep not found raises `ExtractionError`; `--json` output parsed correctly
- [ ] T018 Implement `apps/llm-importer/llm_importer/extraction/rule_engine.py` — `run_rules(repo_path, rules_dir) -> list[RuleMatch]`; `RuleMatch(rule_id, file, line, matched_text, metavars: dict, confidence: float, category: str)`; invokes `semgrep --config <rules_dir> <repo_path> --json --quiet`; parses stdout; maps `metadata.confidence` from rule to match; raises `ExtractionError` if semgrep exits non-zero unexpectedly; all T017 tests must pass

**Checkpoint**: `pytest tests/unit/test_rule_engine.py` passes.

---

## Phase 5: Relationship Extractor (US1)

**Purpose**: Combine manifest signals, tree-sitter annotations, and semgrep matches into typed connections with confidence scores.

- [ ] T019 [P] Write `apps/llm-importer/tests/unit/test_relationship_extractor.py` FIRST — cover: manifest signal alone → connection confidence 0.99; semgrep match alone → connection at rule's confidence; same target from both manifest and semgrep → confidence = max, evidence merged; unknown URL from env var → confidence capped at 0.65; empty signals → empty connections list; schema validation of output
- [ ] T020 Implement `apps/llm-importer/llm_importer/extraction/relationship_extractor.py` — `extract_relationships(repo_ref, manifest_signals, rule_matches, parse_results) -> RepositoryMetadata`; deduplicates by `(source_repo, target_service)` normalized name; confidence = `max(all signals for this pair)`; accumulates evidence strings; validates output against `repo_metadata.schema.json`; returns `RepositoryMetadata` dict; all T019 tests must pass
- [ ] T021 [P] Write `apps/llm-importer/tests/unit/test_confidence_scoring.py` — cover: confidence max-merge across 3 signals; evidence deduplication (same file:line not repeated); normalized service name matching (`order-service` == `orderservice` == `OrderService`)

**Checkpoint**: `pytest tests/unit/test_relationship_extractor.py tests/unit/test_confidence_scoring.py` passes.

---

## Phase 6: Architecture Graph + Cross-Repo Correlator (US2)

**Purpose**: Build a graph from all per-repo metadata and correlate relationships across repos.

- [ ] T022 [P] Write `apps/llm-importer/tests/unit/test_memory_graph.py` FIRST — cover: add node, add edge, get node by id, get edges by source, get edges by target, get all nodes of kind, duplicate node id raises; serialization to dict; empty graph serialization
- [ ] T023 Implement `apps/llm-importer/llm_importer/graph/base.py` — `ArchGraph` ABC with `add_node(GraphNode)`, `add_edge(GraphEdge)`, `get_node(id) -> GraphNode | None`, `edges_from(node_id)`, `edges_to(node_id)`, `nodes_of_kind(kind)`, `to_dict() -> dict`, `from_metadata_list(list[dict]) -> None`
- [ ] T024 Implement `apps/llm-importer/llm_importer/graph/memory_graph.py` — `MemoryGraph(ArchGraph)` backed by `networkx.DiGraph`; all T022 tests must pass
- [ ] T025 [P] Write `apps/llm-importer/tests/unit/test_cross_repo_correlator.py` FIRST — cover: Kafka producer in repo A + consumer in repo B → `KAFKA_PUBLISH` A→topic + `KAFKA_CONSUME` topic→B edges; same REST base URL declared in service A + called in service B → REST edge; unmatched producer leaves dangling node; duplicate topic names across repos merged to single topic node
- [ ] T026 Implement `apps/llm-importer/llm_importer/graph/cross_repo_correlator.py` — `correlate(graph: ArchGraph) -> ArchGraph`; pass 1: collect all Kafka topic names from producer/consumer matches; pass 2: create topic nodes and producer→topic / topic→consumer edges; pass 3: match REST endpoint host patterns to service names; returns mutated graph; all T025 tests must pass
- [ ] T027 Implement `apps/llm-importer/llm_importer/graph/graph_factory.py` — `create_graph(config) -> ArchGraph`; returns `MemoryGraph()` by default; returns `Neo4jGraph(...)` if `config["graph_backend"]["type"] == "neo4j"`

**Checkpoint**: `pytest tests/unit/test_memory_graph.py tests/unit/test_cross_repo_correlator.py` passes.

---

## Phase 7: LLM Enrichment (US4)

**Purpose**: Single LLM call to enrich the graph with canonical C4 names, component groupings, and inferred relationships.

- [ ] T028 [P] Write `apps/llm-importer/tests/unit/test_llm_enricher.py` FIRST — cover: valid enrichment response updates node names in graph; invalid JSON response returns graph unchanged (no exception); schema validation failure returns graph unchanged; provider error returns graph unchanged; enrichment is idempotent (calling twice doesn't duplicate edges)
- [ ] T029 Implement `apps/llm-importer/llm_importer/enrichment/prompts.py` — `build_enrichment_prompt(graph_dict) -> str`; uses concrete JSON example output (not schema definition); includes graph nodes + edges serialized as JSON; asks LLM to: assign canonical names, group components, flag low-confidence edges, return inferred edges not already in graph
- [ ] T030 Implement `apps/llm-importer/llm_importer/enrichment/llm_enricher.py` — `async def enrich(graph, provider) -> ArchGraph`; calls `provider.complete(prompt)`; parses response JSON; validates shape; merges returned name updates + inferred edges into graph; on any failure logs warning and returns original graph unchanged; all T028 tests must pass

**Checkpoint**: `pytest tests/unit/test_llm_enricher.py` passes.

---

## Phase 8: Session Manager Update (US1, US2, US3)

**Purpose**: Wire extraction pipeline stages into the session orchestrator; preserve incremental skip logic.

- [ ] T031 [P] Write `apps/llm-importer/tests/unit/test_session_manager.py` — cover: per-repo extraction runs in parallel up to concurrency limit; one extraction failure doesn't cancel others; repos with existing `.metadata.json` skipped when `force_refresh=False`; `analyze_only=True` stops before graph build; `aggregate_only=True` skips per-repo extraction; callbacks `on_repo_start/complete/failed` fired correctly
- [ ] T032 Update `apps/llm-importer/llm_importer/session/session_manager.py` — replace LLM-per-repo call with `extract_repo(repo, config)` that runs `manifest_extractor` + `code_parser` + `rule_engine` + `relationship_extractor` for one repo; keep `anyio.create_task_group` + `anyio.Semaphore` for parallel extraction; after all extractions: `build_graph(metadata_list)` → `correlate(graph)` → `enrich(graph, provider)` → `export(graph, config)`; all T031 tests must pass
- [ ] T033 [P] Write `apps/llm-importer/tests/integration/test_single_repo_pipeline.py` — full extraction on `tests/fixtures/repos/python_service/` with mock provider; verify `.metadata.json` written with correct connections and confidence ≥ 0.85 for manifest-declared items
- [ ] T034 [P] Write `apps/llm-importer/tests/integration/test_multi_repo_pipeline.py` — 3 fixture repos; verify cross-repo Kafka correlation produces edges between `java_service` producer and consumer (if topic names match); verify final `.arch.json` valid against schema

**Checkpoint**: `pytest tests/unit/test_session_manager.py tests/integration/` passes.

---

## Phase 9: CLI + Docker Update (US1–US4)

**Purpose**: Update CLI flags, consent prompt, and Docker image for the new pipeline.

- [ ] T035 Update `apps/llm-importer/llm_importer/cli.py` — consent prompt now reads "The following repositories will be analyzed with static tools (tree-sitter, semgrep). LLM enrichment will be called once for the full graph." instead of per-repo AI call framing; all existing flags preserved (`--force-refresh`, `--analyze-only`, `--aggregate-only`, `--repos`, `--provider`, `--yes`, `--verbose`, `--output`)
- [ ] T036 Update `apps/llm-importer/Dockerfile` — add `RUN pip install semgrep` and tree-sitter grammar install (`tree-sitter-languages` or individual grammar packages); verify `semgrep --version` succeeds in image
- [ ] T037 [P] Update `apps/llm-importer/README.md` — document new pipeline stages, semgrep rules, confidence scoring table, graph backend options, Neo4j setup instructions
- [ ] T038 [P] Update `apps/llm-importer/llm_importer/config/import_config.schema.json` — add optional `graph_backend` object (`type: "memory"|"neo4j"`, `uri`, `user`, `password`); add optional `analysis.confidenceThreshold` (default 0.5, connections below this excluded from diagram)

**Checkpoint**: `docker build` succeeds; `arch-atlas-import --help` shows updated description.

---

## Phase 10: Neo4j Backend (US2 — Optional)

**Purpose**: Persistent graph backend for large-scale or cross-session correlation.

- [ ] T039 [P] Write `apps/llm-importer/tests/unit/test_neo4j_graph.py` — mock `neo4j.GraphDatabase.driver`; cover: add_node executes CREATE query, add_edge executes MERGE, get_node returns correct model, `pytest.mark.skipif` if neo4j extra not installed
- [ ] T040 Implement `apps/llm-importer/llm_importer/graph/neo4j_graph.py` — `Neo4jGraph(ArchGraph)` using `neo4j.AsyncGraphDatabase.driver`; maps `GraphNode`/`GraphEdge` to Cypher CREATE/MERGE; implements all `ArchGraph` abstract methods; all T039 tests must pass
- [ ] T041 [P] Write `apps/llm-importer/tests/integration/test_neo4j_pipeline.py` — `pytest.mark.skipif` unless `NEO4J_URI` env var set; full pipeline with Neo4j backend; verify output identical to memory backend

**Checkpoint**: `pytest tests/unit/test_neo4j_graph.py` passes (mocked). Neo4j integration test passes when `NEO4J_URI` is set.

---

## Phase 11: Contract & Coverage (All Stories)

**Purpose**: Ensure schema contracts hold and coverage threshold is met.

- [ ] T042 [P] Update `apps/llm-importer/tests/contract/test_metadata_schema.py` — verify updated schema (with `confidence` float, `evidence` array) passes valid fixture metadata; missing `confidence` fails; `confidence > 1` fails; empty `evidence` array fails
- [ ] T043 [P] Keep `apps/llm-importer/tests/contract/test_output_schema.py` — no changes needed; final diagram schema unchanged
- [ ] T044 Run `pytest --cov=llm_importer --cov-fail-under=80` — fix any coverage gaps; add targeted unit tests for uncovered branches until ≥80% reached

**Checkpoint**: `pytest --cov=llm_importer --cov-fail-under=80` green.

---

## Completion Criteria

All tasks marked `[X]`. The following commands must all pass:

```bash
cd apps/llm-importer
pytest --cov=llm_importer --cov-fail-under=80
docker build -t arch-atlas-llm-importer:latest .
arch-atlas-import --help
```

End-to-end smoke test (Ollama on host):

```bash
./docker-run.sh samples/sample-projects.yaml --yes --verbose
# → samples/output/architecture.arch.json written and valid
```
