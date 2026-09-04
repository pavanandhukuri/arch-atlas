# Feature Specification: endpointPass — a bare data string is not a call

**Feature Branch**: `012-endpointpass-wildcard-fp`
**Created**: 2026-09-05
**Status**: Draft
**Input**: User description: "Tighten endpointPass so a bare data string that path-matches a low-specificity served route (single concrete segment plus wildcards) with no HTTP method hint is not treated as a cross-repo call."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Importing a workspace where one service embeds route-shaped data strings (Priority: P1)

Someone runs the architecture importer over a multi-repository workspace. One repository
serves a route with a dynamic segment (for example `GET /product/{id}`). A different,
unrelated repository happens to contain plain string literals that are path-shaped and
share the route's static prefix — not because it calls that route, but because the strings
are ordinary data (a redirect URL embedded in ad content, a sample id in a fixture, a log
message). The reviewer opens the generated review artifact / architecture diagram to
confirm the connections.

**Why this priority**: This is the exact residual false positive left on the reference
workspace (Online Boutique) after the prior precision fix (011): `adservice` embeds several
ad-content redirect strings shaped like `/product/<id>`, and `frontend`'s served route
`GET /product/{id}` matches every one of them, producing a spurious `adservice → frontend`
"calls" edge. It is the single remaining false positive standing between the current
precision ceiling and a clean reading of the workspace.

**Independent Test**: Run correlation over a fixture where repo A serves a route with a
dynamic segment and only one static prefix segment, and repo B contains a plain string
literal (no nearby HTTP-call syntax) that shares that prefix but is otherwise unrelated to
calling repo A; assert no cross-repo edge is produced between them. Confirm a genuine call
to that same kind of route — one carrying an HTTP-method hint, or matching a route with
more than one concrete segment — still produces its edge exactly as before.

**Acceptance Scenarios**:

1. **Given** repo A serves a route whose path has exactly one static (non-parameterized)
   segment and one or more dynamic segments, and repo B contains a route-shaped string
   literal that matches only on that one static segment with no HTTP-method syntax anywhere
   near it, **When** correlation runs, **Then** no cross-repo `calls` edge is created between
   B and A from that literal.
