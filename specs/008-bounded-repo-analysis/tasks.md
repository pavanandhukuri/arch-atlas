# Tasks: Bounded Per-Repository Analysis

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

**Language**: TypeScript 5.3.0 strict, Node.js ≥ 22, in `apps/llm-importer/` (paths below are relative to that package unless stated otherwise).

**Tests**: Included and required — constitution Principle III (TDD, NON-NEGOTIABLE) and the ≥80% coverage Definition-of-Done gate apply. Write each test task before its implementation task and confirm it fails first.

**Removal is gated**: Phase 7 (deleting the vendored Understand-Anything tree and the headless-babysitting code) MUST NOT begin until Phase 6's proof evidence is presented to the maintainer and explicitly confirmed (spec FR-018).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 for user-story phases; no label for Setup / Foundational / Polish

---

## Phase 1: Setup

**Purpose**: Scaffolding for the new analysis path. No behavior change.

- [x] T001 [P] Create `test/fixtures/analyses/` with a short `README.md` explaining these are pre-canned `RepoAnalysis` artifacts used by unit/integration tests
- [x] T002 [P] Create `src/analysis/context-limits.ts` exporting the context caps from research.md D2 (`MAX_DEPTH`, `MAX_LISTING_ENTRIES`, `MAX_README_BYTES`, `MAX_SOURCE_FILES`, `MAX_SOURCE_BYTES`, `MAX_TOTAL_CONTEXT_BYTES`) as named `const`s with a comment citing D2
- [x] T003 [P] Add a planted secret file `test/fixtures/repos/user-service/.env` (fake `API_SECRET=...`) if not already present, and note in `test/fixtures/README` (create if absent) that it exists to prove FR-003 / SC-007 secret-path exclusion (the 007 FR-015 list, carried forward)

**Checkpoint**: fixture + constants scaffolding in place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The five new `src/analysis/` modules, each unit-tested in isolation, none wired into `run-import.ts` yet (`runUnderstand` still runs). BLOCKS all user stories.

