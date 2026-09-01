# Feature Specification: gRPC-Aware Cross-Repository Correlation

**Feature Branch**: `009-grpc-cross-repo-correlation`
**Created**: 2026-08-30
**Status**: Draft
**Input**: User description: "gRPC-aware cross-repository correlation — add a deterministic, evidence-grounded correlation pass that matches gRPC client stub construction sites in one repository against the gRPC services another repository serves, producing directed cross-repository `calls` connections."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - gRPC calls appear in the architecture diagram (Priority: P1)

A platform engineer runs the importer over a multi-repository workspace whose services talk to each other exclusively over gRPC (a common pattern for polyglot microservice systems). After the run, the generated architecture diagram shows a directed connection from each calling service to each service it invokes, with evidence explaining why the connection was drawn.

**Why this priority**: This is the entire point of the feature. Today a workspace where all inter-service communication is gRPC produces an architecture diagram with the containers present but **no connections between them** — the diagram is effectively useless for understanding how the system fits together. Restoring those connections is the whole value.

**Independent Test**: Run the importer against a workspace containing at least one gRPC client/server pair (a `.proto` service definition served by repo A, a generated client stub constructed in repo B's source). Confirm the review artifact and exported diagram contain a directed connection B → A labelled as a call, and that no connection is drawn in the reverse direction from that evidence alone.

**Acceptance Scenarios**:

1. **Given** repo A serves a gRPC service `ProductCatalogService` and repo B's source constructs a `ProductCatalogService` client stub, **When** correlation runs, **Then** a directed `calls` connection B → A is produced with human-readable evidence naming the file, line, and matched service.
2. **Given** the workspace from the published Online Boutique reference system (10 services, 14 documented inter-service gRPC calls), **When** the importer runs end to end, **Then** every documented gRPC connection is present in the output, and every connection this feature's pass produces is correct (a documented edge).
3. **Given** repo B constructs a client stub for a service that no repository in the workspace serves, **When** correlation runs, **Then** no cross-repository connection is produced from that reference (it does not invent a target).
4. **Given** two repositories both serve a gRPC service with the same simple name, **When** repo C constructs a client stub for that name, **Then** the resulting connections are marked lower-confidence to reflect the ambiguity, mirroring how the existing HTTP-endpoint matching handles the same situation.

---

### User Story 2 - Existing HTTP, topic, and dependency correlations are unaffected (Priority: P1)

An existing user who imports a workspace that uses HTTP APIs and message topics (no gRPC) sees exactly the same connections, confidence levels, and evidence as before this feature shipped.

**Why this priority**: The correlation subsystem is trusted and already validated against real workspaces. A new pass must be purely additive — it must not change, reorder, or suppress any connection the existing passes produce, and must not slow a gRPC-free run in a user-visible way.

**Independent Test**: Run the existing correlation regression suite and the existing evaluation set that contains no gRPC. All prior connection counts, directions, confidence buckets, and evidence strings are unchanged within the established tolerance.

**Acceptance Scenarios**:

1. **Given** a workspace with no gRPC client stubs and no `.proto` service definitions, **When** correlation runs, **Then** the set of connections is byte-for-byte identical to the pre-feature output.
2. **Given** the same fixed set of analysis inputs, **When** correlation runs twice, **Then** the ordered list of connections is identical between runs (the new pass is deterministic).

---

### User Story 3 - gRPC connections carry a recognisable transport label (Priority: P3)

A user viewing the imported diagram can tell at a glance which connections are gRPC calls versus HTTP calls, because gRPC connections are labelled with the "gRPC" transport.

**Why this priority**: Useful polish that improves diagram readability, but the connection itself (with its evidence) already delivers the core value. This is included only if it requires no change to the persisted artifact formats.

**Independent Test**: Import a workspace with a gRPC call and inspect the exported diagram; the gRPC connection shows a "gRPC" technology/transport label while an HTTP connection in the same diagram does not.

**Acceptance Scenarios**:

1. **Given** a connection produced by gRPC evidence, **When** the diagram is exported, **Then** that connection's transport label reads "gRPC".
2. **Given** the label cannot be attached without changing a persisted schema consumed by downstream tooling, **When** the feature ships, **Then** the label is omitted and connections still carry their evidence (this story is dropped rather than forcing a breaking change).

---

### Edge Cases

- **Vendored / generated client code**: A repository may contain generated gRPC stubs for services it does not actually call (leftover code, shared generated packages). Matching is restricted to construction/instantiation sites (a stub being _created_), not mere type references, to reduce this noise.
- **Service defined and consumed in the same repository**: An in-process stub construction where the same repository also serves that service MUST NOT produce a self-connection.
- **Package-qualified vs bare service names**: One side may write `hipstershop.ProductCatalogService` and the other `ProductCatalogService`. Matching compares the simple name (final dot-separated segment), case-insensitively, tolerating the presence or absence of a trailing "Service" word.
- **Multiple client constructions for the same target**: Repo B may construct the same service's client in several files. The output is a single connection B → A; the evidence names a representative site and notes the count.
- **A repository whose source is not on disk at correlation time**: gRPC client references cannot be gathered for it; the pass contributes nothing for that repository and does not error (same degradation as the other source-reading passes).
- **`.proto` file present but no generated code / no analysis-reported service**: The service-definition identifiers already collected from the `.proto` still make the repo a valid callee target.
- **Non-demo languages** (Ruby, Rust, Swift, PHP, Kotlin beyond the listed forms): Best-effort only via the generic stub/client token fallback; a miss here is acceptable and not a regression.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST identify, per repository, the set of gRPC services that repository _serves_, drawn from both the per-repository analysis result and any gRPC service definitions discovered in the repository's interface-definition files.
- **FR-002**: The system MUST identify, per repository, the set of gRPC _client references_ in that repository's source — sites where a generated client/stub for a named gRPC service is constructed or instantiated.
- **FR-003**: Client-reference detection MUST cover the idiomatic client/stub construction forms for Go, C#, JavaScript/Node, Python, and Java, plus a generic fallback that recognises a `<Name>ServiceClient` / `<Name>ServiceStub` / `<Name>ServiceBlockingStub` token.
- **FR-004**: Client-reference detection MUST operate on literal source text only (pattern matching), with no data-flow analysis and no new heavyweight parsing dependency.
- **FR-005**: The system MUST produce a directed cross-repository connection of type "calls" from a repository containing a client reference to the repository serving the matching gRPC service.
- **FR-006**: Service-name matching MUST compare simple names (final dot-separated segment) case-insensitively and MUST treat names that differ only by a trailing "Service" word as equal.
- **FR-007**: The system MUST NOT produce a connection when no repository in the workspace serves the referenced service.
- **FR-008**: The system MUST NOT produce a self-connection when the serving repository and the referencing repository are the same.
- **FR-009**: When more than one repository serves a service matching the same client reference, the resulting connections MUST be assigned a reduced confidence, consistent with how the existing HTTP-endpoint matching demotes multi-target ambiguity.
- **FR-010**: Every connection produced by this feature MUST carry at least one human-readable evidence statement identifying the referencing file, the line, and the matched service name.
- **FR-011**: A single client-reference match (stub construction naming a specific served service) MUST be treated as a high-confidence signal, comparable to an exact HTTP method+path endpoint match.
- **FR-012**: The new correlation step MUST be deterministic: identical inputs produce an identical ordered set of connections across repeated runs, and it MUST NOT call a language model.
- **FR-013**: The new correlation step MUST be purely additive — it MUST NOT alter, reorder, drop, or re-weight any connection produced by the existing manifest, HTTP-endpoint, schema, compose, or topic correlation steps.
- **FR-014**: Duplicate connections for the same (source, target, type) — whether from repeated client references or overlap with another correlation step — MUST be merged into one connection, following the existing de-duplication behaviour.
- **FR-015**: The importer's per-step progress reporting MUST include a line for the new gRPC correlation step, consistent with the reporting for the existing steps.
- **FR-016**: If a gRPC connection can be labelled with a "gRPC" transport without changing any persisted artifact schema consumed by downstream tooling, the system SHOULD apply that label; otherwise the label MUST be omitted with no other behavioural change.
- **FR-017**: The feature MUST NOT introduce any language-model call, network access, or non-local dependency into the correlation path.

### Key Entities _(include if feature involves data)_

- **Served gRPC service (per repository)**: The name of a gRPC service a repository exposes. Sourced from the per-repository analysis output and from service declarations in interface-definition files. Attributes: service name (possibly package-qualified), owning repository.
- **gRPC client reference (per repository)**: A site in a repository's source where a client/stub for a named gRPC service is constructed. Attributes: referenced service name, source file path (repo-relative), line number, the language form that matched.
- **Cross-repository gRPC connection**: A directed relationship "repository B calls repository A" derived from a client reference in B matching a served service in A. Attributes: source repository, target repository, connection type ("calls"), confidence weight, evidence statement(s), optional transport label.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the Online Boutique reference workspace (all inter-service communication is gRPC), the share of documented inter-service connections that appear in the importer output rises from 0% to 100%.
- **SC-002**: On that same workspace, 100% of the connections **this feature's pass** produces are correct (present in the documented service graph). Workspace-wide connection precision also rises (from 0), but its ceiling on this workspace is set by pre-existing behaviour outside this feature's scope — the schema-similarity pass emits `depends_on` edges between services that merely vendor a copy of the same shared `.proto`. Removing those is a separate follow-up (see research.md D14); this feature must not modify that pass (FR-013).
- **SC-003**: On an evaluation workspace with no gRPC (HTTP APIs and message topics only), every previously reported correlation metric stays within the established regression tolerance — no measurable degradation.
- **SC-004**: Running correlation twice over the same inputs yields an identical ordered list of connections (100% reproducible).
- **SC-005**: 100% of connections produced by the new step include at least one evidence statement that names a concrete source location.
- **SC-006**: A reviewer can determine, from the evidence attached to each new connection alone, which source file caused it — verified by inspection of the reference-workspace output.

## Assumptions

- The per-repository analysis step already extracts served gRPC service names with useful recall; this feature consumes that output and augments it with interface-definition-file evidence, but does not modify the analysis step.
- Interface-definition files (`.proto`) and their service declarations are already gathered by the existing evidence-collection walk; this feature reads identifiers that collection already produces.
- The five languages in the reference corpus (Go, C#, JavaScript/Node, Python, Java) cover the cases that must work reliably; other languages are best-effort via the generic fallback.
- Restricting detection to stub _construction_ sites (rather than any mention of a generated type) is an acceptable precision/recall trade-off and matches how the existing HTTP pass keys on call-shaped sites.
- The existing multi-target ambiguity-demotion and connection de-duplication behaviours are the right precedents to reuse; no new confidence model is introduced.
- Downstream diagram tooling ignores unknown optional fields on connections (consistent with how it already tolerates additive fields elsewhere), so a transport label — if added — is non-breaking.

## Dependencies

- Builds directly on the 008 bounded per-repository analysis output (served gRPC service names) and the existing evidence-grounded correlation subsystem and its evaluation harness.
- Requires the Online Boutique reference workspace (already pinned and used by the evaluation harness) for the end-to-end proof.
- No new third-party runtime dependencies.

## Out of Scope

- Modifying the per-repository analysis step or its persisted schema.
- Changing any existing correlation step's logic, weights, or evidence.
- Data-flow / call-graph analysis to attribute a gRPC call to a specific endpoint method (service-level attribution only).
- Matching individual RPC methods; only service-to-service links are produced.
- Streaming vs unary, deadlines, interceptors, retry/config details — not modelled.
- gRPC-Web / gRPC-Gateway HTTP transcoding detection (the existing HTTP pass already covers HTTP-shaped calls).
- Language coverage beyond the listed five except via the generic token fallback.
- Any change to the agentic fallback correlator or the confidence-to-bucket mapping.