2. **Given** the same repo A and a route-shaped literal in repo B that does carry an
   HTTP-method hint (an exact method match, or a method that does not contradict the
   route's), **When** correlation runs, **Then** the existing match-and-weight behavior is
   unchanged — the edge is still produced.
3. **Given** repo A serves a route with two or more static segments (e.g.
   `GET /api/v1/{id}`), **When** correlation runs against any matching literal, **Then**
   behavior is unchanged regardless of whether the literal carries a method hint.
4. **Given** the existing gateway-prefixed-variant match and the literal-vs-literal fallback
   match, **When** correlation runs, **Then** both continue to behave exactly as before —
   this change touches only the endpoint-node matching described in Scenario 1.

---

### Edge Cases

- **A route with zero static segments** (fully wildcard, e.g. a catch-all): still covered —
  "at most one static segment" includes zero.
- **A literal that matches a low-specificity route on its single static segment AND carries
  a contradicting method** (e.g. literal is `POST`, route only serves `GET`): already
  excluded before this change reaches the new check, by the existing method-contradiction
  rule — unaffected, still no edge.
- **A literal that matches a low-specificity route and carries a compatible-but-unconfirmed
  method** (method hint present, not equal to the route's declared method, but not
  contradictory either — e.g. the route declares no method): still produces the edge; the
  new rule only fires when the literal has **no** method signal at all, not when it has an
  imprecise one.
- **The same literal also matches a second, higher-specificity route in the same or another
  repo**: the higher-specificity match is unaffected and still produces its edge; only the
  low-specificity, no-method-hint match is suppressed.
- **A repository with no served routes at all**: nothing to match against; no change in
  behavior (there was never an edge to produce).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The correlation stage MUST NOT emit a cross-repo `calls` connection from a
  route-shaped string literal in one repository to a route served by another repository when
  **both** of the following hold: (a) the served route's path, once its dynamic segments are
  normalized, has at most one static (non-parameterized) segment, and (b) the literal carries
  no HTTP-method signal of any kind (no adjacent method-call syntax, no method-hint in
  surrounding code).
- **FR-002**: When the served route's path has two or more static segments, matching
  behavior and edge weight MUST be unchanged regardless of whether the literal carries a
  method signal.
- **FR-003**: When the literal carries any HTTP-method signal (whether or not it exactly
  matches the served route's declared method, and provided it does not contradict it),
  matching behavior and edge weight MUST be unchanged, including for low-static-segment
  routes.
- **FR-004**: The gateway-prefixed-variant match and the literal-vs-literal fallback match
  MUST be unaffected by this change; only the direct endpoint-node match is in scope.
- **FR-005**: All other correlation passes — package-manifest, client-stub / gRPC matching,
  interface-definition (schema) matching, container-compose wiring, shared message topics,
  and the name-mention pass — MUST produce byte-identical output to before this change on
  every existing fixture and on the reference workspace.
- **FR-006**: The correlation stage MUST remain fully deterministic: the same set of
  per-repository inputs MUST produce a byte-identical set of connections, ordering included.
- **FR-007**: The change MUST NOT alter the persisted per-repository analysis artifact
  schema, the review-artifact schema, or the final architecture-export schema, and MUST
  introduce no new externally-visible field. Any new logic needed is a pure, internal
  path-shape check over data already carried on the served route and the literal.
- **FR-008**: The importer's public entry points and CLI surface MUST be unchanged; this is
  an internal correlation-quality fix with no user-facing configuration.

### Key Entities _(include if feature involves data)_

- **Served route**: A route path a repository declares it serves (e.g. `GET /product/{id}`),
  already normalized elsewhere in the correlation stage so parameterized segments (`{id}`,
  `:id`, etc.) are represented uniformly as dynamic. This feature classifies such a path by
  how many of its segments are static versus dynamic.
- **Route-shaped literal**: A string literal found in a repository's source that looks like a
  URL path, already carried with an optional HTTP-method hint (present when adjacent code
  syntax suggests an HTTP call, absent otherwise) and an optional template flag. This feature
  adds no new fields to it — it only changes whether the correlation stage accepts a match
  against a low-specificity served route when the method hint is absent.
- **Cross-repo connection**: A directed edge (`calls`, `depends_on`, …) between two
  repositories with an evidence string and a confidence weight, consumed downstream by the
  review artifact and the architecture export. This feature only removes spurious instances
  of these; it does not change their shape.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the reference multi-repository workspace (Online Boutique), workspace-wide
  connection **precision** reaches 1.0 (14 correct edges out of 14 predictions), up from
  ~0.93, while connection **recall** stays at 1.0, measured by the existing evaluation
  harness across 3 live runs.
- **SC-002**: On the reference workspace, the false-positive edge from a route-shaped data
  string in one repository incidentally matching another repository's low-specificity served
  route drops to **0** occurrences per run (from 1).
- **SC-003**: The correct cross-repo edges found by every other pass on the reference
  workspace and the in-repo fixture workspace are unchanged in count and identity.
- **SC-004**: On the in-repo fixture workspace, all connection metrics stay within the
  already-established tolerance of their recorded baseline (no regression).
- **SC-005**: Re-running correlation over identical inputs produces a byte-identical set of
  connections on every run (determinism preserved).
- **SC-006**: A reviewer importing a workspace where a service embeds route-shaped strings as
  plain data (redirect URLs, sample identifiers, log messages) sees no cross-repo call edge
  manufactured from that data alone.

## Assumptions

- The reference workspace's live-eval baseline (as regenerated by feature 011) remains the
  benchmark; it will be regenerated again as part of this change.
- "At most one static segment" is the right threshold for "low-specificity route" — it
  captures exactly the failure mode observed (a single static word plus one or more
  dynamic segments, e.g. `/product/{id}`) without touching routes that carry more
  identifying structure (e.g. `/api/v1/{id}`), which already carry enough concrete signal
  to be trustworthy even without a method hint. The threshold is revisitable if a future
  workspace shows otherwise, and will be recorded as a named constant with rationale.
- Whether a literal carries an HTTP-method signal is already determined by existing logic in
  the correlation stage; this feature only changes how that signal is used at the matching
  decision, not how it is derived.
- No consumer of the review artifact or the architecture export depends on the false-positive
  edge being present.

## Out of Scope

- Any change to the package-manifest pass, the client-stub / gRPC pass, the
  interface-definition (schema) pass, the container-compose pass, the topic pass, or the
  name-mention pass.
- Any change to how route-shaped literals are discovered or how their HTTP-method signal is
  derived — this feature only changes whether an already-derived "no method signal" literal
  can match an already-derived "low-specificity" route.
- General call-site / dataflow detection (tracing whether a literal genuinely flows into an
  HTTP client call) — the correlation stage remains literal-matching only, by design.
- Persisted-artifact schema changes, CLI changes, and Studio import-wizard changes.
