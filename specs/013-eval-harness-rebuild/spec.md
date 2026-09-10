# Feature Specification: Correlation Eval Harness Rebuild

**Feature Branch**: `013-eval-harness-rebuild`
**Created**: 2026-09-11
**Status**: Draft
**Input**: User description: "Rebuild the importer eval harness that was deleted with packages/analysis-runner-local in PR #23 … This is spec 013."

## Overview

The `apps/llm-importer` correlator turns per-repository analysis artifacts into a cross-repository
architecture model. Until PR #23 it had a scored eval — precision / recall / F1 against
hand-labelled ground truth, gated in CI by a committed baseline — that lived inside the
`analysis-runner-local` package and was deleted along with it. Since then, changes to the
correlation passes (external systems, gateway-prefix matching, shared-contract handling, …) have
had **no regression gate beyond hand-picked unit assertions**: a change can quietly drop a real
connection or invent a false one on a realistic workspace and every check stays green.

This feature rebuilds that gate for the part of the pipeline that is now deterministic — the
correlator — and keeps an opt-in, model-dependent extraction eval as a local-only script.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A correlator change is caught before it regresses a realistic workspace (Priority: P1)

A contributor changes a correlation pass (adds a heuristic, tightens a matcher, extends the
external-systems dictionary). They run one command and get a precision / recall / F1 report for
cross-repo connections and for external-system recall over a committed golden workspace. CI runs
the same command in `--check` mode and **fails the build** if any headline metric drops below the
committed baseline by more than a small tolerance.

**Why this priority**: This is the whole point — the deterministic correlator is the piece that
must not silently regress, and it is the piece that can be evaluated with no model and no network.

**Independent Test**: Revert the external-systems pass on a branch, run `eval --check`, observe a
non-zero exit and a report showing external-system recall collapsed; restore it, run again, observe
a pass.

**Acceptance Scenarios**:

1. **Given** the committed golden workspace and baseline, **When** a contributor runs the eval in
   report mode, **Then** they see per-metric precision / recall / F1 for cross-repo connections and
   external-system recall, plus a pass/fail line per metric against the baseline.
2. **Given** a change that removes a true connection the golden workspace expects, **When** CI runs
   the eval in `--check` mode, **Then** the job exits non-zero and names the metric(s) that
   regressed and by how much.
3. **Given** a change that legitimately improves a metric, **When** the contributor runs the eval
   with the baseline-update flag, **Then** the baseline file is rewritten and shows up as a
   reviewable diff in the PR.
4. **Given** an unchanged correlator, **When** the eval runs twice, **Then** it produces identical
   scores (no model, no randomness).

---

### User Story 2 - Ground truth is legible and lives beside the workspace it describes (Priority: P2)

A maintainer needs to understand or extend what "correct" means for the golden workspace. They open
one human-readable ground-truth file next to the committed analysis artifacts and see every
expected cross-repo edge (source, target, kind, direction) and every expected external system, each
with a short note on the evidence. Adding a new expectation is editing that file plus, if needed,
adding an analysis artifact.

**Why this priority**: An eval whose ground truth is opaque or scattered rots. It must be as easy to
review as a test fixture.

