# Phase 0 Research: Component-Layer Drill-Down

All items below were resolved by directly inspecting the existing codebase, not by external
research — this feature slots into patterns the project already has.

## 1. Does `core-model` need a schema change?

**Decision**: No.

**Rationale**: `packages/core-model/src/types.ts` already defines `ElementKind = 'landscape' |
'system' | 'person' | 'container' | 'component' | 'code'` and `Element.parentId?: string`. A
component nested inside a container is already exactly representable as an `Element` with
`kind: 'component'` and `parentId` set to the container's id — no new field, no schema version
bump. Confirmed `'component'` is handled as a real level (not just typed) in:

- `apps/studio/src/services/diagram-context.ts` — `DiagramLevel` includes `'component'`; comment:
  "In container diagram, we add components."
- `packages/layout/src/semantic-zoom.ts` — a zoom-threshold entry for `'component'`.
- `apps/studio/src/hooks/useDiagramNavigation.ts` — a `case 'component':` branch.
- `packages/renderer/src/renderer.ts`, `packages/viewer-components/src/services/diagram-navigation.ts`,
  `apps/studio/src/components/model-editor/ElementEditor.tsx` — all already branch on `'component'`.

**Alternatives considered**: Adding a dedicated `children`/`components` field to `Element` or a new
`ComponentAnalysis` reference type in `core-model`. Rejected — it would duplicate what `parentId`
already does and would be a published-package (`@archatlas/core-model` is on npm) surface change for
no behavioral gain.

## 2. Does the `gather-context` CLI command need a new flag?

**Decision**: No.

**Rationale**: `gather-context <config> --repos <name>` already writes exactly one
`{name}.context.json` bundle for a single named repository, deterministically, with no model call —
precisely the bounded input the new extraction mode needs. Verified in `apps/llm-importer/src/
cli.ts`'s `runGatherContextCommand`.

