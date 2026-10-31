# Feature Specification: Component-Layer Drill-Down

**Feature Branch**: `014-component-layer-drilldown`
**Created**: 2026-10-03
**Status**: Draft
**Input**: User description: "Add an opt-in Component-layer drill-down to the importer, one layer below the existing Container level … Critical sequencing constraint for the plan: build the EVAL harness for this capability first, before any extraction/producer code … author at least TWO hand-written golden datasets … Non-goals: no change to the bulk `import` command's behavior or output shape; no change to the existing container-level correlation pipeline; no file/function/line-level code graph."

## Overview

Today the importer's diagram stops at the Container level: each repository becomes exactly one
element, correlated against every other repository's element by the deterministic correlator.
`core-model`'s `ElementKind` already defines `component` and `code` below `container`, and the
renderer/zoom infrastructure (006) already knows how to show nested levels — but nothing in the
pipeline ever populates them. The per-repository `RepoAnalysis` artifact (008) is deliberately
bounded to a repository's _external_ identity and interfaces, not its internals; a prior attempt at
a deep file/function/class graph (007) was retired for being slow, costly, and non-deterministic.

This feature adds one additional, strictly **opt-in** layer: after a human has already reviewed the
container-level diagram and chosen a single service they want to understand better, they can
request a bounded summary of _that one repository's_ internal structure (its major
controllers/services/repositories/modules and how they call one another) without paying that cost
for every repository in the workspace, and without reopening the deep-graph approach this project
already rejected once.

Because this introduces a wholly new kind of extraction with no existing track record, the project's
own experience with the correlator (specs 011–013) applies directly: a change to an extraction
heuristic is only safe to iterate on if there is a scored regression gate first. This feature
therefore delivers the scoring harness and two independent hand-authored golden datasets _before_
any component-extraction procedure is written, mirroring the eval-first discipline the correlator
eval (013) already established for cross-repo correlation.

## Clarifications

### Session 2026-10-03

- Q: How does a `{repo}.components.json` artifact actually reach Studio for rendering? → A: It is attached later, directly to an already-loaded/finalized diagram — click a container, attach its one `.components.json` file — fully decoupled from the import wizard, which continues to accept exactly one file (`architecture.review.yaml`).
- Q: Should `{repo}.components.json` carry the same completeness/status metadata as `RepoAnalysis` (`schemaVersion`, `analyzedAt`, `analysisStatus: 'complete'|'partial'`, `retryCount`)? → A: Yes — mirror `RepoAnalysisSchema` exactly for consistency with the existing bounded-extraction pattern.
- Q: How does component-set scoring match a predicted component to an expected one? → A: By normalized name alone (case/whitespace-insensitive), the same approach the correlator already uses for repo names — a name match counts regardless of `kind`.
- Q: Does attaching a `{repo}.components.json` to a container persist, or is it session-only? → A: Persisted — it updates the diagram's saved `.arch.json` state, so it survives reload, independent of the importer's own (unchanged) output artifacts.
- **Post-implementation revision**: the first Clarification above (Studio attach action) was superseded during implementation. The user's actual intent was stronger than "persisted" — no second file should exist as a Studio-facing concept at all. Revised mechanism: the coding agent itself runs a new `archatlas attach-components <arch-file> <components-file> --container <name>` CLI command that merges the bounded artifact directly into the human's existing `.arch.json`, in place, computing real layout positions deterministically (`@archatlas/layout`'s `computeLayout`) rather than asking the agent to hand-splice JSON and risk a component that exists in the file but never renders (no layout node = silently invisible, confirmed by inspecting the renderer — there is no validation or auto-repair that catches this today). Studio gains **no new UI** for this feature; a human only ever reopens the one `.arch.json`, now updated. User Story 3, FR-012, FR-012a, and FR-016 below are rewritten accordingly; `{repo}.components.json` itself (its schema, and the scoring/eval harness from User Story 1) is unchanged by this revision.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A contributor can score component-extraction quality before any extraction exists (Priority: P1)

A contributor building or changing the component-extraction procedure needs to know, objectively,
whether its output is any good. They run one command and get precision/recall/F1 for "did it find
the right internal components" and "did it find the right internal relationships between them",
scored against two independent, hand-authored golden repositories. This command works the day it is
merged — even against a deliberately empty or stub artifact, which simply scores at zero — so it can
gate every later change to the real procedure, exactly the way the correlation eval (013) gates
changes to `evidence-passes.ts` today.

**Why this priority**: Nothing else in this feature is trustworthy without this. It is also, on its
own, a complete and independently useful deliverable: a scoring tool and two labelled datasets that
make "is this extraction any good" an objective, repeatable question instead of a judgment call.

**Independent Test**: With no producer skill written yet, hand-place a stub `{repo}.components.json`
for one of the two golden repos and run the eval; it reports a score (not a crash) against hand
authored ground truth. Replace the stub with a second, deliberately-correct-looking artifact and see
the score change accordingly.

**Acceptance Scenarios**:

1. **Given** two committed golden datasets, each with a repository's real source tree, a
   hand-authored `components.json` artifact, and a hand-authored ground-truth file, **When** a
   contributor runs the component eval in report mode, **Then** they see, per golden dataset,
   precision/recall/F1 for the extracted component set and for the extracted internal-relationship
   set.
2. **Given** a committed baseline, **When** CI runs the component eval in check mode, **Then** the
   build fails if any metric regresses beyond a small tolerance, naming the metric and the delta —
   the same contract `apps/llm-importer/eval --check` already has for correlation.
3. **Given** no component-extraction procedure has been written yet, **When** the eval runs against
   a stub artifact, **Then** it produces a well-defined low (not crashing, not undefined) score,
   because the harness must exist and be runnable before the procedure it will grade.
4. **Given** the two golden datasets, **When** a contributor inspects them, **Then** each is a
   different repository (different language/framework, different internal shape) so the harness is
   not tuned to a single example.

---

### User Story 2 - A developer drills into one container's internal structure (Priority: P2)

A developer has already imported a workspace and is looking at the container-level diagram in
Studio. One service is unclear from the outside, so they ask their coding agent to analyze just that
one repository's internals. The agent runs a repo-scoped command and gets back a small, validated
summary of that repository's major internal components (e.g. controllers, services, a data-access
layer) and how they call one another — without the importer re-analyzing, or changing anything
about, any other repository in the workspace.

