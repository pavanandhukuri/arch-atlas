# Phase 0 Research: Correlation Eval Harness Rebuild

All decisions are low-risk: the deleted harness is fully recoverable from git at `dda7094`
(`packages/analysis-runner-local/eval/`), and the scoring math was already pure and unit-tested.

## D1 — Reuse `score.ts` verbatim, minus the model-run helpers

**Decision**: Port `score.ts` unchanged except:

- Type imports `@arch-atlas/llm-importer` → relative `../src/analysis/repo-analysis.schema.js`
  (`RepoAnalysis`) and `../src/correlate/deterministic-correlator.js` (`CrossRepositoryConnection`).
  In-package relative imports; no published subpath (FR-010).
- Keep: `normalize`, `normalizeRoute`, `grpcTail`, `tokenOverlap`, `nameMatch`, `prf`, `jaccard`,
  `meanPairwiseJaccard`, `analysisFields`, `groundTruthFields`, `scoreRepoRun`, `scoreConnections`,
  `mean`, `stddev`, `averagePrf`. All still relevant: `scoreConnections` is the correlation-eval
  core; the rest serve the extraction eval and its consistency line.
- No helper is removed — they are small, tested, and `extract.ts` uses `scoreRepoRun` +
  `meanPairwiseJaccard`.

**Rationale**: The math was the valued, decoupled part. Rewriting it invites subtle scoring drift.

**Alternatives rejected**: Rewrite from scratch (needless risk); pull in a metrics library (new
dependency for ~40 lines of arithmetic).

## D2 — `scoreExternalSystems`: recall-headline, P/R/F1 reported

**Decision**: New function
`scoreExternalSystems(candidates: Candidate[], expected: string[], workspaceRepoNames: string[]): PRF`.
Predicted set = distinct `candidate.target` values whose normalized form is **not** a workspace repo
name. Match against `expected` with `nameMatch` (so `"Amazon S3"` ~ `"S3"`, `"Keycloak"` ~
`"Keycloak"`). Returns full `PRF`; the report and baseline treat **recall** as the headline (a
dropped external dependency is the regression we care about) and carry precision/F1 alongside to
catch the normalization dictionary over-firing.

**Rationale**: Mirrors how `scoreConnections` already works; a separate metric keeps external-system
regressions visible independent of repo↔repo connection changes.

**Alternatives rejected**: Folding externals into `scoreConnections` (hides which half regressed);
recall-only (a broad regex that starts inventing systems would go unnoticed).

## D3 — Golden-set fixture path handling

**Decision**: Committed `{repo}.analysis.json` keep a placeholder `repository.path`. `eval/load.ts`
rewrites each analysis's `repository.path` to `join(<workspace.local>, <repo.name>)` from
`eval.config.yaml` before correlating — the exact device
`model-free-pipeline.integration.test.ts` already uses. The synthetic golden set's
`eval.config.yaml` sets `workspace.local: ../../../test/fixtures/repos`, so **no analysis files are
duplicated** — the eval references `test/fixtures/` directly.

**Rationale**: The evidence passes re-walk real source; they need real paths. Referencing the
existing fixture tree avoids a second copy that could drift.

**Alternatives rejected**: Commit path-patched analysis copies under `eval/golden/fixtures/analyses/`
(duplication, drift); make the evidence passes path-optional (out of scope, changes importer
behaviour).

## D4 — Add external-system intents to two shared fixture analyses

**Decision**: Add one `outbound` intent to `test/fixtures/analyses/user-service.analysis.json`
(`{ target: "Amazon S3", verb: "writes_to", detail: "stores user avatars in an S3 bucket",
confidence: 0.8 }`) and one to `gateway.analysis.json`
(`{ target: "Keycloak", verb: "depends_on", detail: "validates bearer tokens against the Keycloak
realm on every proxied request", confidence: 0.85 }`). Update
`model-free-pipeline.integration.test.ts`'s edge snapshot to include `user-service -> Amazon S3` and
`gateway -> Keycloak`.

**Rationale**: FR-007 requires external-system recall to be genuinely exercised. These are plausible
additions to the synthetic system and make the metric non-trivial (expected recall 1.0, so any
regression in the external-systems pass drops it immediately — SC-002).

**Alternatives rejected**: A dedicated non-shared analyses copy for the eval (D3 rejection applies);
inventing a whole new golden workspace now (that's `online-boutique`, P3).

## D5 — Baseline shape and tolerance

**Decision**:

```jsonc
{
  "fixtures": {
    "connections":     { "precision": <n>, "recall": <n>, "f1": <n> },
    "externalSystems": { "precision": <n>, "recall": <n>, "f1": <n> }
  }
}
```

`eval --check`: for every metric present in the baseline, fail if `current < baseline - 0.02`
(absolute). Improvements never fail. A missing `baseline.json` in `--check` mode → exit 2 with
"run `eval -- --update-baseline` to create it". `eval -- --update-baseline` rewrites the file from
current scores (pretty-printed, stable key order → clean diff).

**Rationale**: 0.02 absorbs float noise and trivial reordering while still tripping on any dropped
real edge in a ≤6-repo workspace (one lost edge out of ~6 moves recall by ≥0.15). Matches how the
old `online-boutique` baseline was hand-updated for specs 011/012.

**Alternatives rejected**: Relative tolerance (fragile near 1.0); per-metric custom tolerances
(over-engineered for one synthetic set); no tolerance (flaky on float equality).

## D6 — CI placement

**Decision**: One added step in the existing `test` job of `.github/workflows/ci.yml`, after the
coverage run:
`- run: pnpm --filter @archatlas/llm-importer eval -- --check`. No new workflow, no matrix.

**Rationale**: Same job that already runs the suite; a correlator regression should block the same
PR check. Deterministic + offline → no flakiness, no secrets.

**Alternatives rejected**: Separate `eval.yml` workflow (extra config for a ~5s step); nightly-only
(defeats the "catch it in the PR" purpose).

## D7 — Publish safety

**Decision**: `apps/llm-importer/package.json` already has `"files": ["dist"]`, which scopes the
tarball to compiled output — `eval/` (source `.ts`, fixtures, `baseline.json`) is excluded
automatically. Verified by `npm pack --dry-run` (recorded here at implementation time) and asserted
by a one-line addition to an existing packaging-adjacent test if one exists, else left to the
dry-run in the release workflow.

**`npm pack --dry-run` result** (to be pasted at implementation): _pending — expect zero `eval/`
entries._

**Rationale**: No `.npmignore` needed; `files` allowlist is already correct. No action beyond
verification.

## D8 — `score.test.ts` runs as a normal unit test

**Decision**: `eval/score.test.ts` matches vitest's default `include` glob, so `pnpm test` runs it
with the rest of the suite and it counts toward coverage. `eval/run.ts` / `eval/extract.ts` are
scripts (no `.test.` in the name) — vitest ignores them; they are covered instead by
`eval/run.integration.test.ts`. `vitest.config.ts` needs no change (its only `eval/` exclusion,
`eval/golden/*/workspace/**`, is for cloned repos that this feature doesn't create).

**Rationale**: Keeps the scoring math in the standard test + coverage path with zero config.

## Open questions

None. `online-boutique` as a second golden set is explicitly P3 (spec User Story 5) and deferred.