**Alternatives considered**: A `--depth component` flag on `gather-context` (the original design
discussion's working assumption). Rejected once inspection showed the command already produces a
repo-scoped bundle; a depth flag would imply `gather-context` itself decides what analysis to run,
but it never calls a model at all — the depth/kind of analysis is entirely a property of which skill
procedure the agent follows afterward, not of context-gathering.

## 3. One new skill file, or a new mode in the existing one?

**Decision**: Extend `plugins/repo-analysis/skills/import/SKILL.md` with one more optional section.

**Rationale**: The file already branches on input shape (whole workspace / single repo / a context
bundle) — this is one more branch, not a new document. `apps/llm-importer/src/agents/kit.ts` (the
`archatlas init` installer) is hardcoded to find and render exactly one `SKILL.md` per kit directory
(`resolveKitDir`/`loadKit`); teaching it to discover and install multiple skills is real,
unrelated-to-this-feature engineering work.

**Alternatives considered**: A second skill directory, `plugins/repo-analysis/skills/
import-components/`. Rejected for now — not because it's a bad shape long-term, but because it would
drag `kit.ts` changes into this feature's scope for no benefit to the spec's actual requirements
(FR-008 only requires _a way_ to request the analysis, not that `archatlas init` auto-installs it).
A future feature can split it out once there is a second skill worth installing independently.

## 4. How is `{repo}.components.json` validated, given `import` never reads it?

**Decision**: A new CLI subcommand, `validate-components <file>`.

**Rationale**: `{repo}.analysis.json` is validated "for free" today — `import` parses every artifact
with `RepoAnalysisSchema` and names-and-skips any that fails. FR-010/FR-013 forbid `import` from ever
looking at `{repo}.components.json`, so there is no free ride. FR-011 ("rejected... at the point it
is read") needs an explicit entrypoint both the skill procedure and tests can call. This mirrors the
existing skill's own "Validate" section, which currently tells the agent "the `import` run... parses
every artifact... so a malformed file shows up in that output" — the new section says the equivalent
for `validate-components`.

**Alternatives considered**: No CLI validation at all, leaving it entirely to Studio's client-side
parser. Rejected — it would mean the skill procedure (and CI) has no way to self-check its own output
before calling the job done, breaking the parallel with how the existing procedure validates.

## 5. What goes in the two golden datasets, concretely?

**Decision**: Reuse the already-committed `examples/bookshop/repos/catalog-service` (Java/Spring
Boot, 8 files) and `examples/bookshop/repos/order-service` (TypeScript/Express, 8 files). For each:
hand-author `ground-truth.json` from reading the real source, then hand-author the committed
`{repo}.components.json` as a **deliberately imperfect** guess — missing one real component and with
one relationship's direction reversed — rather than a copy of the ground truth.

**Rationale**: Spec FR-005 requires the harness to "run correctly against a stub or
deliberately-wrong artifact without crashing," and SC-003 requires that omitting a known component
measurably drops recall. Committing an already-imperfect artifact proves both at merge time, with the
initial baseline itself as the evidence, rather than deferring the proof to a hypothetical future
edit. It also avoids a vacuous 1.0/1.0 baseline that would mask a broken matcher.

**Alternatives considered**: Vendoring a new, larger public repo (e.g. a scaled-down clone of
`microservices-demo`, as the correlator eval's still-open P3 online-boutique item would). Rejected —
the spec's own Assumptions section already calls for reusing committed Bookshop repos, which are
small enough to hand-audit in full and already differ in language/framework, satisfying FR-004
without new vendored source.

## 6. How is component/relationship scoring actually computed?

**Decision**: Two new thin functions in the existing `apps/llm-importer/eval/score.ts`:
`scoreComponents(predicted, expected)` → `prf(predicted.map(c => c.name), expected.map(c => c.name),
nameMatch)`; `scoreRelationships(predicted, expected)` → `prf()` over `` `${normalize(source)}->
${normalize(target)}` `` keys with exact-string matching, mirroring `scoreConnections`'s own `key()`
helper exactly.

**Rationale**: `prf()` is already a generic greedy 1:1 set matcher parameterized by a `Matcher`
function — it has no idea what a "connection" or a "component" is. `nameMatch()` is already the
clarified (Q3) case/whitespace-insensitive, substring-tolerant name comparator used for repo names
today. Reusing both means the new scoring code is two short functions, each independently unit-tested
the same way `scoreConnections`'s tests already are (exact match, one TP/one FP/one FN, empty sets,
direction-reversed non-match for relationships).

**Alternatives considered**: A bespoke graph-similarity metric for relationships (e.g. graph edit
distance). Rejected as disproportionate — the spec scopes "internal relationship" to simple
calls/uses pairs (Assumptions), and set-based P/R/F1 is both simpler and consistent with how the
correlator's own connections are scored.

## 7. One eval command, or a flag on the existing one?

**Decision**: A separate `eval:components` script/command, not a `--kind` flag on `eval`.

**Rationale**: Matches the existing `eval` / `eval:extract` split (one CI-gating, one not — here both
new commands are small and could in principle both gate, but keeping them as a separate command keeps
their reports, golden-set directories, and baselines fully independent, which matters because FR-006
requires the harness to be mergeable and green _before_ any extraction procedure exists — an
independent command makes that a clean, self-contained PR with nothing else riding along).

**Alternatives considered**: Extending `run.ts`/`eval/golden/` to hold both correlation and component
golden sets side by side, distinguished by a field in `eval.config.yaml`. Rejected — the two eval
kinds score structurally different things (cross-repo connections vs. intra-repo components) against
differently-shaped ground truth; forcing one config/report shape to cover both would complicate both
needlessly.

## 8. CI placement and publish safety

**Decision**: One more step in the existing `test` job in `ci.yml`, directly after the existing
`eval -- --check` step. No new workflow, no matrix.

**Verification**: `apps/llm-importer/package.json`'s `files: ["dist"]` allowlist already excludes
`eval/` (proven by 013's own `npm pack --dry-run` check); this feature only adds more files under
that same already-excluded directory, so no new publish-safety work is needed beyond re-running the
same `npm pack --dry-run` check once as a sanity confirmation during implementation.
