# Feature Specification: Component Analysis by Default

**Feature Branch**: `015-component-analysis-default`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Make the component-layer internal-structure analysis (built in spec 014) the DEFAULT behavior of the bulk import, instead of an opt-in per-container request … This is a deliberate, explicit reversal of 014's own non-goal that the bulk import command's behavior and output must be completely unaffected by the presence of any component artifact … Open design question: the diagram file does not exist yet at bulk-import time … (a) Studio's finalize step auto-merges sibling component artifacts … (b) the agent scripts repeated attach-components calls after the human finalizes … does default mean truly unconditional, or should there be an escape hatch?"

## Overview

Spec 014 built a working, opt-in way to see one repository's internal structure nested inside its
container: an agent determines a repo's major components, writes a bounded artifact, and a CLI
command merges it into an existing diagram, one container at a time, on explicit request. In
practice, almost nobody asks for it — the request to "import" and the request to "drill into this
one container" read as two different, separable things, so the deeper view stays undiscovered
unless someone already knows it exists and asks for it by name.

This feature removes that extra step: every repository in a workspace gets the internal-structure
analysis automatically, as part of the same single import request a developer already makes today.
It is an explicit, confirmed reversal of 014's own guarantee that the bulk import path would never
pay the cost of the deeper analysis — the cost is now accepted for every repository, every time,
in exchange for the diagram showing full container-and-component detail without a second ask.

The building blocks from 014 (the bounded artifact schema, its validator, the merge command, and
the scoring harness with its two golden datasets) are reused exactly as they are — nothing about
what a component artifact contains, or how one gets merged into a diagram, changes. What changes is
_when_ that artifact gets produced (always, not on request) and _how reliably_ every repository's
artifact actually ends up merged into the finished diagram without a human or agent having to
remember to ask, container by container.

## Clarifications

### Session 2026-10-31

- Q: How does every repository's component artifact actually reach the finished diagram, given the diagram file does not exist until a human finalizes Studio's import wizard — well after the artifacts are produced? → A (initial): Studio's finalize step itself looks for and merges every sibling component artifact automatically when it builds the diagram — no further action from anyone. **Superseded 2026-11-08, see below.**
- Q: Is "default" truly unconditional for every workspace and every repository, or should there remain a way to opt back into the cheaper, 014-era behavior (component analysis skipped entirely)? → A: Unconditional — no opt-out; the cheaper, container-only mode is retired.
- Q: Should the project's own demo workspace (Bookshop) be updated to carry committed component artifacts for all five of its services, so its documentation and quickstart stay representative of the new default? → A: Yes — update it so the demo matches real default behavior.
- **Consequence of the first answer, surfaced during integration, not separately asked**: the import
  wizard's upload step cannot auto-discover sibling files next to one it's given — something has to
  hand it every `{repo}.components.json` directly. Checking the actual wizard code (not assumed)
  found it already has precedent for exactly this: a second, _optional_ upload slot beside the
  required `architecture.review.yaml` one, for an existing `.arch.json` to merge into (predating
  014, for re-import scenarios). The natural, minimal fix is a third slot in that same pattern —
  accepting any number of `{repo}.components.json` files at once — not a directory picker. This
  avoided introducing a new, Chromium-only browser API (`showDirectoryPicker()`) with no existing
  precedent in the codebase. This was built, end to end (third upload slot, `FinalizeStep` merge),
  and then reverted — see below.

### Session 2026-11-08 — correction