- [x] T004 [P] Unit test `test/unit/repo-analysis-schema.test.ts` — the full example in `contracts/repo-analysis-schema.md` validates against `RepoAnalysisSchema`; a payload missing `served` fails; `served.httpRoutes: [{ path: "v1/send" }]` (no leading `/`) fails; an extra top-level key is stripped, not rejected (contract tests 1–3, 5)
- [x] T005 [P] Implement `src/analysis/repo-analysis.schema.ts` — zod `RepoAnalysisSchema` + inferred `RepoAnalysis` type exactly per `contracts/repo-analysis-schema.md` (not `.passthrough()`)
- [x] T006 [P] Unit test `test/unit/gather-context.test.ts` — against `test/fixtures/repos/user-service` and `.../notification-service`: READMEs + manifests are collected with content; `listing` is bounded and excludes perf-skip dirs; `sourceExcerpts` are relevance-ranked, ≤ `MAX_SOURCE_FILES`, truncated at `MAX_SOURCE_BYTES`; `totalBytes ≤ MAX_TOTAL_CONTEXT_BYTES`; the planted `test/fixtures/repos/user-service/.env` never appears in any part of the `AnalysisContext` (SC-007)
- [x] T007 Implement `src/analysis/gather-context.ts` — `gatherContext(repoName, repoPath, descriptionHint?)` doing a depth/entry-bounded walk that reuses `matchesSecretPattern` from `src/analysis/secret-paths.ts` and the perf-skip dir set from `src/correlate/evidence/collect.ts` (duplicated, not imported), returning the `AnalysisContext` shape in `data-model.md`
- [x] T008 [P] Unit test `test/unit/to-correlation-graph.test.ts` — every invariant in `contracts/correlation-adapter-contract.md` §Invariants: exactly one `module` node; one `endpoint` node per `served.httpRoutes` entry that round-trips through `parseEndpointRoute` (import the real function from `src/correlate/evidence/parsers/routes.ts`); no dangling edges; `weight` defaults to `0.5`; empty `served`/`outbound` → module-only graph; output passes `RepositoryKnowledgeGraphSchema`; identical input → identical output (ordering)
- [x] T009 Implement `src/analysis/to-correlation-graph.ts` — `toCorrelationGraph(analysis: RepoAnalysis): RepositoryKnowledgeGraph` per the mapping table and §Endpoint format in `contracts/correlation-adapter-contract.md`; validate with `RepositoryKnowledgeGraphSchema.parse` before returning
- [x] T010 [P] Unit test `test/unit/analyze-repo.test.ts` — mock `@earendil-works/pi-coding-agent` exactly as `test/unit/agentic-correlator.test.ts` does (fake `session` whose `prompt` emits `message_update`/`text_delta`): happy path → one `prompt` call, `status: 'complete'`, `retryCount: 0`; prose-only-then-valid → `status: 'complete'`, `retryCount: 1`; invalid twice → `status: 'failed'`, `retryCount: 1`, no artifact write; assert `prompt` called ≤ 2×, no prompt string contains "continue"/"keep going"/"not complete"; assert `createAgentSession` called with `tools: []`; a fenced ` ```json ` response with surrounding prose is still extracted (contract test 4)
- [x] T011 Implement `src/analysis/analyze-repo.ts` — render `AnalysisContext` → the prompt in `contracts/analysis-call-contract.md`; `createAgentSession({ agentDir, model, modelRuntime, tools: [], sessionManager: SessionManager.inMemory(), settingsManager: SettingsManager.inMemory({}) })`; one `session.prompt`; accumulate `text_delta`; extract first balanced `{…}`; merge tool-set fields (`schemaVersion`, `analyzedAt`, `repository`, `analysisStatus`, `retryCount`); `RepoAnalysisSchema.parse`; retry-once-then-`failed`; whole thing inside `options.limiter.run(...)`; export `AnalyzeRepoResult` union
- [x] T012 [P] Unit test `test/unit/analysis-store.test.ts` — `writeAnalysis` validates before writing and round-trips via `readAnalysis`; an invalid object is rejected and no file appears; `hasValidCachedAnalysis(dir, name)` returns true/false correctly; `listAllAnalyses(dir)` reads only `*.analysis.json`; a dir containing only `*.knowledge-graph.json` yields `[]` and logs the one-line upgrade notice
- [x] T013 Implement `src/analysis/analysis-store.ts` — `writeAnalysis`, `readAnalysis`, `hasValidCachedAnalysis`, `listAllAnalyses`, plus `ensureOutputDir` (or re-export the existing one); artifact filename `{repo-name}.analysis.json`; 007-file upgrade notice per `contracts/cli-contract.md`
- [x] T014 [P] Add pre-canned `test/fixtures/analyses/user-service.analysis.json` and `test/fixtures/analyses/notification-service.analysis.json` matching `contracts/repo-analysis-schema.md`, consistent with the existing `test/fixtures/repos/*` sources (used by later phases)

**Checkpoint**: all five modules exist and are green in isolation; `run-import.ts` still calls `runUnderstand`.

---

## Phase 3: User Story 1 — Single-Repository Analysis Without the Multi-Phase Skill (Priority: P1) 🎯 MVP

**Goal**: One configured repository is analyzed by a single bounded model call and produces a valid `{repo}.analysis.json`; the run invokes no Python and loads no analysis skill.

**Independent Test**: point the tool at one fixture repo with a configured (or mocked) local model; assert `{repo}.analysis.json` is written, names the stack, lists the known interfaces, and exactly one model call (≤ 2 with retry) was made.

- [x] T015 [P] [US1] Update `test/unit/run-import.test.ts` — replace the `runUnderstand` mock with an `analyzeRepo` mock; single-repo run writes `{repo}.analysis.json` via `analysis-store`, builds a correlation graph via `toCorrelationGraph`, and prints the `contracts/cli-contract.md` progress lines; an `analyzeRepo` `status: 'failed'` result adds the repo to `failures` and writes no artifact
- [x] T016 [US1] Rewrite the analysis section of `src/analysis/run-import.ts` — call `analyzeRepo({ repoName, repoPath, descriptionHint, model, modelRuntime, limiter, onProgress })` instead of `runUnderstand`; on success `writeAnalysis(outputDir, analysis)` and push `toCorrelationGraph(analysis)` into the `graphs` array the correlator consumes; keep the existing `failures` / `reportFailures` / partial-diagram flow untouched
- [x] T017 [US1] Update per-repo progress reporting in `src/analysis/run-import.ts` to the `contracts/cli-contract.md` wording (`[analyze] {name}: gathering context (N files, K KB)`, `[analyze] {name}: calling model...`, `[done] {name}: {tech} · {n} route(s), {n} topic(s), {n} outbound intent(s)`); `--verbose` prints prompt section headers + byte counts, never the raw response
- [x] T018 [US1] Wire the cached-artifact skip in `run-import.ts` to `hasValidCachedAnalysis` / `readAnalysis` (replacing `hasValidCachedArtifact` / `readKnowledgeGraph`); `--force-refresh` still bypasses it
- [x] T019 [US1] Rewrite `test/integration/single-repo-analysis.integration.test.ts` — run the real `analyzeRepo` against a reachable local model (env-gated on the same var 007 used), skipped otherwise; assert a schema-valid `{repo}.analysis.json`, that `served`/`outbound` may be empty without failure (US1 scenario 4), and that no `python`/`python3` child process is spawned during the run

**Checkpoint**: `arch-atlas-import config.yaml --repos "One Repo"` produces a valid `{repo}.analysis.json` from one model call; downstream stages still execute.

---

## Phase 4: User Story 2 — Multi-Repository Import Still Produces a Correlated Diagram (Priority: P2)

**Goal**: N repositories analyzed by bounded calls, correlated by the UNCHANGED correlator through the adapter, assembled and exported; partial failure still yields a diagram; connection set ≥ what 007 found.

**Independent Test**: run against a multi-repo fixture set with a known shared topic + gateway-prefixed HTTP call + shared DB; assert each known cross-repo connection appears in the review artifact and diagram, and one repo's analysis failure still yields a partial diagram.

- [x] T020 [P] [US2] Expand `test/fixtures/repos/` to a 3–5 repo, multi-language set: keep the two TS services, add at least one Go service and one more service, wired so the evidence passes can connect them — a shared message-topic literal, a gateway-prefixed HTTP call (`/api/x/v1/...` vs `/v1/...`), and a shared database (compose service or client literal). Mirror the shapes in `apps/llm-importer/test/fixtures/repos` today
- [x] T021 [P] [US2] Add pre-canned `test/fixtures/analyses/*.analysis.json` for every repo added in T020, each accurately describing that fixture's served/outbound interfaces
- [x] T022 [P] [US2] Unit test `test/unit/run-import-multi.test.ts` (mocked `analyzeRepo`) — N repos fan out through `SharedLimiter` and never exceed `maxConcurrency` concurrent calls; one repo returning `status: 'failed'` still produces `architecture.review.yaml` + `architecture.arch.json` from the rest, with the failure in the summary (FR-014 / SC-003)
- [x] T023 [P] [US2] Update `test/integration/multi-repo-correlation.integration.test.ts` — feed each fixture repo through `analyzeRepo` with a mocked model returning the T021 canned analyses; run the full pipeline; assert the known shared-topic, gateway-HTTP, and DB cross-repo connections all appear as candidates in the review artifact
- [x] T024 [US2] Update the remaining `run-import.ts` fan-out call sites — `--aggregate-only` loads via `listAllAnalyses` + `toCorrelationGraph`; `--analyze-only` and `--repos` operate unchanged on the new artifact; leave a `// removed in 008 Phase 7` marker on the `process.env.ARCH_ATLAS_MAX_CONCURRENCY` line (kept until `vendor/pi-subagent` goes)
- [x] T025 [US2] Run the existing `test/unit/{deterministic-correlator,evidence-collect,evidence-parsers,evidence-passes,agentic-correlator,bucket-mapper,review-assembly,diagram-builder}.test.ts` against adapter-built graphs; fix ONLY fixture/import wiring (e.g. build graphs via `toCorrelationGraph` from a canned `RepoAnalysis`); any change to `src/correlate/**` or `src/confidence/**` source is out of scope for this task and must be flagged instead of made
- [x] T026 [US2] Add a `run-import` assertion/test that `correlateDeterministically` receives graphs whose `endpoint` nodes satisfy `parseEndpointRoute` (guards the FR-009 "served routes still drive correlation" claim end to end)

**Checkpoint**: multi-repo import produces a correlated review artifact + diagram; `correlate/**` and `confidence/**` source unchanged; partial failure handled.

---

## Phase 5: User Story 3 — Repository Description and Technology Reach the Diagram (Priority: P3)

**Goal**: each analyzed repo's container element carries a description + technology label; the review artifact carries a `repos` block without breaking Studio's parser.

**Independent Test**: export a diagram from a run with known descriptions/stacks; assert the container elements carry them and external-system elements do not; feed the produced review YAML through Studio's field checks and confirm it still parses.

- [x] T027 [P] [US3] Extend `test/unit/diagram-builder.test.ts` — with an `analysesByName` map supplied, a container element for an analyzed repo gets `description` (from `analysis.description`) and `technology` (from `frameworks[0] ?? languages.join('/')`); a candidate-only external-system element gets neither; an analysis with `description: ""` and empty `languages`/`frameworks` still yields a valid element
- [x] T028 [US3] Update `src/export/diagram-builder.ts` — `buildDiagram(review, analysesByName, title)`; set `element.description` / `element.technology` per research.md D6; keep external-system elements untouched
- [x] T029 [P] [US3] Extend `test/unit/review-assembly.test.ts` — `ReviewFile.repos` is populated from the supplied analyses (`{ name, description?, technology? }` per repo); serialize the produced file and run it through a local re-implementation of `parseReviewYaml`'s required-field checks (research.md D7) to prove non-breakage (FR-016)
- [x] T030 [US3] Add optional `repos?: Array<{ name: string; description?: string; technology?: string }>` to `ReviewFile` in `src/review/review-file.ts`; populate it in `src/review/assemble-review.ts`; thread an `analysesByName` map from `src/analysis/run-import.ts` into both `assembleReviewFile` and `buildDiagram`

**Checkpoint**: all four functional user stories (US1–US3 + the additive enrichment) are green; nothing under `vendor/` has been touched yet.

---

## Phase 6: User Story 4 (part 1) — Proof Gate Before Removal (Priority: P4)

**Goal**: demonstrate the bounded-call pipeline is a true drop-in — equal-or-better cross-repo connections, no Python, no skill load — then get maintainer sign-off to remove.

**Independent Test**: the comparison document shows 008's connection set ⊇ 007's known-correct set for a comparable workspace.

- [x] T031 [US4] Add `test/integration/pipeline-e2e.integration.test.ts` — runs the expanded-fixture workspace (T020) through the full pipeline with a mocked model returning the T021 analyses, and writes the resulting cross-repository connection set to a snapshot file for comparison
- [x] T032 [US4] Run the full pipeline live against the maintainer-provided `uds-sdk` workspace with a real local-model endpoint; capture the per-repo `*.analysis.json`, `architecture.review.yaml`, `architecture.arch.json`, wall-clock, and a `ps`/strace-free check that no `python*` process was spawned and no `understand` skill was loaded
- [x] T033 [US4] Write `specs/008-bounded-repo-analysis/proof.md` — side-by-side cross-repo connection sets (007 run vs. this run) for `uds-sdk`, showing equal-or-superset (SC-002), plus the "no Python / no skill" evidence and the fixture snapshot from T031. **Present to the maintainer; do not proceed to Phase 7 without explicit confirmation** (FR-018)

**Checkpoint**: proof.md complete and maintainer-approved.

---

## Phase 7: User Story 4 (part 2) — Remove the Vendored Analysis Dependency (Priority: P4)

**Goal**: delete the vendored tree, the babysitting code, and the Python prerequisite; suite and monorepo pipeline green at ≥80% coverage.

**⚠️ Do not start until Phase 6 (T033) is maintainer-confirmed.**

- [x] T034 [US4] Delete `apps/llm-importer/vendor/understand-anything/` and `apps/llm-importer/vendor/pi-subagent/` entirely
- [x] T035 [US4] Delete `src/analysis/run-understand.ts`, `src/analysis/resource-loader.ts`, `src/analysis/secret-exclusion-extension.ts` and `test/unit/{run-understand,resource-loader,secret-exclusion-extension}.test.ts`; remove the `process.env.ARCH_ATLAS_MAX_CONCURRENCY` assignment + its comment from `src/analysis/run-import.ts`
- [x] T036 [US4] Delete `src/graph/knowledge-graph-store.ts` and `test/unit/knowledge-graph-store.test.ts`; remove `filterToTrimmedSchema` and the "trimmed subset of Understand-Anything" commentary from `src/graph/schema.ts`, keeping `GraphNode` / `GraphEdge` / `RepositoryKnowledgeGraph` / `RepositoryKnowledgeGraphSchema`; delete or repoint `test/unit/graph-schema-filter.test.ts`
- [x] T037 [US4] Remove Python + vendored-asset references: strip the vendored-asset provenance / re-diff section and any Python prerequisite from `apps/llm-importer/README.md`; remove `vendor/`- or `python`-referencing scripts from `apps/llm-importer/package.json`; in `specs/007-llm-repo-importer/plan.md` mark the D5/D13 "Python bundled in a TS package" deviation **"Retired by 008-bounded-repo-analysis"**
- [x] T038 [US4] Grep `apps/llm-importer` for stragglers — `understand-anything`, `pi-subagent`, `run-understand`, `resourceLoader`, `merge-batch-graphs`, `\.ua/`, `UA_DIR`, `python3?`, `MAX_CONTINUE_NUDGES`, `verifyGenuineAnalysis` — and resolve every hit (code, comments, docs, `turbo`/`vitest` config)
- [x] T039 [US4] `pnpm --filter @arch-atlas/llm-importer run typecheck lint test` with coverage; then `turbo run typecheck lint test` from the repo root — both green, `apps/llm-importer` coverage ≥ 80% (FR-019 / SC-005)

**Checkpoint**: vendored tree and Python prerequisite gone; full pipeline green.

---

## Phase 8: Polish & Cross-Cutting

- [x] T040 [P] Rewrite `apps/llm-importer/README.md`'s pipeline description — bounded analysis call, `{repo}.analysis.json`, no UA, no Python; keep the correlation/review/export description
- [x] T041 [P] Run `specs/008-bounded-repo-analysis/quickstart.md` end-to-end against a live local model and correct any drift from actual CLI behavior
- [x] T042 [P] Coverage sweep across `apps/llm-importer/src` — add unit tests for any file left below threshold by the Phase 7 churn (constitution Definition of Done)
- [x] T043 [P] Update root `CHANGELOG.md` — 008: per-repo analysis engine replaced by a single bounded local-model call; `{repo}.analysis.json` replaces `{repo}.knowledge-graph.json`; Python runtime prerequisite dropped; container elements now carry description + technology
- [x] T044 Add the explicit security-review paragraph (constitution: data-import changes require it), captured in `specs/008-bounded-repo-analysis/security-review.md` — FR-003 secret-path exclusions now enforced at context-gather time and proven by the planted-`.env` test; model response treated as untrusted and schema-validated; no hosted-API path; no Python subprocess

---

## Phase 9: Reliability Hardening (research.md D13 — added after the Phase 6 live run)

**Purpose**: defects only visible against a real local model on a real multi-language
workspace (`uds-sdk`, oMLX / Qwen3-Coder-30B): one repo of four failed analysis per
run (README-heavy repo starved of source excerpts; Java code below the walk depth
cap; the odd unparseable / truncated model response; two large concurrent 30B
requests degrading each other). TDD — each test written before its fix.

- [x] T045 [P] Unit test `test/unit/gather-context.test.ts` (extended) — a README-heavy tmp repo still yields source excerpts (READMEs capped by `MAX_README_FILES` / `MAX_README_TOTAL_BYTES`, shallowest-first); `docs/*.md` that is not a named entry point is NOT treated as a README
- [x] T046 [US-] Implement per-kind context budgets in `src/analysis/context-limits.ts` + `src/analysis/gather-context.ts` — independent README / manifest / source byte+count budgets so a README-heavy repo cannot starve source excerpts (research.md D13.1)
- [x] T047 [US-] Raise `MAX_DEPTH` 4 → 12 in `src/analysis/context-limits.ts` — reach `src/main/java/<group>/<pkg…>/…` where Java/Kotlin service code lives; `MAX_FILES_EXAMINED` / `MAX_LISTING_ENTRIES` still bound cost (research.md D13.2)
- [x] T048 [P] Unit test `test/unit/analyze-repo.test.ts` (extended) — recovers JSON with trailing commas / `//` comments; recovers a truncated (unclosed) response via synthesised closers; the retry attempt prepends a stricter "JSON only" instruction
- [x] T049 [US-] Implement `extractJsonObject` in `src/analysis/analyze-repo.ts` (renamed from `extractFirstJsonObject`) — brace/bracket scan with string handling, `parseLenient` (strip trailing commas + comments, retry), truncation-closer synthesis (research.md D13.3)
- [x] T050 [US-] Implement the differentiated retry preamble in `src/analysis/analyze-repo.ts` — attempt 1 prepends "a previous attempt produced output that could not be parsed; respond with ONLY the JSON object…" (research.md D13.4)
- [x] T051 [P] Unit test `test/unit/analyze-repo.test.ts` (extended) — a response with a valid `description` but missing/malformed `served` is salvaged as `analysisStatus: "partial"` with `served` emptied; a parsed object with no usable signal still fails
- [x] T052 [US-] Implement partial salvage in `src/analysis/analyze-repo.ts` — `SalvageModelAnalysisSchema` (per-field `.catch()` defaults) + `coerceModelAnalysis`, accepted only when the result carries real signal (description or languages/frameworks) (research.md D13.5)
- [x] T053 [US-] Change `analysis.maxConcurrency` default 2 → 1 in `src/config/config.schema.ts`; update `test/unit/config-loader.test.ts`, `quickstart.md`, `data-model.md` (research.md D13)
- [x] T054 Second live `uds-sdk` run (default serial config) — confirm 4/4 repos analyze; append results to `specs/008-bounded-repo-analysis/proof.md`

**Checkpoint**: two consecutive serial `uds-sdk` runs at 4/4; Java/Maven repos yield real served-route data; suite green at ≥ 80% coverage.

---

## Phase 10: LLM Quality Hardening (research.md D14 — from the dogfood run)

**Purpose**: the analysis output was usable but noisy — run-to-run variance in
extracted interfaces, `frameworks` reporting `vitest`/`typescript`, and the
agentic fallback proposing "both repos use AWS" connections. Validated live
against `uds-sdk` and the arch-atlas monorepo itself.

- [x] T055 [P] Unit test + implement `withSamplingDefaults` (`src/model-runtime/local-model-runtime.ts`) — a `Proxy` injecting `analysis.temperature` (default 0.1) into `ModelRuntime.stream/complete` options; thread `config.analysis.temperature` through `run-import.ts` (D14.1)
- [x] T056 [P] Unit test + implement `sanitizeFrameworks` (`src/analysis/analyze-repo.ts`) — denylist of test/build/lint tooling + `@types/*` + version-suffix stripping; applied to the model's `frameworks` output (D14.2)
- [x] T057 [P] Unit test + implement `parseDependencySplit` (`src/analysis/gather-context.ts`) — `{ dependencies, devDependencies, peerDependencies }` from JSON manifests; rendered in the prompt with "frameworks come from RUNTIME deps" (D14.2)
- [x] T058 Tighten the analysis prompt (`renderPrompt` in `src/analysis/analyze-repo.ts`) — explicit rules block for `frameworks` / `served` vs `outbound` / cite-a-file (D14.3)
- [x] T059 [P] Unit test + implement `detectInterfaces` (`src/analysis/gather-context.ts`) — reuse `extractUrlLiterals` / `extractTopicRefs` over the source excerpts; rendered as non-authoritative "detected interface hints" in the prompt (D14.5)
- [x] T060 [P] Unit test + implement `sanitizeServed` (`src/analysis/analyze-repo.ts`) — strip `/actuator/**`, `/health*`, `/metrics`, `/.well-known/**`, … from `served.httpRoutes` (D14.9)
- [x] T061 Agentic-fallback tightening (`src/correlate/agentic-correlator.ts`) — served-interface summary; concrete-match prompt; `confidence ≥ 0.8` + `isGenericInfraReasoning` filter; unit tests (D14.4)
- [x] T062b Agentic-fallback → `low` confidence bucket (`src/confidence/bucket-mapper.ts`, was `medium` in D11); update `bucket-mapper.test.ts` + `review-assembly.test.ts` (D14.4)
- [x] T063b Unit test + implement the opt-in `verifyGrounding` second pass (`src/analysis/analyze-repo.ts`) — non-fatal on a parse hiccup (D14.8)
- [x] T064b Implement `submit-analysis-tool.ts` (TypeBox schema + `constrainedSampling`) and the `structuredOutput: "tool"` branch in `analyze-repo.ts` with text fallback; zod↔TypeBox drift-guard test. **Live-tested: pathologically slow against oMLX — kept opt-in, default `"prompt"`** (D14.6)
- [x] T065b Config: add `analysis.{temperature, verifyGrounding, structuredOutput}` (`config.schema.ts`); re-add `typebox` dep; update `config-loader.test.ts`, `quickstart.md`, `data-model.md`, `CHANGELOG.md`
- [x] T066b Live re-run against `uds-sdk` (4/4) — frameworks clean, agentic noise 4→2 (both `low`); `research.md` D14 + `proof.md` updated

**Checkpoint**: 193 unit tests green, coverage 97% / 83%; frameworks no longer
carry tooling; agentic connections read as `low`.

---

## Phase 11: Eval Harness (research.md D14.10)

**Purpose**: replace the "one run before / one run after" comparison with a
repeatable eval — fixed inputs, hand-labelled ground truth, P/R/F1 per field,
consistency over N runs, regression gate.

- [x] T067b Pure scoring (`test/eval/score.ts`) — normalized set P/R/F1, route/gRPC/framework fuzzy matchers, Jaccard consistency, connection scoring; 14 unit tests (`score.test.ts`, run in `pnpm test`)
- [x] T068b Golden sets — `test/eval/golden/fixtures/` (the in-repo synthetic workspace) and `test/eval/golden/online-boutique/` (`GoogleCloudPlatform/microservices-demo` at pinned SHA `72ba613…`, cloned by `clone-workspace.ts` into a git-ignored `workspace/`), each with `eval.config.yaml` + hand-labelled `ground-truth.json`
- [x] T069b Runner (`test/eval/run.ts`, `pnpm eval`) — N runs/repo against a live local model, per-field + connection + consistency scoring, description LLM-judge, `baseline.json` write, `--check` regression gate (> 0.05); model from `EVAL_MODEL_*` env; skips cleanly when unreachable
- [x] T070b Exclude `test/eval/golden/*/workspace/**` from eslint / `tsconfig.test.json` / `vitest.config.ts`; `.gitignore` the cloned workspace; `pnpm eval` script
- [x] T071b First baseline captured (Qwen3-Coder-30B / oMLX) — recorded in `test/eval/README.md` and `research.md` D14.10

**Checkpoint**: `pnpm eval` runs end to end (fixtures ~1 min, online-boutique
~4 min/run); `baseline.json` committed; connection-recall-0 on gRPC surfaced as
the next work item.

---

## Dependencies & Execution Order

### Phase order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** → **Phase 4 (US2)** → **Phase 5 (US3)** → **Phase 6 (US4 proof)** → **[maintainer confirmation]** → **Phase 7 (US4 removal)** → **Phase 8 (Polish)** → **Phase 9 (Reliability, from the Phase 6 live run)**
- Phase 2 blocks every user story. Phases 3–5 are largely sequential because they all edit `src/analysis/run-import.ts` (US1 rewires it, US2 extends the fan-out, US3 threads the analyses map). Phase 7 is hard-gated on Phase 6.

### Within phases

- Every `*.test.ts` task precedes its implementation task and must fail first (TDD gate).
- T005 (schema) blocks T009, T011, T013 (all consume `RepoAnalysis`).
- T007 (gather-context) + T011 (analyze-repo) + T013 (store) + T009 (adapter) all block T016 (run-import rewrite).
- T020/T021 (expanded fixtures) block T022/T023/T031.
- T030 (analyses map threading) blocks T028's real wiring and T033's live run.

### Parallel opportunities

- Phase 1: T001, T002, T003 together.
- Phase 2: the test tasks T004, T006, T008, T010, T012 together; then implementations T005/T007/T009/T011/T013 (T005 first, the rest parallel once it lands); T014 anytime after T005.
- Phase 4: T020, T021, T022, T023 authored in parallel (distinct files) before T024–T026 wiring.
- Phase 8: T040–T043 all parallel.

---

## Implementation Strategy

### MVP (Phases 1–3)

Setup + the five foundational modules + US1 wiring. At the Phase 3 checkpoint the importer analyzes a repository with one bounded model call, writes `{repo}.analysis.json`, invokes no Python, and loads no skill — the core of the feature, demonstrable on a single repo. `runUnderstand` is deleted only in Phase 7.

### Incremental delivery

1. Phases 1–2 → foundation (modules green in isolation).
2. Phase 3 → single-repo bounded analysis end to end (MVP).
3. Phase 4 → multi-repo + correlation + partial failure, `correlate/**` untouched.
4. Phase 5 → description/technology on the diagram + review `repos` block.
5. Phase 6 → proof evidence; maintainer sign-off.
6. Phase 7 → remove the vendored tree + Python prerequisite.
7. Phase 8 → docs, coverage, security-review note.

### Notes

- Commit after each task or logical group.
- Any task that would require editing `src/correlate/**`, `src/confidence/**`, `src/review/*` logic (beyond the additive `repos` field), the config schema, or the Studio wizard indicates a design gap — stop and flag rather than modifying those.
