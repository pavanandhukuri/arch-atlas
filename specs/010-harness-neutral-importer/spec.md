# Feature Specification: Harness-Neutral Importer

**Feature Branch**: `010-harness-neutral-importer`
**Created**: 2026-08-31
**Status**: Draft
**Input**: User description: "Externalize the per-repository analysis step and remove the pi (@earendil-works) agent SDK from the importer core. The shipped importer package becomes deterministic and model-free; the per-repository analysis artifact is produced by swappable, in-repo producers (a reference local-model runner and a Claude Code skill)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The importer runs with no model and no framework (Priority: P1)

A maintainer who already has a per-repository analysis artifact for each repository in their workspace
runs the importer and gets the review artifact and the architecture diagram. No language model is
contacted, no network request is made, and no agent framework is involved. If a repository's analysis
artifact is missing or malformed, that repository is reported and skipped; the rest of the run
completes.

**Why this priority**: This is the whole point of the feature — the importer's core (context
gathering, cross-repository correlation, review assembly, diagram export) is deterministic work that
should stand on its own, free of any one agent vendor. Everything else in the feature exists to feed
this core.

**Independent Test**: Run the importer over the in-repo sample workspace using the committed sample
analysis artifacts. Confirm it produces a review artifact and a diagram equivalent (identical apart
from timestamps) to what the previous "skip analysis, aggregate only" mode produced, with no network
activity and no model-endpoint configuration required.

**Acceptance Scenarios**:

1. **Given** every repository in the workspace has a valid analysis artifact, **When** the importer
   runs, **Then** it emits the review artifact and the diagram and makes no outbound network request.
2. **Given** one repository's analysis artifact is missing and another's is malformed, **When** the
   importer runs, **Then** both are named in the output as skipped with a clear reason, and the
   diagram is still produced from the remaining repositories.
3. **Given** the same set of analysis artifacts, **When** the importer runs twice, **Then** the two
   review artifacts are identical apart from their generation timestamp.
4. **Given** a config file that still contains a model-endpoint section, **When** the importer runs,
   **Then** that section is ignored by the importer core and the run is unaffected.

---

### User Story 2 - Produce the analysis with the bundled local-model runner (Priority: P1)

A maintainer who has only a folder of repositories and a running local model server uses the
repository's bundled reference runner to produce one analysis artifact per repository, then runs the
importer. The end-to-end result (systems and their connections) is equivalent to or better than the
previous all-in-one importer produced for the same workspace and model.

**Why this priority**: Removing the built-in analysis step must not leave existing users worse off.
The bundled runner is the drop-in replacement for the previous behaviour, and it must reach a real
local model without any hosted/cloud service.

**Independent Test**: Point the bundled runner at the sample workspace and a local model server, let
it write the per-repository analysis artifacts, then run the importer. Compare the resulting
connections against the recorded baseline for the previous implementation on the same workspace and
model — within the established evaluation tolerance.

**Acceptance Scenarios**:

1. **Given** a folder of repositories and a reachable local model endpoint, **When** the bundled
   runner is invoked, **Then** it writes one schema-valid analysis artifact per repository.
2. **Given** the model returns malformed or partial output for a repository, **When** the runner
   processes it, **Then** the runner retries once and, failing that, salvages a partial artifact or
   records the repository as failed — the run continues for the others.
3. **Given** the runner has produced artifacts and the importer then runs, **When** the pipeline
   completes, **Then** the connection precision/recall on the reference workspace is within the
   evaluation tolerance of the pre-change baseline (no regression).
4. **Given** any configuration, **When** the bundled runner runs, **Then** it contacts only the
   configured local endpoint and no hosted/cloud service.

---

### User Story 3 - Produce the analysis with Claude Code (Priority: P2)

A maintainer runs the bundled Claude Code skill against a repository (or a pre-built context bundle
for it). The skill produces a schema-valid analysis artifact for that repository. They repeat per
repository, then run the importer.