After the above was fully implemented and verified working, the user reviewed it and said this was
not what they wanted: **"I want it to be that way... everything to be a single review file"** — a
developer should upload exactly one file into Studio, start to finish, not a review file plus a
batch of sibling component artifacts into a second slot. Re-examining the pipeline found a cleaner
mechanism that wasn't considered during the original clarification: the deterministic `import` CLI
command (`apps/llm-importer`) already globs every `{repo}.analysis.json` it finds and folds it into
`architecture.review.yaml`; teaching it to do the exact same thing for `{repo}.components.json` —
folding each repository's internal structure directly onto that repository's existing `repos[]`
entry (`RepoMeta`, established by spec 008) — means `architecture.review.yaml` is, again, the one
and only file a human ever uploads. This is strictly simpler than the first design: no new upload
slot, no new Studio merge step, no per-repository "skipped/ambiguous container" UI, and container
matching is now keyed by the same canonical repo name used throughout the pipeline rather than a
possibly-human-renamed container display name. **This supersedes the first Clarification answer
above and FR-003/FR-012 below**, which are rewritten accordingly; the third-slot/Studio-merge code
built under the original answer was reverted in full. The underlying architectural decision (FR-001,
FR-002, FR-005 through FR-011, both user stories) is unaffected — only _where_ the fold-in happens
changes.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A developer imports a workspace and gets full detail without a second ask (Priority: P1)

A developer writes `import.yaml`, asks their coding agent to import the workspace — the same single
request as always — and ends up with a diagram where every container already shows its internal
components, without ever having had to separately ask to "drill into" any of them.

**Why this priority**: This is the entire point of the feature — today's opt-in step is so easy to
not know about that it may as well not exist for most people; removing the second ask is the value.

**Independent Test**: Run the standard import request against a workspace that has never had any
component-level artifacts before. Confirm the resulting diagram shows nested components for every
container, not just the ones a human explicitly requested.

**Acceptance Scenarios**:

1. **Given** a workspace with several repositories and no prior component artifacts, **When** a
   developer asks their agent to import it (the same request as before this feature), **Then** the
   agent produces a validated component artifact for every repository in the workspace, not just
   one.
2. **Given** those artifacts exist, **When** the agent runs `import` (as it already does to produce
   `architecture.review.yaml`) and a human then uploads that one file into Studio's import wizard,
   **Then** every one of the workspace's containers shows its internal components nested inside it
   — not only a container someone separately asked about, with no second file to upload and no
   further CLI command needed from anyone.
3. **Given** this same import request, **When** a developer compares it to today's behavior,
   **Then** they notice no new step to remember — the extra detail simply appears as part of the
   one request they already make.

---

### User Story 2 - A maintainer understands and accepts the added cost (Priority: P2)

Before or during an import, a developer can see that every repository is getting the deeper,
internal-structure analysis in addition to the external-interface one — so the added time/cost is
visible, not a surprise, even though it now happens without being asked for per container.

**Why this priority**: Making something the default is only fair if the person running it can tell
it's happening and roughly how much more it costs; the previous opt-in step's whole value was that
the cost was only paid when asked for.

**Independent Test**: Run an import on a workspace with several repositories and observe the
reported progress; confirm it distinguishes the external-interface pass from the internal-structure
pass for each repository, rather than silently doing twice the work with no visible change.

**Acceptance Scenarios**:

1. **Given** a workspace being imported, **When** the agent works through each repository,
   **Then** it's visibly doing two passes per repository (external interface, then internal
   structure), not one undifferentiated pass.
2. **Given** a repository too small or uniform to have meaningful internal structure, **When** its
   internal-structure pass runs, **Then** a near-empty component artifact is valid output, not an
   error or a skipped repository (same rule 014 already established).

---

### User Story 3 - DROPPED (resolved: no opt-out)

Clarification Q2 resolved to "unconditional, no opt-out" — there is no workspace-level setting to
skip internal-structure analysis. This user story is removed rather than kept as dead scope; 014's
container-only behavior is retired, not offered as a choice. A developer who wants to see _only_
container-level detail does so by simply not drilling into any container in Studio — the data
exists either way, same as any other element a diagram viewer can choose not to zoom into.

---

### Edge Cases

