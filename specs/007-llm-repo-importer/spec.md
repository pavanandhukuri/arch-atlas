# Feature Specification: Repository Architecture Importer

**Feature Branch**: `007-llm-repo-importer`  
**Created**: 2026-05-14  
**Revised**: 2026-07-25  
**Status**: Active — pipeline redesign in progress (agentic local-model extraction replaces the static extraction stage described in the prior revision)

## Approach

**Agentic, local-model-driven extraction, still followed by cross-repository correlation** — supersedes the static-analysis-first approach of the prior revision.

The previous approach (Tree-sitter + Semgrep + manifest parsing, one LLM enrichment call at the end) is being replaced with an agent-driven analysis stage: each repository is handed to a local, user-supplied language model running inside an open-source coding-agent harness, which browses the repository the way a developer would (reading files, following imports, inspecting configuration) and produces a knowledge graph of that repository's internal structure and its connections to other systems. This reuses the analysis approach and prompts of an existing open-source codebase-understanding skill rather than re-implementing per-language structural extraction from scratch.

Because this per-repository analysis has no awareness of any other repository in the import batch, a **new correlation stage** is required to find connections that are only visible when comparing repositories to each other (e.g., a message queue topic produced by one repository and consumed by another). This did not exist in the reused skill and is new work for this feature.

The output artifact and the human review experience (Studio's import wizard: tag/classify elements, accept/reject candidate relationships) are **not changing** — only the mechanism that produces the review artifact changes.

Pipeline stages:

```
Repository (1 of N)
    ↓
Agent-Driven Analysis     (local model + coding-agent harness, running an adapted
                            codebase-understanding skill — browses files, produces
                            a per-repository knowledge graph: internal structure +
                            connections to other systems)
    ↓  (repeat per repository, with centrally bounded concurrency — see FR-016)
Per-Repository Knowledge Graphs (N of them)
    ↓
Cross-Repository Correlator   (NEW, hybrid — deterministic matcher over literal
                                identifiers first; an agentic reasoning pass over
                                condensed per-repo summaries runs only for
                                repos/pairs the deterministic pass could not
                                resolve)
    ↓
Review Artifact Assembly  (same schema/format Studio's import wizard already
                            consumes — unchanged by this revision)
    ↓
C4 / arch.json Exporter   (conforming to @arch-atlas/model-schema — unchanged)
```

**Explicitly out of scope for this revision**: any change to the Studio import wizard UI, the review-artifact schema, or the final `.arch.json` schema. This revision only changes what produces the review artifact.

---

## User Stories & Testing

### User Story 1 — Single Repository Analysis (P1)

An architect wants to understand what external services a single codebase depends on. They run the import tool against one repository and get a knowledge-graph artifact listing the repository's structure and its detected outgoing connections — service calls, database connections, message queue integrations — each with a relationship weight/confidence signal.

**Why P1**: Atomic unit of the entire feature. Validates the agent-driven analysis stage before multi-repo work.

**Independent Test**: Point the tool at a repository with known connections, using a local model the user has configured. Verify the resulting knowledge graph lists each known connection with a recognizable type and target, and that the run completes without requiring any hosted/cloud API call.

**Acceptance Scenarios**:

1. **Given** a valid repository path and a configured local model, **When** the user runs analysis, **Then** the tool runs an agent-driven analysis session scoped to that repository and writes a per-repository knowledge-graph artifact.
2. **Given** analysis completes, **When** the artifact is reviewed, **Then** every detected connection has a recognizable relationship type, a target, and a relationship weight/confidence signal.
3. **Given** a repository with no detectable outbound connections, **When** analysis completes, **Then** an artifact is produced with an empty (or near-empty) connections list rather than a failure.
4. **Given** the local model produces output that cannot be parsed into a valid knowledge graph, **When** analysis completes, **Then** the tool retries that repository's analysis session once; if the retry also fails, the repository is skipped, its failure is reported, and the rest of the run continues (mirrors FR-010's existing per-repo failure handling).

---

### User Story 2 — Multi-Repository Architecture Diagram (P2)

An architect manages a microservice suite and wants a complete architecture diagram showing how all services interconnect — generated without reading source code manually.

**Why P2**: Primary end-to-end value proposition. Cross-repository correlation is what turns individually-analyzed repositories into a meaningful architecture view — and this capability does not exist in the reused analysis skill, so it is the main new work in this revision.

**Independent Test**: 3+ repositories with known inter-service relationships. Verify the output diagram correctly captures connections including those that are only visible by correlating one repository's outbound connection against another repository's own knowledge graph (e.g., a shared message queue topic).

**Acceptance Scenarios**:

1. **Given** multiple repos are configured, **When** the import runs, **Then** each repo is analyzed with centrally bounded concurrency (see FR-016) and per-repo progress is reported.
2. **Given** all per-repo knowledge graphs exist, **When** cross-repository correlation runs, **Then** a deterministic matcher first identifies connections via literal shared identifiers (service names, ports, env vars, topic names) across repos' knowledge graphs; for any repo pair the deterministic pass could not resolve, an agentic reasoning pass over condensed per-repo summaries runs as a fallback; all resulting connections appear as explicit relationships in the final diagram.
3. **Given** one repo's analysis fails after one retry (see US1 scenario 4) or produces unusable output, **When** the rest complete, **Then** a partial diagram is generated from the successful repos and the failure is clearly reported.

---

### User Story 3 — Incremental Re-Import (P3)

An architect has already imported a service suite. After a code change in one service, they want to regenerate the final diagram without re-analyzing every repository.

**Why P3**: Agent-driven analysis is significantly more expensive per repository (in time, and in load on the user's local model) than the static extraction it replaces, which makes reusing prior results even more valuable than before. Incremental mode reuses existing per-repository knowledge graphs.

**Acceptance Scenarios**:

1. **Given** a repository's knowledge-graph artifact already exists from a prior run, **When** the tool runs again, **Then** repos with a valid existing artifact are skipped and not re-analyzed.
2. **Given** the user passes `--force-refresh`, **Then** all repos are re-analyzed regardless of cached artifacts.
3. **Given** `--aggregate-only` is passed, **Then** only cross-repository correlation + review-artifact assembly + export runs; no per-repo agent analysis.

---

### User Story 4 — Local Model Configuration (P4)

A developer wants to point the importer at whichever local model runtime they already have running (for example Ollama or MLX), so that source code and derived architecture information never leave their machine.

**Why P4**: Running entirely against a user-supplied local model — not a hosted API — is a defining requirement of this revision, driven by privacy and air-gapped-environment needs. This is a significant change from the prior revision, where the LLM enrichment step primarily targeted a hosted API (Anthropic) with Ollama as an alternative.

**Acceptance Scenarios**:

1. **Given** a local model endpoint and model identifier are configured, **When** the tool runs, **Then** every agent-driven analysis session and the cross-repository correlation step (regardless of which mechanism Q1 resolves to) use only that local endpoint; no outbound call is made to a hosted/cloud LLM API.
2. **Given** the configured local endpoint is unreachable, **Then** a clear error is raised before any repository analysis begins.
3. **Given** the user has multiple local models available, **When** they select one via configuration, **Then** that model is used for all analysis and correlation in the run.

---

## Requirements

### Functional

- **FR-001**: Accept one or more local repository paths via a YAML/JSON config file
- **FR-002**: Analyze each repository using an agent-driven session backed by a user-supplied local model — the model is given tools to browse the repository (read files, inspect configuration) rather than being handed a static pre-parsed summary
- **FR-003**: Produce a per-repository knowledge-graph artifact capturing that repository's internal structure and its detected connections to other systems, each with a type, target, and relationship weight/confidence signal
- **FR-004**: Map the agent-derived relationship weight into the same confidence representation the review UI already displays (high/medium/low); exact bucketing is a planning-level detail (see Assumptions)
- **FR-005**: Support only user-supplied local model backends (e.g. reachable via Ollama- or MLX-style local endpoints) for this revision's analysis and correlation stages; configuration must not require a hosted/cloud API key to run
- **FR-006**: Identify connections that span two or more repositories (e.g., a message queue topic produced by one repository and consumed by another) that are not visible from any single repository's own knowledge graph, using a hybrid strategy: a deterministic matcher over literal identifiers (service names, ports, env vars, topic names) runs first across all repos' knowledge graphs; an agentic reasoning pass over condensed per-repo summaries runs only for the repos/pairs the deterministic pass could not resolve
- **FR-010a**: A repository whose agent-driven analysis session fails to produce a valid, parseable knowledge graph MUST be retried once before being treated as a failure; if the retry also fails, the repository is skipped and reported per FR-010
- **FR-007**: Run one agent-driven analysis session per repository (not one call across the whole batch); run cross-repository correlation as a separate step once all per-repository knowledge graphs are available
- **FR-008**: Produce a final `.arch.json` diagram conforming to `@arch-atlas/model-schema` — unchanged from the prior revision
- **FR-009**: Report real-time progress: per-repo analysis stage + overall completion — more important than before, since agent-driven analysis of a single repository is expected to take substantially longer than static extraction did
- **FR-010**: Handle per-repo analysis failures (including a local model producing unusable output — see Q3) without halting remaining repos; produce partial diagram
- **FR-011**: Skip repos with a valid existing knowledge-graph artifact unless `--force-refresh` is passed
- **FR-012**: Support `--aggregate-only` to re-run only cross-repository correlation + review-artifact assembly + export
- **FR-013**: Validate final diagram against schema before writing — unchanged from the prior revision
- **FR-014**: Accept repositories as local filesystem paths only (no remote URL fetching) — unchanged
- **FR-015**: Exclude secrets unconditionally: `.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*`, `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/` — unchanged, and applies to whatever files the agent session is allowed to read, not just files handed to a static parser
- **FR-016**: Centrally bound total concurrent load on the user's local model across the whole run — both the number of repositories analyzed in parallel and any parallel sub-tasks the analysis agent itself spawns per repository — so a single local model endpoint is not overwhelmed by two independently-scaling layers of fan-out
- **FR-017**: The tool MUST be fully usable with no outbound network call to any hosted/cloud LLM API — every analysis and correlation call must be satisfiable by a local model endpoint the user controls

### Non-Functional

- **NFR-001**: Progress must be visibly reported throughout a run; no fixed wall-clock target is set for a 5-repository run in this revision, since total time now depends on the user's local model and hardware rather than being dominated by fixed-cost static parsing (see Assumptions)
- **NFR-002**: _(removed — was "static extraction completes in <10s"; extraction is no longer a static, LLM-free stage in this revision)_
- **NFR-003**: Analysis results are best-effort consistent rather than strictly deterministic — re-running against the same repository and model may not reproduce byte-identical output, since the analysis stage is now LLM-driven. This is a known regression from the prior revision's guarantee and should be called out to users, not silently dropped.
- **NFR-004**: Whatever mechanism resolves Q1 (cross-repository correlation) should not hard-require a specific graph database; pluggability is preferred but not required to be identical to the prior revision's in-memory/Neo4j split

---

## Key Entities

- **Repository**: A local source code project to be analyzed
- **Local Model Endpoint**: A user-supplied, locally-reachable model runtime (e.g. an Ollama or MLX-style endpoint) and the specific model identifier to use — required configuration for every run
- **Agent Analysis Session**: One bounded, tool-using interaction between the local model and a single repository, producing that repository's knowledge graph
- **Repository Knowledge Graph**: Per-repository artifact describing that repository's internal structure (files, components) and its detected connections to other systems, each connection carrying a type, target, and relationship weight/confidence signal — replaces the prior revision's per-repo `.metadata.json`
- **Cross-Repository Connection**: A relationship between two repositories that is only identifiable by comparing their knowledge graphs against each other (e.g., a shared message queue topic) — produced by the new correlation stage (Q1)
- **Connection**: A directed dependency between two named entities; has `type`, `targetService`, a confidence representation, and supporting detail from the originating knowledge graph(s)
- **Architecture Diagram**: Final `.arch.json` conforming to the Arch Atlas schema — unchanged

---

## Confidence Representation

The prior revision derived confidence from which deterministic signal source detected a connection (manifest declaration, framework annotation, semgrep pattern match, etc. — each with a fixed score). That signal taxonomy no longer applies: connections are now asserted by the agent's own analysis, carrying a relationship weight rather than a static-signal-derived score.

This revision still needs to answer, before implementation: how an agent-asserted relationship weight (and, separately, a cross-repository connection found by whatever mechanism Q1 resolves to) maps onto the same high/medium/low confidence buckets the review UI already displays. A reasonable default — document the actual mapping as an implementation/planning decision rather than blocking this spec on it — is a monotonic bucketing of the weight (higher weight → higher confidence bucket), adjusted upward when a connection is corroborated by more than one signal (e.g., asserted independently by both repositories on either end of it) and downward when asserted by only one side. The exact thresholds are a planning-level decision (see `plan.md`), not a spec-level one.

---

## Assumptions

- The user has a local model runtime already running and reachable (e.g. Ollama or an MLX-based server) before running the importer; the tool does not install or manage the model runtime itself
- The chosen local model is capable of reliable multi-turn, tool-using interaction (reading files, following imports) and of producing structured output the tool can parse — the tool is not responsible for compensating for a fundamentally incapable model beyond the failure handling in Q3
- Users have read access to all repository paths
- The project's standard `.arch.json` format and the Studio import wizard's review-artifact schema are unchanged by this revision and remain stable
- Repositories are pre-cloned; the tool does not fetch remote repos
- Total run time for a multi-repository import is expected to be substantially longer than the prior static-analysis pipeline, since every repository now requires a full agent-driven analysis session rather than a fast deterministic parse; this is an accepted tradeoff for this revision, not a regression to be optimized away here
- This revision is an **immediate, full replacement** of the static-analysis-based importer — no fallback path is kept. The prior pipeline (Tree-sitter/Semgrep/manifest extraction, in-memory/Neo4j graph, single-call enrichment) is retired as part of delivering this feature, not maintained in parallel. A consequence: with no local model configured, the importer does not run at all (see US4 scenario 2) — there is no static-analysis-only mode to fall back to.
