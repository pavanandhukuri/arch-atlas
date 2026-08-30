# Feature Specification: Bounded Per-Repository Analysis

**Feature Branch**: `008-bounded-repo-analysis`
**Created**: 2026-08-29
**Status**: Draft
**Supersedes**: The per-repository analysis stage of `007-llm-repo-importer` (the vendored Understand-Anything `/understand` skill run per repo). Everything downstream of that stage in 007 — cross-repository correlation, review-artifact assembly, `.arch.json` export, the Studio import wizard — is retained unchanged. 007 remains the historical record of the agentic-skill approach.

## Approach

**Replace the per-repository analysis engine with a single bounded, structured-output model call.** Everything else about the importer stays.

Today (007), each repository is analyzed by launching a vendored copy of Understand-Anything's multi-phase `/understand` skill inside an agent session driven by the user's local model. That skill browses the repo file-by-file and produces a deep knowledge graph (13 node types, 13 edge types, hundreds of nodes for a small repo). Investigation of the running system shows that graph is almost entirely discarded before it reaches the output:

- The final `.arch.json` export emits exactly **one container element per repository** — today just a name.
- The stage that actually discovers cross-repository connections was deliberately built to read **raw repository files directly**, independently of the analysis graph, because that graph proved too unreliable to depend on.
- The only part of the analysis graph any downstream consumer genuinely uses is the list of **HTTP endpoints the repository serves** (used to match other repositories' outbound URL references). The per-repository description the graph carries is already read by nothing. A prose-matching correlation heuristic that leans on the graph's node text found **zero** connections on the one real multi-repository workspace it was measured against, while the file-reading passes found all of them.
- Driving the multi-phase skill headlessly through a small local model is fragile: three separate defects (silent loss of all skills/extensions, the model stalling after reading the skill instead of running it, the model abandoning the real pipeline and fabricating a shortcut result) each needed dedicated babysitting logic to detect and work around.
- The skill also drags in a Python runtime prerequisite (it shells out to a vendored Python merge script), which is the importer's one standing deviation from the project's "keep Python in clearly separated packages" structural rule.

What the importer actually needs from per-repository analysis is small and bounded: per repository — a name, a short description, a language/framework guess, and the repository's external interfaces (served HTTP routes, gRPC services, published/consumed message topics, datastores) that the file-reading correlation passes might miss. That is a single model call with a fixed context and a structured response, not a multi-phase agentic session.

Pipeline after this change:

```
Repository (1 of N)
    |
Bounded Analysis Call   (deterministically gather context: README(s), manifest
                         file(s), a bounded directory listing, a few
                         relevance-ranked source files -> ONE structured-output
                         model call, no tools, single turn, one retry on
                         invalid output -> per-repository analysis artifact:
                         name, description, languages/frameworks, served
                         interfaces, outbound connection intents)
    |  (repeat per repository, bounded concurrency - unchanged from 007 FR-016)
Per-Repository Analysis Artifacts (N of them)
    |
Cross-Repository Correlator   (UNCHANGED from 007 - deterministic evidence
                               passes over raw repository source, then an
                               agentic fallback for unresolved pairs)
    |
Review Artifact Assembly   (UNCHANGED from 007)
    |
C4 / arch.json Exporter    (UNCHANGED contract; additionally carries each
                            repository's description and technology onto its
                            container element - both fields already exist in
                            the diagram schema and are unused today)
```

**Explicitly unchanged**: the cross-repository correlator (deterministic file-reading passes and the agentic fallback), review-artifact assembly, the review-artifact schema Studio consumes, the `.arch.json` schema, the run-config schema, local-model configuration and reachability checks, bounded concurrency, per-repository caching and the incremental-re-import flags, and the Studio import wizard.

**In scope, additively**: each repository's container element in the exported `.arch.json` gains a description and a technology label sourced from its analysis. If it is a non-breaking addition to the review artifact, the same two fields are carried there so the Studio wizard's classify step can pre-fill them.

**Out of scope**: any change to how cross-repository connections are found, scored, assembled, exported, or reviewed; any change to the run-config format; any change to the Studio wizard beyond consuming two new optional fields if they are added.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Single-Repository Analysis Without the Multi-Phase Skill (Priority: P1)

An architect points the importer at one repository, configured with their local model. Analysis of that repository completes as a **single bounded model call** over a fixed, pre-gathered context — no multi-phase agent session, no file-by-file browsing, no Python interpreter involved — and writes a per-repository analysis artifact containing the repository's name, a short description, its languages/frameworks, and its external interfaces (served HTTP routes, gRPC services, message topics it publishes or consumes, datastores it uses).

**Why this priority**: This is the whole feature. It is the atomic unit that replaces the 007 analysis stage and it is independently demonstrable before any multi-repository or export work.

**Independent Test**: Point the tool at one repository with known served endpoints and a known stack, using a configured local model. Verify a per-repository analysis artifact is written; verify it names the stack and lists the known interfaces; verify the run makes exactly one model call for that repository (plus at most one retry), invokes no Python, and loads no multi-phase analysis skill.

**Acceptance Scenarios**:

1. **Given** a valid repository path and a configured local model, **When** analysis runs, **Then** the tool gathers a bounded context (README(s), manifest file(s), a depth- and breadth-limited directory listing, a small number of relevance-ranked source files) and issues one structured-output model call over that context.
2. **Given** the model call returns a well-formed structured response, **When** analysis completes, **Then** a per-repository analysis artifact is written containing the repository name, a description, a languages/frameworks list, a list of served interfaces, and a list of outbound connection intents.
3. **Given** the model returns output that cannot be parsed into a valid analysis artifact, **When** analysis runs, **Then** the tool retries that repository's call exactly once; if the retry also fails, the repository is skipped, its failure is reported, and the rest of the run continues.
4. **Given** a repository with no discernible external interfaces, **When** analysis completes, **Then** a valid artifact is produced with empty interface and outbound-intent lists rather than a failure.
5. **Given** the secret-exclusion path list, **When** context is gathered, **Then** no excluded file (e.g. `.env`, `*.key`, `*.pem`, `*secret*`) is ever read into the model call's context.
6. **Given** any valid configuration, **When** a repository is analyzed, **Then** no outbound call is made to a hosted/cloud model API and no Python interpreter is invoked.

---

### User Story 2 — Multi-Repository Import Still Produces a Correlated Diagram (Priority: P2)

An architect runs the importer across a microservice suite. Each repository is analyzed by the bounded call, then the existing cross-repository correlator, review assembly, and export run exactly as before, producing a review artifact and an `.arch.json` diagram. The cross-repository connections found are equivalent to — or better than — what the previous multi-phase-skill pipeline produced for the same workspace.

**Why this priority**: This proves the replacement is a true drop-in for the analysis stage: the downstream stages consume the new artifact without modification and end-to-end value is preserved.

**Independent Test**: Run the importer against a multi-repository workspace with known inter-service relationships (a shared message topic, a gateway-prefixed HTTP call, a shared datastore). Verify the correlator finds each known connection, the review artifact and diagram are produced, and one repository's analysis failure still yields a partial diagram from the rest.

**Acceptance Scenarios**:

1. **Given** multiple repositories are configured, **When** the import runs, **Then** each is analyzed by one bounded call with total concurrent model load bounded by the existing shared limit, and per-repository progress is reported.
2. **Given** all per-repository analysis artifacts exist, **When** cross-repository correlation runs, **Then** it consumes the new artifacts through an adapter and produces the same kinds of evidenced connections it produced from the 007 analysis graph, including connections that depend on knowing which HTTP routes a repository serves.
3. **Given** one repository's analysis fails after its retry, **When** the rest complete, **Then** a partial review artifact and diagram are produced from the successful repositories and the failure is clearly reported.
4. **Given** a repository already has a valid analysis artifact from a prior run, **When** the tool runs again without a force flag, **Then** that repository is not re-analyzed; **and** the force-refresh, aggregate-only, analyze-only, and repository-subset flags behave exactly as in 007.
5. **Given** the same workspace analyzed by the 007 pipeline and by this one, **When** the resulting cross-repository connection sets are compared, **Then** this pipeline's set is a superset of, or equal to, the known-correct connections the 007 pipeline found for that workspace.

---

### User Story 3 — Repository Description and Technology Reach the Diagram (Priority: P3)

An architect opens the generated `.arch.json` (or the Studio import wizard) and sees each repository's container element already carrying a one-line description and a technology label, instead of a bare name.

**Why this priority**: It is the payoff for producing a description and stack guess at all — otherwise, as today, that information is computed and then dropped. Small and additive.

**Acceptance Scenarios**:

1. **Given** a completed analysis artifact with a description and languages/frameworks, **When** the diagram is exported, **Then** the repository's container element carries that description and a technology label derived from the languages/frameworks.
2. **Given** an analysis artifact where the model returned no usable description or stack, **When** the diagram is exported, **Then** the container element is still valid, simply without those optional fields.
3. **Given** the review artifact is assembled, **When** carrying the description and technology there is possible without breaking what the Studio wizard already parses, **Then** those fields are included so the wizard's classify step can pre-fill them; **otherwise** the review artifact is left byte-compatible with 007 and only the diagram carries them.

---

### User Story 4 — Remove the Vendored Analysis Dependency (Priority: P4)

A maintainer removes the vendored Understand-Anything tree, the subagent-batching machinery, the headless-operation babysitting logic, and the Python runtime prerequisite — once the bounded-call replacement is implemented and proven against a real multi-repository workspace.

**Why this priority**: It is the cleanup that realizes the feature's motivation (smaller supply-chain surface, no Python runtime, no fragile multi-phase orchestration to maintain), but it must not happen until the replacement is proven, and it must be confirmed with the maintainer before execution.

**Acceptance Scenarios**:

1. **Given** the bounded-call analysis is implemented and its test suite is green, **When** the replacement has been run end-to-end against both the expanded fixture workspace and one real multi-repository workspace with a live local model, **Then** the maintainer is presented with the comparison evidence and asked to confirm removal.
2. **Given** maintainer confirmation, **When** removal is executed, **Then** the vendored analysis tree, the subagent-batching code, the resource-loader / reload-verify / persistence-nudge / fabrication-detection logic, and their tests are deleted; **and** the shared secret-path list and the shared concurrency limiter are retained because other retained code uses them.
3. **Given** removal is complete, **When** the importer's documentation and build metadata are inspected, **Then** no Python interpreter is listed as a prerequisite and the project's structural-rule deviation for a bundled Python script is retired.
4. **Given** removal is complete, **When** the full importer test suite and the monorepo typecheck/lint/test pipeline run, **Then** they pass with coverage at or above the project's threshold.

---

### Edge Cases

- **Oversized context**: a repository with a very large README or hundreds of manifest/source files — context gathering must stay within fixed depth, file-count, and byte caps and still produce a usable call.
- **Model ignores the requested structure**: response is prose, or JSON with the wrong shape, or JSON with extra fields — treated as invalid output, one retry, then a reported per-repository failure.
- **Model invents interfaces**: the analysis is best-effort and may over- or under-report; downstream correlation already treats analysis-sourced signals as corroboration rather than proof, so a spurious interface does not by itself create a diagram connection.
- **Monorepo / multi-service repository**: a single configured path containing several services — analysis produces one artifact for the configured path (same granularity as 007); finer decomposition is out of scope.
- **Repository path missing at correlation time**: the file-reading correlation passes already degrade gracefully when a recorded repository path is no longer on disk; that behavior is unchanged.
- **Language the relevance heuristic does not recognize**: context gathering falls back to README + manifests + directory listing; the call still runs.
- **Re-run after upgrading from 007**: a directory containing only old 007-format per-repository graph artifacts — the tool does not silently consume them as if they were the new format; affected repositories are re-analyzed.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The tool MUST analyze each repository with a single bounded model interaction — one structured-output call over a pre-assembled context, with no tool use, no multi-turn browsing, and no multi-phase orchestration.
- **FR-002**: The tool MUST assemble that context deterministically from: the repository's README file(s), its dependency/build manifest file(s), a directory listing bounded in depth and breadth, and a bounded number of source files selected by a relevance heuristic (entrypoints and route/handler/consumer/publisher-like files).
- **FR-003**: Context assembly MUST enforce the same secret-path exclusions the 007 importer enforces (`.env`, `*.key`, `*.pem`, `*secret*`, `*credential*`, `*password*`, `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`), and MUST stay within fixed caps on directory depth, file count, and per-file and total byte size.
- **FR-004**: The analysis call MUST return, per repository: a name, a short description, a list of languages/frameworks, a list of served external interfaces (HTTP routes with method where known, gRPC services, message topics published or consumed with direction where known, datastores/tables), and a list of outbound connection intents.
- **FR-005**: The tool MUST persist each repository's analysis as its own artifact in the output directory, under a name and shape that reflect what it now contains (not the 007 knowledge-graph name/shape).
- **FR-006**: The tool MUST validate each analysis artifact against an explicit schema before persisting it; an artifact that fails validation after the one allowed retry is treated as a failed repository and is not written.
- **FR-007**: On a model call whose output is unparseable or fails schema validation, the tool MUST retry that repository's call exactly once, then — if the retry also fails — skip the repository, report the failure, and continue the run.
- **FR-008**: The tool MUST map each persisted analysis artifact, through an adapter, into the in-memory structure the existing cross-repository correlator consumes, such that the correlator, review assembly, and export code are not modified in behavior.
- **FR-009**: The cross-repository correlator MUST continue to find connections that depend on knowing a repository's served HTTP routes; the served-route information the correlator needs MUST come from the new analysis artifact.
- **FR-010**: The tool MUST NOT make any outbound call to a hosted/cloud model API under any configuration, and MUST NOT require or invoke a Python interpreter at any point in analysis.
- **FR-011**: Total concurrent load on the local model across a multi-repository run MUST remain bounded by the existing single shared concurrency limit.
- **FR-012**: Per-repository caching and the incremental-re-import behaviors (skip-if-cached by default, force-refresh, aggregate-only, analyze-only, repository-subset selection) MUST behave as they do in 007, operating on the new artifact.
- **FR-013**: The tool MUST report real-time per-repository progress and an overall completion summary, including which repositories were analyzed, skipped-as-cached, or failed.
- **FR-014**: A repository whose analysis fails after its retry MUST NOT halt the run; a partial review artifact and diagram MUST still be produced if at least one repository succeeded, with failures clearly reported.
- **FR-015**: The exported `.arch.json` MUST carry each analyzed repository's description and a technology label (derived from its languages/frameworks) on that repository's container element.
- **FR-016**: If the description and technology fields can be added to the review artifact without breaking what the Studio import wizard already parses, the tool MUST include them there as well; otherwise the review artifact MUST remain compatible with what 007 produced.
- **FR-017**: Once the replacement is implemented and its tests pass, it MUST be exercised end-to-end against (a) an expanded multi-language fixture workspace and (b) one real multi-repository workspace with a live local model, and the resulting cross-repository connection set MUST be shown to be equal to or a superset of the known-correct connections the 007 pipeline found for a comparable workspace.
- **FR-018**: Removal of the vendored analysis tree, the subagent-batching code, the headless-babysitting logic (resource-loader reload/verify, persistence nudges, fabrication detection), their tests, and the Python prerequisite MUST occur only after FR-017 is satisfied and MUST be confirmed with the maintainer before execution.
- **FR-019**: After removal, the shared secret-path list and the shared concurrency limiter MUST remain in the codebase (retained consumers depend on them), and the full importer test suite plus the monorepo typecheck/lint/test pipeline MUST pass at or above the project's coverage threshold.

### Non-Functional Requirements

- **NFR-001**: Per-repository analysis is best-effort consistent, not byte-deterministic — re-running against the same repository and model may not reproduce identical output (carried forward from 007). The cross-repository correlation stage remains byte-deterministic given fixed analysis artifacts.
- **NFR-002**: A single-repository analysis SHOULD complete in one model call plus at most one retry; the tool MUST NOT issue additional "keep going" or "continue" prompts to coax completion.
- **NFR-003**: The analysis prompt and the model's response MUST be treated as untrusted input; a response is only accepted after passing explicit schema validation.
- **NFR-004**: Removing the vendored dependency MUST reduce, not expand, the importer's third-party/supply-chain surface, and MUST eliminate the bundled-Python structural-rule deviation rather than relocating it.

## Key Entities _(include if feature involves data)_

- **Repository**: a local source-code project to be analyzed — a filesystem path, an optional display name, an optional description hint (unchanged from 007).
- **Analysis Context**: the bounded, deterministically-gathered material handed to the model for one repository — README text, manifest file contents, a directory listing, and a few relevance-ranked source-file excerpts, all within fixed size caps and with secret paths excluded. Not persisted.
- **Repository Analysis Artifact**: the persisted per-repository result — repository identity (name, path, description), languages/frameworks, served interfaces (HTTP routes, gRPC services, message topics with direction, datastores), and outbound connection intents. Successor to 007's per-repository knowledge-graph artifact; different name and shape.
- **Served Interface**: one externally-reachable entry point a repository exposes — an HTTP route (with method where known), a gRPC service, a message topic it publishes or consumes, or a datastore/table it owns.
- **Outbound Connection Intent**: a repository's own indication that it calls, depends on, publishes to, subscribes to, reads from, or writes to another system — used as corroboration by the cross-repository correlator, never as sole proof of a diagram connection.
- **Cross-Repository Connection**: a directed relationship between two repositories found by the correlator — schema and production logic unchanged from 007.
- **Review Artifact / Architecture Diagram**: the human-review file Studio consumes and the final `.arch.json` — schemas unchanged, except each repository's container element (and, if non-breaking, the review artifact) additionally carries a description and technology label.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Analyzing one repository issues exactly one model call, or two when the first response fails validation — never more — and involves zero Python process launches and zero multi-phase analysis-skill loads.
- **SC-002**: For a multi-repository workspace with known inter-service relationships, the importer's cross-repository connection set includes every known connection the 007 pipeline found for a comparable workspace, and no fewer.
- **SC-003**: A repository whose analysis call fails twice is reported as failed and the run still produces a review artifact and diagram from the remaining repositories.
- **SC-004**: Every exported container element for an analyzed repository carries a non-empty name, and carries a description and technology label whenever the analysis produced them.
- **SC-005**: After the vendored dependency is removed, the importer builds and its test suite passes with statement/line coverage at or above the project's threshold, the vendored tree and Python prerequisite are absent from the repository and its documentation, and the importer's declared third-party surface is smaller than before.
- **SC-006**: The importer runs end-to-end to a valid `.arch.json` with no local model reachable only to the extent 007 already allowed (i.e. it still requires a local model for analysis) — and with no configuration path reaching a hosted model API.
- **SC-007**: Context gathering never reads a secret-excluded file, demonstrated by a planted secret file in a fixture repository that never appears in the assembled context.

## Assumptions

- The user has a local model runtime already running and reachable before invoking the importer; the tool does not manage it (unchanged from 007).
- A single bounded call with a well-constructed context is sufficient for a capable local model to produce a usable name, description, stack, and interface list for a typical service repository; the tool is not responsible for compensating for a fundamentally incapable model beyond the one-retry-then-skip behavior.
- The relevance heuristic for selecting source files is allowed to be imperfect; correlation accuracy does not hinge on it because the file-reading correlation passes read repository source directly and independently.
- The 007 review-artifact and `.arch.json` schemas, and the Studio import wizard, remain the stable downstream contract; this feature only adds optional fields where doing so does not break existing parsing.
- The real multi-repository workspace used for the proof gate (and a live local-model endpoint for it) will be provided by the maintainer when that phase is reached.
- This is an immediate, full replacement of the 007 analysis stage — the vendored skill is not kept as a fallback once removal is approved.