- **A repository's internal-structure analysis fails or comes back low-confidence**: it's recorded
  as `analysisStatus: "partial"` (014's existing rule) and does not block or fail the rest of the
  import — a partial result for one repository is not a reason to skip merging the others.
- **A repository's `{repo}.components.json` is missing when `import` runs** (its internal-structure
  pass hasn't finished yet, or was never run for that one repository): `import` folds in whatever
  it finds and simply omits `components`/`componentRelationships` from that repository's `repos[]`
  entry — not an error, not a reason to skip that repository's external-interface data or fail the
  rest of the import. Its container still appears; it just shows no nested components until a later
  `import` run finds the artifact.
- **A repository's `{repo}.components.json` is malformed when `import` runs**: `import` reports it
  (same pattern as a malformed `.analysis.json`) and proceeds without that repository's internal
  structure, rather than failing the whole import.
- **A workspace has repositories with pre-existing component artifacts from 014's opt-in flow**:
  re-running the now-default import does not duplicate components for a repository whose current
  artifact is already up to date; it refreshes it the same way `gather-context` already refreshes a
  stale `{repo}.analysis.json` today — and the same way re-running `import` already refreshes
  `architecture.review.yaml` wholesale.
- **A human uploads `review.yaml` from before this feature existed, or from a run where some
  repositories' internal-structure passes hadn't finished yet**: the wizard still accepts it
  unchanged — containers whose `repos[]` entry carries no `components` simply show no nested detail,
  exactly the diagram 014 (or an earlier partial run) would have produced. This is not an error, and
  there is nothing for a human to upload differently.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When an agent is asked to import a workspace, it MUST produce a validated
  component-level artifact for every repository in that workspace, not only ones explicitly
  requested — using the same bounded schema and validation 014 already established, unchanged.
- **FR-002**: The external-interface analysis (014/008's existing `{repo}.analysis.json`) and the
  correlation pipeline (`gather-context` → `import` → `architecture.review.yaml`) MUST continue to
  produce exactly the same artifacts and output shape they do today; this feature adds a second,
  parallel analysis pass per repository, and does not alter the first one.
- **FR-003**: The deterministic `import` command MUST, for every repository it finds a valid
  `{repo}.components.json` for, fold that repository's components and component relationships
  directly onto its entry in `architecture.review.yaml` — so the single file `import` already
  writes carries full container-and-component detail, with no second artifact for a human or Studio
  to separately ingest, no upload step beyond the one that already exists, and no CLI command run
  by anyone after `import`.
- **FR-004**: A repository whose `{repo}.components.json` is missing or malformed when `import`
  runs MUST have that repository's `components`/`componentRelationships` simply omitted from its
  `repos[]` entry, without blocking the rest of the workspace's fold-in or failing the import — its
  external-interface data and candidate connections are entirely unaffected.
- **FR-005**: There is no opt-out from the default internal-structure analysis — it is
  unconditional for every repository in every workspace. 014's opt-in, per-container request
  remains available as a mechanism (for a repository that, for whatever reason, didn't get
  analyzed during the main pass — see Edge Cases), but there is no workspace-level setting to skip
  it during the standard import request.
- **FR-006**: The Bookshop demo workspace (`examples/bookshop`) MUST gain committed
  `{repo}.components.json` artifacts for all five of its services, so that cloning and running the
  demo produces a diagram with full container-and-component detail by default, matching real
  behavior under this feature — consistent with how its `{repo}.analysis.json` artifacts are
  already committed and kept current.
- **FR-007**: The progress an agent reports while importing a workspace MUST distinguish the
  external-interface pass from the internal-structure pass for each repository, so the added cost
  of this feature is visible rather than silently doubling the work with no indication.
- **FR-008**: A repository too small or uniform to have meaningful internal structure MUST still
  produce a valid (possibly near-empty) component artifact, never an error, matching 014's existing
  rule.
- **FR-009**: Re-running the import on a workspace that already has component artifacts from a
  prior run (under 014's opt-in flow or this feature's default flow) MUST refresh each repository's
  artifact rather than duplicate or skip it, consistent with how re-running `gather-context` already
  refreshes `{repo}.analysis.json` today.
- **FR-010**: This feature MUST NOT introduce file/function/line-level code graph extraction — the
  component artifact remains the same bounded summary of major internal components 014 defined, not
  a deeper graph.
- **FR-011**: The existing `validate-components` and `attach-components` CLI commands, and the
  `ComponentAnalysisSchema` they validate against, MUST keep their current shape and contract —
  this feature changes when and how often they are invoked, not what they do.
- **FR-012**: The import wizard's upload step MUST continue to accept exactly one file
  (`architecture.review.yaml`) and MUST NOT be extended to accept component artifacts separately —
  **restoring** 014's original FR-012 guarantee (the first design under this spec briefly
  superseded it; see Clarifications' 2026-11-08 correction). `architecture.review.yaml` itself
  carries the component data now, so the wizard's upload step needs no change at all.

### Key Entities

- **Component artifact**: unchanged from 014 — a bounded, per-repository summary of internal
  components and their relationships, plus completeness/status metadata. The only change this
  feature makes is that one now exists for every repository in a workspace by default, not only
  for ones explicitly requested — and that `import` reads it directly rather than it staying a
  second, Studio-ingested file.
- **Review artifact's per-repository entry** (`repos[]`, a `RepoMeta` — not new; established by
  spec 008 for description/technology): gains two optional fields, `components` and
  `componentRelationships`, carrying one repository's component artifact inline. A repository with
  neither field simply has no internal-structure detail yet, auditable by reading the file itself —
  there is no separate "merge outcome" record, since there is no separate merge step.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer who makes the same single import request they always have ends up with a
  diagram where 100% of containers show their internal components nested inside them, with no
  additional request made.
- **SC-002**: A developer can tell, from the agent's own reported progress, that every repository
  received both an external-interface and an internal-structure analysis — not just from inspecting
  the resulting files afterward.
- **SC-003**: A workspace with one repository whose internal structure can't be determined
  confidently still produces a complete diagram for every other repository — one low-confidence or
  failed repository never blocks the rest.
- **SC-004**: Repeating the same import request on an unchanged workspace produces the same
  `repos[].components`/`componentRelationships` for every repository (no duplication, no repository
  silently dropped) — the fold-in is idempotent per repository.

## Assumptions

- "Default" is scoped to the bulk `import` request path (what a human means when they ask their
  agent to "import this workspace") — it does not change what the `import` CLI command itself does
  with artifacts already on disk (FR-002); the correlation pipeline's own guarantees from 014
  (FR-010/FR-013 there) still hold for that command specifically.
- The two golden-components datasets and the `eval:components` harness built in 014 remain the
  regression gate for extraction quality under this feature too — this spec does not ask for a
  third golden dataset. Bookshop's five new committed component artifacts (FR-006) are demo
  fixtures for the import/finalize flow, not golden-eval fixtures — they don't need their own
  hand-authored ground truth or baseline entry the way the two golden-components sets do.
- Cost is accepted as roughly double the per-repository analysis work compared to 014's default
  path, per the user's explicit confirmation; this spec does not set a hard time/cost budget beyond
  that acknowledgment.
- No Studio wizard/UI change is needed at all — `architecture.review.yaml`'s `repos[]` array
  (`RepoMeta`) was already established by spec 008 as an extensible place for per-repository
  metadata Studio pre-fills from; adding `components`/`componentRelationships` there, and having
  `buildModel` turn them into nested elements in the same single layout pass it already runs, needed
  no new upload mechanism, no new browser API, and no new merge step to design around.

## Out of Scope

- Any change to what a component artifact contains, how it's validated, or how the underlying merge
  logic works mechanically — all unchanged from 014 (only _where_ that logic runs, and _when_ it's
  triggered, changes).
- A third golden dataset or any change to the `eval:components` scoring functions themselves.
- Automatically deciding _which_ containers are worth showing component detail for — this feature
  does it for all of them, uniformly; it does not add a heuristic for picking "important" containers.
- A workspace-level opt-out setting (retired per Clarification Q2 — not deferred, not planned).
- Changing Studio's local-disk or Google Drive _storage_ providers themselves — FR-012 is about the
  import wizard's one-time upload step, not about how a finalized diagram is subsequently saved or
  reopened.
