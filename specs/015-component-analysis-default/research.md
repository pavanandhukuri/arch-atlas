# Phase 0 Research: Component Analysis by Default

> **Note**: this research was rewritten on 2026-11-08 after the feature's first implementation (a
> third Studio upload slot + `FinalizeStep` merge, built and verified working) was reviewed and
> rejected by the user — "I want everything to be a single review file." The decisions below
> replace that design; see `spec.md`'s Clarifications for the full correction.

## 1. Where does a repository's `{repo}.components.json` actually get folded in?

**Decision**: Inside the deterministic `import` command (`apps/llm-importer`), not in Studio.
`runImport` already reads one `{repo}.analysis.json` per configured repository and writes
`architecture.review.yaml`; it now also tries to read that repository's `{repo}.components.json`
(new `tryReadComponents` in `analysis-store.ts`, mirroring the existing `tryReadAnalysis`) and, when
one validates, folds its `components`/`relationships` directly onto that repository's `repos[]`
entry (`RepoMeta`, a type spec 008 already established for description/technology).

**Rationale**: `architecture.review.yaml` is the one file a human has always uploaded into Studio.
`RepoMeta` is already an extensible, per-repository metadata slot Studio already reads to pre-fill
Tag & Classify — adding two more optional fields there is a strictly smaller, strictly more direct
change than introducing a second artifact and a second place to upload it. It also fixes a
correctness gap the rejected design had: matching a component artifact to "its container" by a
possibly-human-renamed display name, late in the wizard, versus matching it to a `RepoMeta` entry by
the same canonical repository name used everywhere else in the pipeline, before a human has had any
chance to rename anything.

**Alternatives considered**:

- _Studio's `FinalizeStep` merges a batch of separately-uploaded component artifacts_ (the original
  design). Rejected after being built and reviewed — see above. It also required a third wizard
  upload slot, which this design needs none of.
- _The agent scripts repeated `attach-components` CLI calls after a human finalizes_. Rejected for
  the same reason 014's own opt-in flow was rejected as the default: it's a manual step someone has
  to remember to run, for every repository, every time.

## 2. Does Studio's import wizard need any UI change?

**Decision**: No. Zero change to `load-step.tsx`, `finalize-step.tsx`, `import-wizard.tsx`, or
`import.css`. The wizard still accepts exactly one required file
(`architecture.review.yaml`) and one optional base-diagram file, exactly as before this feature and
exactly as 014 originally guaranteed (FR-012, restored).

**Rationale**: Once the components data is embedded in the review file Studio already reads, there
is nothing left for the wizard to accept differently.

## 3. How does Studio turn embedded `components`/`componentRelationships` into diagram elements?