**Why this priority**: This is the actual new capability; it depends on User Story 1 existing first
so its output has somewhere to be scored and iterated against, but it is the first story a developer
actually experiences.

**Independent Test**: Run the repo-scoped command against a single real repository with no prior
`{repo}.components.json`. Confirm a new, schema-valid `{repo}.components.json` is written, that no
other repository's artifacts in the workspace change, and that re-running the bulk `import` command
produces byte-identical output to before this command ever ran.

**Acceptance Scenarios**:

1. **Given** a workspace already set up for `gather-context`/`import`, **When** a developer requests
   component-level analysis for exactly one named repository, **Then** a new `{repo}.components.json`
   sibling artifact is written for that repository only.
2. **Given** that artifact, **When** it is validated, **Then** it conforms to a new bounded schema
   (internal components with a name/kind/short description, and internal relationships between
   them) and is rejected with a clear error if it does not.
3. **Given** a repository with no component-level artifact requested, **When** the bulk `import`
   command runs, **Then** its output is exactly as it was before this feature existed.
4. **Given** a developer asks for component-level analysis on a repository not listed in the
   workspace's configuration, **When** the command runs, **Then** it fails with a clear error rather
   than silently analyzing an unknown path.

---

### User Story 3 - A developer sees a container's internals as a nested diagram (Priority: P2)

Having produced a `{repo}.components.json` for one service, a developer doesn't touch Studio at
all for this step: their coding agent runs one command that merges those components directly into
their existing `.arch.json`, in place. The developer just reopens that same diagram file — no
second file to upload, no new button to find — and that one container now shows its internal
components as nested elements inside it, using the same zoomable-diagram experience Studio already
provides for containers inside systems.

**Why this priority**: Without this, User Story 2's artifact has no visible payoff; this is what
actually makes the feature legible to the person who asked for it.

**Independent Test**: Start from an `.arch.json` with two containers. Run the merge command against
one of them; confirm that container's elements/relationships now include the new components
(correct `parentId`, correct layout positions), the other container is untouched, and reopening the
file in Studio shows the nested view without any new UI action.