**Why this priority**: This is the concrete demonstration that a proprietary/hosted harness can be
"brought in" as the analysis producer without the importer depending on it. It is opt-in — the
maintainer chooses to use it, accepting that it is a hosted-API path.

**Independent Test**: Invoke the skill on a sample repository, capture its output, and confirm it
validates against the analysis-artifact schema and that the importer accepts it downstream.

**Acceptance Scenarios**:

1. **Given** a repository path, **When** the skill is invoked, **Then** it gathers the bounded
   context and writes an analysis artifact that validates against the schema.
2. **Given** a pre-built context bundle for a repository, **When** the skill is invoked with it,
   **Then** it produces the artifact without re-reading the repository tree.
3. **Given** the skill's documentation, **When** a maintainer follows the walkthrough, **Then** they
   can produce artifacts for a multi-repository workspace and complete an import.

---

### User Story 4 - Bring your own producer (Priority: P2)

A third party writes their own analysis producer — a script, a CI job, a different agent, or a person
filling in a template — using only the published contract: the context-bundle format and the
analysis-artifact schema. The importer consumes their artifacts with no special-casing.

**Why this priority**: Harness-neutrality only holds if the contract is documented and sufficient on
its own. This story proves the seam is a real, documented boundary, not an accident of the bundled
tools.