**Decision**: `apps/studio/src/lib/import/build-model.ts`'s `buildModel` gains one more step, after
it builds each container's `Element` and before its single `computeLayout` call: for every
container-kind `ElementConfig`, look up `reviewFile.repos` by `config.name` (the canonical repo
name, stable even if a human has since edited the container's `displayName` in Tag & Classify); if
that entry has `components`, build `component`-kind child `Element`s (`parentId` = the container's
id) and, from `componentRelationships`, `Relationship`s between them — pushed into the same
`allElements`/`relationships` arrays the rest of `buildModel` already populates.

**Rationale**: `buildModel` already computes layout exactly once, over every element it has built,
at the very end. Adding the component elements before that point means they get laid out in the
same pass, for free — no second `computeLayout` call, no separate merge step, no outcome-reporting
UI, because there's no separate step left to report on. Component element ids are
`slug(`${container.id}-${component.name}`)` — prefixed by the container so two repositories that
each happen to have a same-named component (e.g. two "Controller"s) never collide.

**Alternatives considered**: A separate `mergeComponentArtifacts`-style post-processing step
(the rejected design's approach, adapted to run on `buildModel`'s output instead of on uploaded
files). Rejected — once the data already lives on `ElementConfig`'s own `reviewFile.repos` lookup,
inside `buildModel`'s existing per-container loop, a second pass over the finished model is strictly
more code for no behavioral difference.

## 4. What validates `{repo}.components.json` and `repos[].components` at each stage?

**Decision**: Unchanged at the artifact level (`ComponentAnalysisSchema`, FR-011) — `import` itself
validates each `{repo}.components.json` it reads (same `tryReadComponents` call that reads it) and
simply omits a repository's components from `repos[]` if the file is missing or invalid, logging a
warning only for the invalid case (same asymmetry `tryReadAnalysis` already has for "missing" vs.
"invalid"). Studio's `parseReviewYaml` parses `repos[].components`/`componentRelationships`
best-effort — a malformed entry inside an otherwise-valid `repos[]` array is dropped, not a reason
to fail parsing the whole review file (same tolerance its existing `repos[]`/`systems[]` parsing
already has). `buildModel` defensively skips (never throws on) a `componentRelationships` entry
whose `source`/`target` doesn't name a component in that same repository's list — a case that would
only arise from a hand-edited review file, since `import`'s own fold-in can't produce one.

**Rationale**: Every other optional, best-effort field on `ReviewFile`/`RepoMeta` already follows
this exact tolerance; components follow the same convention rather than inventing a new one.

## 5. Does the agent's side (SKILL.md) need the "optional mode" framing removed?

**Decision**: Yes — unchanged from the original research. `plugins/repo-analysis/skills/import/SKILL.md`'s
main whole-workspace Procedure gains the internal-structure analysis as a standard step for every
repository, in the same loop that already produces `{repo}.analysis.json` — not a separately-titled
"optional" section. What changes from the _original_ 2026-10-31 research is only the hand-off
language at the end: the agent now reports a single `architecture.review.yaml` path (step 7), not a
review file plus a batch of sibling component artifacts to drop into a wizard slot. The retained
"Re-running internal structure for one repository" section's two branches are: re-run `import`
wholesale (now the normal path, before a human has uploaded anything), or fall back to the
`attach-components` CLI directly on an already-finalized `.arch.json` (after upload, where there's
no more `import` run to fold a refresh into).

**Rationale**: FR-001, FR-002, FR-007 (visible two-pass progress), FR-009 (idempotent refresh) are
unaffected by where the fold-in happens; only the final hand-off step's wording changes.

## 6. Bookshop demo update (FR-006)

**Decision**: Unchanged from the original research — five hand-authored `{repo}.components.json`
files, one per Bookshop service, committed alongside the existing `{repo}.analysis.json` files in
`examples/bookshop/architecture-output/`. **Verified** end-to-end against the real fixtures: running
`import import.yaml` against Bookshop folds all five services' components into the generated
`architecture.review.yaml`'s `repos[]`, and feeding that one file through `parseReviewYaml` →
`classifyElements` → `buildModel` produces nested, correctly-positioned component elements under
every one of the five containers — confirming no second file is ever needed.

**Rationale**: These are demo fixtures, not eval fixtures (per spec Assumptions) — no ground-truth
file or baseline entry needed.

## 7. Publish-surface check

**Decision**: `apps/llm-importer` **does** get real code changes this time (reversing the original
research's "zero code changes" finding) — `analysis-store.ts`, `run-import.ts`, `review-file.ts`,
`cli.ts`'s doc comments, and `component-analysis.schema.ts`'s doc comment. All of it is bounded,
deterministic, no model call, and ships in the same `dist/` the package already publishes — no new
dependency, no new CLI command, no schema-breaking change to anything already on disk.
`apps/studio` changes (`build-model.ts`, `parse-review.ts`, `types.ts`) are internal to that
unpublished app. `plugins/repo-analysis/skills/import/SKILL.md`'s bundled `dist/agent-kit/` copy
picks up the reworded Procedure automatically via the existing `copy-agent-kit.mjs` build step — no
new file added to that bundle, same file list as before.