**Acceptance Scenarios**:

1. **Given** an existing `.arch.json` and a validated `{repo}.components.json`, **When** the merge
   command runs against one named container, **Then** that container's internal components appear
   as nested elements in the same file, each with a real layout position, with the relationships
   between them, and the import wizard's own single-file (`review.yaml`) flow is unchanged.
2. **Given** a container with no components ever merged into it, **When** a developer views the
   diagram, **Then** nothing about that container's appearance or behavior changes from today.
3. **Given** a nested component view, **When** a developer zooms back out, **Then** the diagram
   returns to the ordinary container-level view with no data loss.
4. **Given** a `{repo}.components.json` whose repository name does not match the `--container` name
   given to the merge command, **Then** the command fails with a clear error and writes nothing —
   the original `.arch.json` is byte-for-byte unchanged.
5. **Given** a merge that succeeds, **When** the resulting `.arch.json` is inspected, **Then** every
   newly added component has an entry in the view's layout — never a component that exists in
   `elements` but has no position and would silently fail to render.

---

### User Story 4 - A maintainer improves the extraction procedure using the eval's feedback (Priority: P3)

Once the component-extraction procedure exists and has a real baseline, a maintainer who finds a
systematic mistake (e.g. it always misses the data-access layer in a certain framework) fixes the
procedure and uses the eval from User Story 1 to confirm the fix helps the golden datasets without
regressing them, then updates the baseline — the same loop specs 011 and 012 already used for the
correlator.

**Why this priority**: This is the ongoing maintenance loop the whole feature exists to enable; it
has no independent deliverable beyond what Stories 1–3 already provide, so it is the lowest priority
to call "done," even though it is the long-term point of doing this in an eval-first order.

**Independent Test**: Deliberately mis-author one golden dataset's artifact to omit a known
component, run the eval, see recall drop; correct it, run again, see recall return to the baseline.

**Acceptance Scenarios**:

1. **Given** a procedure change intended to fix a known extraction gap, **When** the maintainer runs
   the eval, **Then** they see whether the fix improved the affected golden dataset without
   regressing the other one.
2. **Given** a genuine improvement, **When** the maintainer updates the baseline, **Then** the change
   is a reviewable diff in the pull request, as it already is for the correlation baseline.

---

### Edge Cases

- **No component artifact has ever been merged for a container**: Studio shows that container
  exactly as it does today — no broken affordance, no error, no implication that analysis failed.
- **A `{repo}.components.json` fails schema validation**: the merge command rejects it with a clear,
  actionable error and writes nothing — the target `.arch.json` is left byte-for-byte unchanged.