**Independent Test**: Following only the contract documentation (not the bundled runner's source),
hand-write an analysis artifact for a sample repository and confirm the importer consumes it and
produces the expected connection for that repository.

**Acceptance Scenarios**:

1. **Given** only the contract documentation, **When** a producer emits an artifact for a
   repository, **Then** the importer accepts it if and only if it satisfies the documented schema.
2. **Given** a context bundle emitted by the importer, **When** a producer inspects it, **Then**
   every field it needs to characterise the repository's interfaces is present and no
   excluded/secret file content appears in it.

---

### User Story 5 - The agent-vendor dependency is gone (Priority: P3)

A maintainer inspecting the importer package's dependencies finds no dependency on the previously
bundled agent framework. The supply-chain surface of the importer core is reduced accordingly.

**Why this priority**: A concrete, checkable outcome of the change, but subordinate to the pipeline
working (US1–US2).

**Independent Test**: List the importer package's resolved dependencies; confirm the agent-framework
packages are absent, and that the lockfile no longer resolves them on the importer's behalf.

**Acceptance Scenarios**:

1. **Given** the importer package manifest and lockfile, **When** dependencies are listed, **Then**
   the agent-framework packages appear nowhere in the importer's dependency tree.
2. **Given** a clean install of only the importer package, **When** its test suite runs, **Then** it
   passes without those packages present.

---

### Edge Cases

- **Config still references a model endpoint**: the importer core ignores it (US1 AS-4); the bundled
  runner reads its own model configuration.
- **A repository has a stale analysis artifact from an older schema version**: treated as malformed —
  named and skipped, not silently used.
- **The workspace has zero valid analysis artifacts**: the importer reports this clearly and exits
  without writing an empty diagram, matching how the previous "aggregate only" mode behaved.
- **A context bundle is requested for a repository whose path is unavailable**: reported per
  repository; other repositories still get bundles.
- **The bundled runner cannot reach its local endpoint**: it fails fast with a clear message before
  processing any repository, and writes no partial artifacts.
- **A producer emits extra, unknown fields in an analysis artifact**: accepted; unknown fields are
  ignored (the schema is not strict-rejecting), matching current behaviour.
- **Incremental re-run**: a repository with an unchanged, still-valid analysis artifact is not
  re-processed; `--force-refresh` and repository filtering continue to work for the artifacts that
  remain in scope.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The importer core MUST complete a full run (review artifact + diagram) using only
  pre-existing per-repository analysis artifacts, with no model call and no network request under any
  configuration.
- **FR-002**: The importer core MUST NOT depend on any third-party agent/coding-assistant framework
  at build time or run time.
- **FR-003**: When a repository's analysis artifact is missing or fails schema validation, the
  importer MUST name that repository and the reason, skip it, and continue with the rest.
- **FR-004**: The importer MUST provide a way to emit, per repository, a **context bundle** — the
  same bounded, deterministically-gathered material the analysis step has always used (project
  documentation, dependency manifests, a bounded directory listing, a bounded set of
  relevance-ranked source excerpts, and deterministically-detected interface hints).
- **FR-005**: The context bundle MUST NOT contain the content of any file excluded by the existing
  secret-path / bounded-walk rules; those rules are unchanged.
- **FR-006**: The context-bundle format and the analysis-artifact schema MUST be documented as a
  stable contract sufficient for an independent producer to target without reading the bundled
  tools' source.
- **FR-007**: The repository MUST include a reference **local-model analysis producer** that reads
  context bundles (or gathers context itself), obtains one analysis artifact per repository from a
  user-configured local model endpoint, and writes schema-valid artifacts.
- **FR-008**: The reference local-model producer MUST contact only the user-configured local
  endpoint — no hosted/cloud service under any configuration.
- **FR-009**: The reference local-model producer MUST preserve the existing output-quality
  safeguards: one retry on invalid output, partial-result salvage, and the framework/served-interface
  sanitisation the previous implementation applied.
- **FR-010**: The reference local-model producer MUST report per-repository failures and continue
  processing the remaining repositories; a single failure MUST NOT abort the batch.
- **FR-011**: The repository MUST include a **Claude Code skill** that, given a repository path or a
  context bundle, produces a schema-valid analysis artifact, with its own short usage walkthrough.
- **FR-012**: The Claude Code skill MUST be clearly documented as an opt-in hosted-API path, distinct
  from the local-only reference producer.
- **FR-013**: The optional model-assisted cross-repository fallback (resolving repository pairs that
  the deterministic correlation could not link) MUST move out of the importer core; it MAY be offered
  by the reference local-model producer as an optional post-step. The importer core MUST run and
  produce output without it.
- **FR-014**: Cross-repository correlation, review assembly, and diagram export logic — including the
  gRPC pass added previously — MUST be unchanged. Given a fixed set of analysis artifacts, correlation
  output MUST remain identical run-to-run.
- **FR-015**: The analysis-artifact schema, the review-artifact schema, and the diagram schema MUST
  be unchanged; the downstream diagram tool MUST require no change.
- **FR-016**: Existing incremental-run behaviour for the artifacts that remain in scope
  (force-refresh, repository filtering, "use cached artifact when still valid") MUST be preserved.
- **FR-017**: The importer's command-line surface MUST drop the "analyze only" mode and the
  model-endpoint reachability gate; the "produce diagram from existing artifacts" behaviour becomes
  the default and only mode of the main command.
- **FR-018**: Removal of the agent-framework packages and the now-unused analysis code MUST happen
  only after the deterministic core and at least the reference local-model producer are implemented
  and proven, and MUST be confirmed with the maintainer before deletion.
- **FR-019**: Every changed or newly added project MUST keep the test suite green and MUST meet the
  repository's ≥ 80% line/statement coverage gate.
- **FR-020**: The evaluation harness MUST be updated to obtain analysis artifacts from the reference
  local-model producer, and its recorded baseline MUST be regenerated; connection metrics MUST stay
  within the harness's established tolerance of the previous baseline.

### Key Entities _(include if feature involves data)_

- **Context bundle (per repository)**: the deterministic, secret-safe input an analysis producer
  consumes. Contains project documentation excerpts, dependency manifest data (including a
  runtime/dev split), a bounded directory listing, a bounded set of relevance-ranked source
  excerpts, and deterministically-detected route/topic/interface hints. Emitted by the importer;
  never contains excluded-file content.
- **Analysis artifact (per repository)**: the existing per-repository record of a repository's
  identity and external interfaces (description, languages, frameworks, served interfaces, outbound
  intents). Schema unchanged. Produced by any producer; consumed by the importer.
- **Analysis producer**: anything that turns a repository (or its context bundle) into an analysis
  artifact — the bundled local-model runner, the bundled Claude Code skill, or a third-party
  script/agent/person. Not part of the importer core.
- **Importer core**: the deterministic pipeline — context-bundle emission, analysis-artifact intake,
  cross-repository correlation, review assembly, diagram export. Makes no model or network call.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A full importer run over the sample workspace completes using only committed sample
  analysis artifacts, with **zero** outbound network connections and **no** model-endpoint
  configuration required.
- **SC-002**: The importer package's resolved dependency tree contains **zero** entries from the
  previously bundled agent framework.
- **SC-003**: On the reference workspace, the end-to-end connection precision and recall produced via
  the bundled local-model producer are within the evaluation harness's tolerance (0.05) of the
  previous implementation's recorded baseline — no regression.
- **SC-004**: An independent producer, working only from the published contract documentation, can
  hand-produce an analysis artifact the importer accepts, and the importer draws the expected
  connection for that repository — verified by a test that uses no bundled-producer code.
- **SC-005**: 100% of context bundles emitted for the sample workspace are free of any
  excluded/secret file content.
- **SC-006**: Given fixed analysis artifacts, two importer runs yield byte-identical review artifacts
  apart from the generation timestamp.
- **SC-007**: Every changed/added project meets the ≥ 80% coverage gate and the full test suite is
  green.

## Assumptions

- The existing separation of "analyze" from "aggregate/correlate" in the current tool means the
  deterministic downstream already works from persisted per-repository artifacts; this feature makes
  that the only path in the core.
- The existing context-gathering logic already produces exactly the material a producer needs;
  emitting it as a bundle is serialisation, not new analysis.
- The analysis-artifact schema is already permissive about unknown fields, so third-party producers
  that add extra keys are accepted without change.
- The reference local-model producer targets an OpenAI-style local endpoint (the shape the current
  configuration already assumes); other local servers that speak the same shape work unchanged.
- A single model-assisted cross-repository fallback call exists today; relocating it to the reference
  producer is acceptable because the deterministic passes already carry the bulk of correlation and
  the fallback is optional and off by default in evaluation.
- "Modulo timestamps" is an acceptable definition of "equivalent output" for the review artifact and
  diagram, consistent with how those files already embed a generation time.
- New workspace packages and a repository-local Claude Code skill directory are acceptable additions
  to the monorepo structure.

## Dependencies

- Builds on the 008 bounded-analysis artifact and the 009 correlation subsystem (including the gRPC
  pass); both remain as-is.
- Requires the existing sample repositories and pre-canned analysis artifacts for the model-free
  proof, and a local model endpoint for the bundled-runner proof.
- Requires the existing evaluation harness and its pinned reference workspace for the regression
  proof.
- No new third-party runtime dependency for the importer core; the reference local-model producer
  adds only a minimal transport for its local endpoint calls.

## Out of Scope

- Changing the analysis-artifact, review-artifact, or diagram schemas.
- Changing any cross-repository correlation, review-assembly, or export logic.
- Changing the context-gathering rules (bounded walk, secret-path exclusions, ranking).
- Relaxing the local-only constraint for the reference producer, or shipping a hosted-API producer
  other than the documented Claude Code skill.
- Making the Studio import wizard aware of producers — it continues to consume the review artifact.
- A plugin/registry system for producers; the contract is documentation plus schema validation.
- Supporting editors/agents that expose no scriptable way to emit a structured artifact (they can
  still be used by a person following the template).

## Constraints

- Test-driven development is mandatory (repository constitution, non-negotiable); ≥ 80%
  line/statement coverage for every changed/added project.
- The shipped importer core makes no model call and no network call under any configuration.
- The reference local-model producer is local-only; the Claude Code skill is the documented
  hosted-API opt-in.
- Deterministic correlation stays byte-deterministic given fixed analysis artifacts.
- This is a new specification (010); the 007 and 008 specifications remain the historical record of
  the agent-driven approach.