**Independent Test**: Add one new expected external system to the ground-truth file, run the eval,
see recall drop (because the correlator doesn't produce it yet) or stay at 1.0 (because it does),
with the new expectation clearly listed in the report.

**Acceptance Scenarios**:

1. **Given** the golden workspace directory, **When** a maintainer lists its contents, **Then** they
   find the committed `{repo}.analysis.json` artifacts, one ground-truth file, and a config file,
   and nothing that requires cloning an external repository.
2. **Given** the ground-truth file, **When** a maintainer reads it, **Then** every expected
   connection and external system is enumerated with source, target, kind and a one-line rationale.

---

### User Story 3 - The scoring functions are reusable and independently tested (Priority: P2)

A contributor wants to score a one-off workspace, or reuse the F1 math in another check. The scoring
functions are importable from the importer package, take plain data (an analysis object or a
connection list plus ground truth), return numbers, and make no model call or file-system
assumption. They have their own unit tests covering exact-match, partial-match, empty-set and
direction-sensitive cases.

**Why this priority**: The old `score.ts` was valued precisely because it was decoupled; keeping it
that way is what lets the eval be used ad hoc and lets the math be trusted.

**Independent Test**: Import the scoring function in a scratch script, pass it a hand-built
connection list and ground truth, verify the returned precision / recall / F1 by hand.

**Acceptance Scenarios**:

1. **Given** a connection list that exactly matches ground truth, **When** scored, **Then**
   precision, recall and F1 are all 1.0.
2. **Given** a connection list with one true positive, one false positive and one missed edge,
   **When** scored, **Then** precision = 0.5, recall = 0.5, F1 = 0.5.
3. **Given** direction-sensitive scoring, **When** a connection has the right endpoints but reversed
   direction, **Then** it does not count as a match.
4. **Given** empty ground truth and an empty connection list, **When** scored, **Then** the result
   is well-defined (no divide-by-zero) and treated as a pass.

---

### User Story 4 - Model-dependent extraction quality can be spot-checked locally (Priority: P3)

A maintainer who has produced `{repo}.analysis.json` artifacts for a workspace (via a coding agent)
wants to know how good the extraction was. They run a separate, opt-in script that scores those
on-disk artifacts against a ground-truth file for `languages`, `frameworks`, served interfaces and
outbound targets, and prints per-field precision / recall / F1. This never runs in CI.

**Why this priority**: Useful for tuning the analysis procedure, but it depends on a model having
produced the artifacts, so it can't gate anything and isn't reproducible in CI.

**Independent Test**: Point the script at a workspace's output directory and a ground-truth file,
see a per-field score table.

**Acceptance Scenarios**:

1. **Given** a directory of analysis artifacts and a ground-truth file, **When** the extraction
   script runs, **Then** it prints precision / recall / F1 for each scored field and an overall
   summary, and exits zero regardless of score (it is a report, not a gate).
2. **Given** the CI configuration, **When** the pipeline runs, **Then** the extraction script is not
   invoked.

---

### User Story 5 - A second, larger public golden workspace (Priority: P3)

A maintainer adds a real open-source multi-service workspace (e.g. Google's `microservices-demo`,
Apache-2.0) as a second golden set, so the eval also exercises gRPC-heavy and shared-contract
scenarios that the synthetic workspace under-represents.

**Why this priority**: Broadens coverage and matches the old `online-boutique` golden set, but the
synthetic workspace already gives a working CI gate, so this is additive.

**Independent Test**: Run the eval; both golden sets are scored and each has its own baseline
entry.

**Acceptance Scenarios**:

1. **Given** two golden sets are configured, **When** the eval runs, **Then** each is scored
   separately and `--check` fails if **either** regresses.
2. **Given** the second golden set, **When** a maintainer inspects it, **Then** its analysis
   artifacts are committed to the repo (not produced at eval time) and its source repository is
   referenced only by URL + pinned commit in a comment, never vendored.

---

### Edge Cases

- **A golden workspace analysis artifact is malformed or missing**: the eval reports which repo was
  skipped and scores against what remains; it does not crash. (The importer already skips-and-names
  such artifacts.)
- **The baseline file is absent** (first run): report mode works; `--check` mode treats a missing
  baseline as a hard failure with a message telling the maintainer to generate one.
- **A metric improves past the baseline**: `--check` passes (improvements never fail); the report
  flags it as "ahead of baseline — consider updating".
- **Ground truth names a connection between repos not in the workspace**: the eval flags the
  ground-truth file as inconsistent rather than silently scoring it as a miss.
- **Tolerance**: `--check` allows a small downward slack per metric (to absorb floating-point and
  trivial reorderings) — large enough to not be flaky, small enough that a dropped real edge on the
  synthetic workspace always trips it.
- **Publish safety**: none of the eval code, fixtures, or golden sets appear in the published npm
  tarball for `@archatlas/llm-importer`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The project MUST provide a command that scores the deterministic correlator over one
  or more committed golden workspaces and prints, per golden set, precision / recall / F1 for
  cross-repo connections and recall for external systems.
- **FR-002**: The command MUST support a check mode that compares each metric against a committed
  baseline and exits non-zero when any metric regresses beyond a defined per-metric tolerance,
  naming the offending metric(s) and the delta.
- **FR-003**: The command MUST support a mode that rewrites the baseline from the current scores, so
  a deliberate metric change lands as a reviewable diff.
- **FR-004**: Scoring MUST be deterministic and require no model call, no network access, and no
  cloning of external repositories at eval time.
- **FR-005**: The scoring functions MUST be importable from the importer package as plain functions
  over plain data (an analysis object, or a connection list, plus ground truth), with no file-system
  or model dependency, and MUST have their own unit tests covering exact match, partial match,
  empty sets, and direction sensitivity.
- **FR-006**: Each golden workspace MUST consist of committed `{repo}.analysis.json` artifacts, one
  human-readable ground-truth file enumerating every expected connection (source, target, kind,
  direction, rationale) and every expected external system, and a config file — with no step that
  clones or vendors an external source repository.
- **FR-007**: The synthetic golden workspace MUST reuse the existing in-repo fixture workspace and
  MUST include at least two external-system expectations (e.g. an object store and an identity
  provider) so external-system recall is genuinely exercised; fixture analysis artifacts MAY be
  extended with the corresponding outbound intents.
- **FR-008**: CI MUST run the correlation eval in check mode on every pull request and fail the
  build on regression.
- **FR-009**: An opt-in, local-only extraction eval MUST score on-disk analysis artifacts against a
  ground-truth file for `languages`, `frameworks`, served interfaces and outbound targets, print
  per-field precision / recall / F1, and always exit zero (report, not gate). CI MUST NOT run it.
- **FR-010**: No eval code, fixture, golden set, or baseline may be included in the published npm
  package for `@archatlas/llm-importer`; the eval adds no dependency to that package's published
  runtime surface.
- **FR-011**: The eval MUST live under `apps/llm-importer/eval/` and MUST be documented by a README
  in that directory covering: how to run report / check / baseline-update modes, how ground truth is
  structured, and how to add a golden set.
- **FR-012**: When a golden workspace has a missing or malformed analysis artifact, the eval MUST
  name the skipped repository and score against the remainder rather than aborting.
- **FR-013**: `--check` with no baseline file present MUST fail with an actionable message; a metric
  that exceeds the baseline MUST never cause `--check` to fail.

### Key Entities

- **Golden workspace**: a directory of committed `{repo}.analysis.json` artifacts representing one
  multi-repo system, plus its ground truth and config. Self-contained; no external clone.
- **Ground truth**: a hand-authored file listing the expected cross-repo connections (source,
  target, kind, direction, rationale) and expected external systems for a golden workspace, and —
  for the extraction eval only — expected per-repo `languages` / `frameworks` / served interfaces /
  outbound targets.
- **Score**: precision, recall and F1 for a set (connections, external systems, or an extraction
  field), computed by comparing produced items to ground-truth items.
- **Baseline**: a committed file holding the last-accepted score for every metric of every golden
  set; the reference `--check` compares against.
- **Correlation eval run**: report or check over the golden sets; deterministic; CI-gating.
- **Extraction eval run**: local-only report over on-disk analysis artifacts vs. ground truth;
  never gates.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A contributor can get a full correlation score for the golden workspace(s) with one
  command in under 10 seconds, with no network access and no model.
- **SC-002**: Reverting the external-systems correlation pass causes the eval's `--check` mode to
  exit non-zero, and the report shows external-system recall dropping to 0 for the affected golden
  set.
- **SC-003**: Two consecutive eval runs on an unchanged correlator produce byte-identical score
  output.
- **SC-004**: The scoring functions' unit tests cover exact-match (all metrics 1.0), the
  1-TP/1-FP/1-FN case (all metrics 0.5), reversed-direction non-match, and empty-set handling, and
  changed-file coverage for the eval stays at or above the project's 80% threshold.
- **SC-005**: The published `@archatlas/llm-importer` tarball contains no `eval/` path (verifiable
  from `npm pack --dry-run`).
- **SC-006**: Every expected connection and external system for a golden set is readable from a
  single ground-truth file without cross-referencing code.
- **SC-007**: CI on a pull request runs the correlation eval and blocks merge on regression; the
  extraction eval never runs in CI.

## Assumptions

- The existing in-repo fixture workspace (`apps/llm-importer/test/fixtures/`) is the basis for the
  synthetic golden set; its known cross-repo edges are already asserted by an integration test and
  are treated as authoritative for the ground-truth file.
- Baseline updates are a normal, expected part of PRs that intentionally change correlation
  behaviour — reviewed as a diff, like the `online-boutique` baseline updates in specs 011/012.
- A per-metric absolute tolerance (small, e.g. a couple of hundredths of an F1 point) is sufficient;
  no statistical/variance modelling is needed because scoring is deterministic.
- The correlation eval depends on the external-systems pass from the immediately preceding feature
  (`feat/import-external-systems-and-labels`); this spec's implementation lands on top of it.
- "F1" throughout means the standard harmonic mean of precision and recall, with the convention
  that scoring an empty produced set against an empty ground-truth set is a pass (precision =
  recall = F1 = 1).

## Out of Scope

- Re-adding a model-driven analyzer to the importer package (the split into a deterministic core +
  external agent producer, from spec 010, stands).
- Running the extraction eval, or any model call, in CI.
- Scoring the `.arch.json` diagram export or layout — the eval stops at the review-artifact /
  connection level.
- Any change to how the importer itself behaves; this feature only observes and scores it.
- A dashboard or historical trend store for scores; the baseline file plus PR diffs are the record.