- **A developer requests component analysis for a repository already analyzed**: the artifact is
  overwritten (same as re-running `gather-context` for a repository today), not duplicated or
  versioned; re-running the merge command against the same container adds another set of
  components rather than replacing the earlier ones (no dedup — merging twice is treated as the
  caller's choice, the same way adding an element by hand twice would be).
- **A repository is too small or too uniform to have meaningful internal structure** (e.g. a single
  Lambda handler file): a near-empty component list is valid output, not an error.
- **A golden dataset's hand-authored ground truth and its hand-authored artifact disagree in an
  inconsistent way** (e.g. a ground-truth relationship references a component not in the component
  list): the eval flags the golden dataset itself as inconsistent rather than silently mis-scoring.
- **The bulk `import` command is run on a workspace where some repositories have had components
  merged into a diagram and some have not**: behavior and output are identical to a workspace with
  none at all — this feature never changes what `import` produces, because it never touches
  `import`'s inputs or outputs at all.
- **A `{repo}.components.json` whose repository name does not match the `--container` name given to
  the merge command**: the command fails with a clear error and writes nothing.
- **The target `.arch.json` does not look like a valid diagram file** (not JSON, or missing
  `elements`/`views`): the merge command fails with a clear error rather than partially writing or
  corrupting it.
- **The named container does not exist, or more than one container shares that name**: the merge
  command fails with a clear error (naming the ambiguity in the second case) rather than guessing.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The project MUST provide a command that scores a repository's component-extraction
  output against a hand-authored golden dataset and prints precision/recall/F1 for (a) the set of
  identified internal components and (b) the set of identified internal relationships between them.
- **FR-002**: That command MUST support a check mode that compares each metric against a committed
  baseline and exits non-zero when any metric regresses beyond a defined tolerance, naming the
  metric and the delta — matching the existing correlation eval's `--check` contract.
- **FR-003**: That command MUST support a mode that rewrites the baseline from the current scores,
  landing as a reviewable diff.
- **FR-004**: The project MUST include at least two golden datasets for this eval, each built from a
  different real repository (different primary language/framework), each with its own hand-authored
  expected-components and expected-relationships ground truth.
- **FR-005**: Scoring MUST be deterministic, requiring no model call and no network access at eval
  time, and MUST run correctly against a stub or deliberately-wrong artifact without crashing.
- **FR-006**: The component-eval harness, its scoring functions, and both golden datasets MUST exist,
  be merged, and be runnable (even with no real extraction procedure yet) before any
  component-extraction procedure is authored.
- **FR-007**: The project MUST define a new bounded schema for a per-repository "internal structure"
  artifact (`{repo}.components.json`): a short list of named internal components (each with a kind
  and a short description) and a list of relationships between components in that same list, plus
  the same completeness/status metadata `RepoAnalysis` already carries — `schemaVersion`,
  `analyzedAt`, `analysisStatus: 'complete'|'partial'`, and `retryCount` — for consistency with the
  existing bounded-extraction pattern (008).
- **FR-008**: The project MUST provide a way to request component-level analysis for exactly one
  named repository already present in a workspace's configuration, independent of the bulk `import`
  command, producing one `{repo}.components.json` sibling artifact for that repository only.
- **FR-009**: Requesting component-level analysis for a repository not present in the workspace's
  configuration MUST fail with a clear, actionable error rather than proceeding.
- **FR-010**: The bulk `import` command's behavior and output MUST be completely unaffected by the
  presence, absence, or content of any `{repo}.components.json` artifact.
- **FR-011**: A `{repo}.components.json` that fails schema validation MUST be rejected with a clear
  error at the point it is read, never partially accepted.
- **FR-012**: The project MUST provide a command that merges a single `{repo}.components.json` file
  directly into one named container of an existing `.arch.json`, in place by default, independent
  of and separate from the import wizard — the import wizard's own upload step MUST continue to
  accept exactly one file (`review.yaml`) and MUST NOT be extended to accept component artifacts,
  and Studio MUST gain no new upload/attach UI for this feature. Every newly merged component MUST
  receive a real layout position in the same operation (no component may be written to `elements`
  without a corresponding entry enabling it to render) and MUST appear as a nested element using the
  existing `component` element kind; a container with nothing ever merged into it MUST render
  exactly as it renders today.
- **FR-012a**: The merge command MUST reject an artifact whose repository name does not match the
  given `--container` name, with a clear error, and MUST write nothing in that case.
- **FR-012b**: The merge command MUST reject the target `.arch.json` if it fails to parse as JSON or
  does not look like a diagram file (missing `elements`/`views`), and MUST reject an ambiguous or
  missing container name, in every case with a clear error and no partial write.
- **FR-013**: No change introduced by this feature may alter the deterministic cross-repository
  correlation pipeline or any artifact it produces today.
- **FR-014**: This feature MUST NOT introduce file/function/line-level code graph extraction; the new
  artifact remains a bounded summary of major internal components, not a deep code graph.
- **FR-015**: Component-set scoring MUST match a predicted component to an expected one by
  normalized name alone (case/whitespace-insensitive, mirroring the existing correlator's repo-name
  normalization), independent of its `kind`. Internal-relationship scoring MUST match by normalized
  source/target component names and MUST be direction-sensitive, consistent with how the existing
  correlation eval already scores connections.
- **FR-016**: Merging components into a container MUST write the result back to a single
  `.arch.json` file — no second, separately-persisted artifact — using core-model's existing
  `Element`/`Relationship`/layout shapes unchanged (no schema addition), so the merged diagram opens
  correctly in Studio with no code change there. This is independent of, and must not change, the
  importer's own output artifacts (FR-010, FR-013).

### Key Entities

- **Component-level analysis artifact** (`{repo}.components.json`): a bounded, per-repository
  summary of internal structure — a short list of named internal components (name, kind such as
  controller/service/repository/module, short description) and the relationships between them
  (source component, target component, short description), plus the same completeness/status
  metadata `RepoAnalysis` carries (`schemaVersion`, `analyzedAt`, `analysisStatus:
'complete'|'partial'`, `retryCount`). Produced only when explicitly requested for one repository;
  absent by default.
- **Golden component dataset**: a real repository's source tree paired with a hand-authored
  expected-components list and expected-relationships list, used only for scoring, independent of
  and additional to the existing correlation golden workspaces.
- **Component score**: precision, recall, and F1 for the component set and, separately, for the
  internal-relationship set, computed by comparing a produced artifact to a golden dataset's ground
  truth, matching components by normalized name alone and relationships by normalized,
  direction-sensitive source/target names.
- **Component baseline**: a committed file holding the last-accepted score for every metric of every
  component golden dataset, the reference the eval's check mode compares against.
- **Merge command**: a CLI command that takes an existing `.arch.json`, a `{repo}.components.json`,
  and a target container name, and deterministically writes the merged result back to a single
  `.arch.json` — the only entity that ever touches the human's diagram file for this feature.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A contributor can get a full component-extraction score for both golden datasets with
  one command in under 10 seconds, with no network access and no model call.
- **SC-002**: The component eval, its scoring functions, and both golden datasets are merged and
  passing in CI before any component-extraction procedure exists in the repository — verifiable from
  commit/PR order.
- **SC-003**: Deliberately omitting a known component from a golden dataset's artifact causes that
  dataset's component recall to drop in the eval's report; restoring it returns the score to
  baseline.
- **SC-004**: A developer can go from "looking at a container-level diagram" to "seeing that one
  container's internal components nested inside it in Studio" by running one command and reopening
  the same `.arch.json` — no upload step, no new UI to find — without any change in what any other
  container in the diagram looks like, and every newly merged component is still visible after
  closing and reopening the diagram (never silently missing for lack of a layout position).
- **SC-005**: Re-running the bulk `import` command on a workspace before and after a component-level
  analysis request for one of its repositories produces byte-identical `architecture.review.yaml`
  output.
- **SC-006**: Every expected component and relationship for a golden dataset is readable from a
  single ground-truth file without cross-referencing code.

## Assumptions

- "Opt-in" and "one repository at a time" are load-bearing: this feature must never make the bulk
  `import` path slower, costlier, or different in output. Per the clarified sequencing decision, the
  eval harness and both golden datasets are treated as a complete, mergeable User Story 1 on their
  own — the planning phase MUST sequence all of User Story 1's tasks before any task that writes or
  changes the component-extraction procedure itself.
- The two golden datasets can reasonably be built from two of the existing, already-committed
  Bookshop demo repositories (`examples/bookshop/repos/`) — chosen for their differing
  language/framework (e.g. a Java/Spring Boot service and a TypeScript/Express service) — rather than
  vendoring new source trees, consistent with how the correlation eval's golden workspace already
  reuses committed fixtures.
- The component-extraction procedure, when it is written, follows the project's existing pattern
  (010): an external, swappable skill/procedure a coding agent runs, not in-repo model-calling code.
  This spec does not change that architectural boundary.
- "Internal relationship" is scoped to calls/uses between the named internal components this feature
  identifies (e.g. "OrderController calls OrderRepository"), not a full call graph with line numbers.

## Out of Scope

- Any change to the deterministic cross-repository correlation pipeline, the `import` command's
  output shape, or the existing container-level eval (013).
- File/function/line-level code graph extraction (the approach retired in spec 007).
- Automatically deciding which container to drill into; the human always chooses.
- Cross-repository correlation of internal components (e.g. "this controller calls that other
  repo's service directly") — internal relationships are scoped to within one repository.
- Tuning or perfecting the component-extraction procedure's prompt quality — this spec establishes
  the schema, the scoring harness, and the plumbing; iterating on extraction quality against that
  harness (User Story 4) is ongoing follow-up work, the same way 011/012 iterated on the correlator
  after 009/010 established it.
