# Feature Specification: schemaPass — shared multi-service contract is not a dependency

**Feature Branch**: `011-schemapass-shared-contract`
**Created**: 2026-09-01
**Status**: Draft
**Input**: User description: "Stop `schemaPass` from emitting cross-repo `depends_on` edges purely because two repositories vendor a copy of the same shared, multi-service contract."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Importing a workspace where every service vendors a shared contract (Priority: P1)

Someone runs the architecture importer over a multi-repository workspace in which many
services each keep a local copy of one large shared interface-definition file (for
example, a single `.proto` that declares every service's RPCs, copied verbatim into
each repo's build tree). They open the generated review artifact / architecture diagram
to confirm the connections.

**Why this priority**: This is the exact failure the reference workspace (Online Boutique)
exhibits today. Six of seven false-positive cross-repo edges per run come from this one
cause; they cap connection precision at ~0.67 and force the reviewer to manually reject a
quadratically-growing set of bogus "A depends on B" edges. Fixing it is the single largest
precision gain available in the correlation stage.

**Independent Test**: Run correlation over a fixture workspace of 3+ repos that each vendor
an identical copy of a multi-service contract and assert that no cross-repo dependency
edge is produced between them; confirm the true edges (found by other passes) are
untouched.

**Acceptance Scenarios**:

1. **Given** three repositories that each contain a byte-identical copy of a contract file
   declaring two or more services, **When** correlation runs, **Then** no `depends_on`
   (or any other) cross-repo edge is created solely because those copies are identical.
2. **Given** the same three repositories, **When** correlation runs, **Then** any
   connections those repos genuinely have (client-stub construction, served-route calls,
   compose wiring, shared topics) are still reported exactly as before.
3. **Given** a workspace where a shared contract file is vendored by exactly two repos and
   there is no other evidence of a relationship between them, **When** correlation runs,
   **Then** no cross-repo edge is created between the two.

---

### User Story 2 - Importing a workspace where one repo owns a contract another repo copies (Priority: P1)

Someone runs the importer over a workspace where repository B publishes a small,
single-purpose interface-definition file for the one service it serves, and repository A
vendors an identical copy of that file so it can call B.

**Why this priority**: This is the legitimate signal the current identical-copy rule was
built for. The fix must not throw it away — "A carries B's contract" is real evidence that
A talks to B, and losing it would reduce recall on workspaces that don't use a shared
aggregate contract.

**Independent Test**: Run correlation over a two-repo fixture where B serves a single
service defined in one contract file and A vendors a byte-identical copy; assert a
directed cross-repo edge from A to B is produced.

**Acceptance Scenarios**:

1. **Given** repo B serves exactly one service and defines it in one contract file, and
   repo A contains a byte-identical copy of that file, **When** correlation runs, **Then**
   a directed cross-repo edge from A to B is reported.
2. **Given** the identical file declares a single service and only one repo in the
   workspace serves a service by that name, **When** correlation runs, **Then** that repo
   is treated as the owner and the edge points toward it, regardless of how many other
   repos carry the copy.

---

### User Story 3 - Importing a workspace with proto-package-name drift (Priority: P2)

Someone runs the importer over a workspace where two repos declare interface files under
the same package/namespace name and share at least one message/type name, but the file
contents differ (independent partial copies of a common namespace).

**Why this priority**: This is the second contributor to the reference workspace's
false positives (three edges per run at low confidence). It is documented as pure noise on
that workspace. It matters less than User Story 1 because the edges are already
low-weight, but removing them still improves precision and reviewer trust.

**Independent Test**: Run correlation over a fixture where 3+ repos declare files sharing
one package name and a common message name with differing content; assert no cross-repo
edge is produced from that shared-namespace signal.

**Acceptance Scenarios**:

1. **Given** three or more repositories that declare interface files sharing a package
   name and a message name, with differing file contents, **When** correlation runs,
   **Then** no cross-repo edge is produced from the shared-package-name signal.
2. **Given** exactly two repositories share a package name and a message name with
   differing content and no other evidence links them, **When** correlation runs, **Then**
   no cross-repo edge is produced from that signal.

---

### Edge Cases

- **Two repos, identical single-service contract, neither serves that service**: no repo
  can be identified as the owner → no edge (there is nothing to depend on).
- **Identical multi-service contract, but exactly one of the repos also serves every one
  of those services**: that repo is the plausible owner → a directed edge from each other
  copy-holder toward the owner is still allowed. (Rare; the aggregate-contract case has no
  such owner.)
- **Identical contract file that declares zero services** (pure message/type library):
  treated as a shared library, not a dependency between consumers → no edge.
- **A repo vendors the shared contract but is also the only HTTP/gRPC gateway** — the fix
  does not special-case gateways; the edge is only drawn if the ownership rule
  independently identifies an owner.
- **OpenAPI client-coverage signal**: unaffected. A repo whose code references a
  meaningful share of the paths declared in another repo's OpenAPI document still yields a
  directed `calls` edge toward the document's repo.
- **The same identical file appears twice inside one repo**: intra-repo duplication never
  produced a cross-repo edge and still does not.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The correlation stage MUST NOT emit a cross-repo connection between two
  repositories whose only linking evidence is that both contain a copy — identical or
  namespace-overlapping — of the same interface-definition file that describes **more than
  one service**.
- **FR-002**: When an identical interface-definition file describes **exactly one
  service**, the correlation stage MUST attempt to identify a single owning repository for
  that service, using the repositories' declared served interfaces and their own
  service declarations. If exactly one owner is identified, a directed cross-repo edge
  from every other copy-holder toward the owner MUST still be produced.
- **FR-003**: When an identical single-service interface-definition file has **no
  identifiable owner** among the repositories that hold it, the correlation stage MUST NOT
  emit a cross-repo edge from that evidence.
- **FR-004**: The shared-package-name / shared-message signal MUST be suppressed whenever
  the shared package name is common to **more than two** repositories in the workspace
  (i.e. it is a workspace-wide namespace, not a bilateral contract). If this signal cannot
  be made reliably precise for the remaining two-repo case, it MAY be removed entirely.
- **FR-005**: The OpenAPI client-coverage signal (a repository's code referencing paths
  declared in another repository's OpenAPI document) MUST be preserved with its current
  behaviour and edge weights.
- **FR-006**: All other correlation passes — client-stub / gRPC matching, served-route
  calls, package-manifest links, container-compose wiring, shared message topics, and the
  name-mention pass — MUST produce byte-identical output to before this change on every
  existing fixture and on the reference workspace.
- **FR-007**: The correlation stage MUST remain fully deterministic: the same set of
  per-repository inputs MUST produce a byte-identical set of connections, ordering
  included.
- **FR-008**: The change MUST NOT alter the persisted per-repository analysis artifact
  schema, the review-artifact schema, or the final architecture-export schema. Any new
  information the pass needs about a contract file (such as how many services it declares)
  MUST be derived from data the file-walker already records, or added only as an
  **additive** internal field with no change to any persisted format.
- **FR-009**: When the pass suppresses what would previously have been an edge, it MAY
  record a human-readable note (of the kind the passes already attach for demoted or
  ambiguous matches) explaining that a shared multi-service contract was seen and
  deliberately not treated as a dependency. Such a note MUST NOT appear as a connection in
  the review artifact or the exported architecture.
- **FR-010**: The importer's public entry points and CLI surface MUST be unchanged; this
  is an internal correlation-quality fix with no user-facing configuration.

### Key Entities _(include if feature involves data)_

- **Interface-definition file**: A schema/contract file discovered in a repository
  (`.proto`, OpenAPI document, GraphQL SDL). Already summarised by the file-walker with a
  content hash, a list of structural identifiers (package name, message names, service
  names), and — for OpenAPI — the set of declared paths.
- **Declared service**: A named service/RPC-group inside an interface-definition file, and
  separately, the set of services a repository reports that it _serves_. The overlap
  between "services named in a vendored contract" and "services a repo serves" is the
  ownership signal.
- **Cross-repo connection**: A directed edge (`depends_on`, `calls`, …) between two
  repositories with an evidence string and a confidence weight, consumed downstream by the
  review artifact and the architecture export. This feature only removes spurious
  instances of these; it does not change their shape.
- **Shared aggregate contract**: An interface-definition file that declares multiple
  services and is vendored (identically or near-identically) by three or more
  repositories. The defining anti-pattern this feature stops mis-reading as a dependency
  web.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the reference multi-repository workspace (Online Boutique), workspace-wide
  connection **precision** rises from ~0.67 to ≥ 0.90 while connection **recall** stays at
  1.0, measured by the existing evaluation harness across 3 deterministic runs. (The
  residual gap from 1.0 is a single out-of-scope false positive from a different pass — a
  hard-coded identifier string coincidentally matching a served route.)
- **SC-002**: On the reference workspace, the count of cross-repo `depends_on` edges
  attributable to identical or namespace-overlapping copies of the shared multi-service
  contract drops to **0** (from 6 per run).
- **SC-003**: The correct cross-repo edges found by the client-stub / gRPC pass on the
  reference workspace remain at 14 of 14, unchanged.
- **SC-004**: On the in-repo fixture workspace, all connection metrics stay within the
  already-committed tolerance of their recorded baseline (no regression).
- **SC-005**: Re-running correlation over identical inputs produces a byte-identical set
  of connections on every run (determinism preserved).
- **SC-006**: A reviewer importing a workspace that uses a shared aggregate contract sees
  no dependency edges that exist only because services share that contract, eliminating a
  manual-rejection burden that currently grows with the square of the service count.

## Assumptions

- The reference workspace and its ground-truth connection set from feature 009 remain the
  benchmark; the evaluation baseline for that workspace will be regenerated as part of
  this change.
- "More than one service" is the right threshold for "aggregate contract". A file
  declaring exactly one service is still a legitimate ownership signal; the aggregate
  `demo.proto` in the reference workspace declares roughly ten.
- "Vendored by more than two repositories" is the right threshold for treating a shared
  package name as a workspace namespace rather than a bilateral contract. Both thresholds
  are revisitable if a future workspace shows otherwise, and will be recorded as named
  constants with rationale.
- A repository's set of served services is available to the correlation stage today (it is
  already consumed by the client-stub / served-route passes).
- No consumer of the review artifact or the architecture export depends on the
  false-positive edges being present.

## Out of Scope

- Any change to the client-stub / gRPC pass, the served-route pass, the manifest pass, the
  compose pass, the topic pass, or the name-mention pass.
- Any change to how interface-definition files are discovered, read, hashed, or parsed,
  beyond additive internal fields.
- The single remaining reference-workspace false positive that originates from a
  different pass (a hard-coded identifier string coincidentally matching a served route).
- Detecting genuine contract drift between two services that really do share a bilateral
  contract — this feature only stops the shared-namespace signal from firing on aggregate
  contracts; it does not add a better drift detector.
- Persisted-artifact schema changes, CLI changes, and Studio import-wizard changes.
