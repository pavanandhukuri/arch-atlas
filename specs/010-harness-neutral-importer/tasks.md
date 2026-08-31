# Tasks: Harness-Neutral Importer

**Input**: `/specs/010-harness-neutral-importer/` — plan.md, spec.md, research.md (D1–D12),
data-model.md, contracts/ (5)

**Tests**: MANDATORY (constitution III). Every implementation task follows a failing test task.
Coverage ≥ 80% line/statement for **both** `apps/llm-importer` and `packages/analysis-runner-local`.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — different file, no dependency on an incomplete task
- Story tags: US1 (model-free core), US2 (local runner), US3 (Claude skill), US4 (BYO producer), US5 (dep removal)

Paths are repo-relative. `CORE = apps/llm-importer`, `RUNNER = packages/analysis-runner-local`.

---

## Phase 1: Setup

- [ ] T001 Scaffold `RUNNER`: `packages/analysis-runner-local/{package.json,tsconfig.json,tsconfig.test.json,vitest.config.ts,eslint.config.js or shared,README.md,src/,test/}`. `package.json` name `@arch-atlas/analysis-runner-local`, `type: module`, deps `zod js-yaml commander @arch-atlas/llm-importer (workspace:*)`, devDeps matching `packages/layout`. `bin`: `analysis-runner-local` → `./dist/cli.js`. Add to `pnpm-workspace.yaml` glob is already `packages/*` — no change; run `pnpm install`.
- [ ] T002 [P] Add `RUNNER` to root `tsconfig` references / `turbo.json` pipeline / `eslint` + `vitest` project lists exactly as the other `packages/*` are wired.
- [ ] T003 [P] [US1] Create `CORE/src/index.ts` per `contracts/context-bundle-contract.md` §Library (re-exports only; no logic) — **including `RepositoryKnowledgeGraph`/`RepositoryKnowledgeGraphSchema`/`GraphNode`/`GraphEdge`/`GraphEdgeType`/`GRAPH_EDGE_TYPES` from `graph/schema.js`**, which the runner's `resolveUnresolvedPairs` and the eval need. Add the `exports` map + `main`/`types` to `CORE/package.json` (keep `bin`).
- [ ] T004 [P] Add `@arch-atlas/analysis-runner-local` as a **devDependency** of `CORE` (eval only; dev-cycle is intentional — research D10). `pnpm install`.

---

## Phase 2: Foundational (the producer↔core seam)

**⚠️ Blocks every user story.**

- [ ] T005 [P] [US1] `CORE/test/unit/context-bundle.test.ts` — round-trip (`gatherContext` fixture → serialize → `readContextBundle` deep-equal), CB1 (no `.env` relPath), CB4 (`totalBytes` tamper → parse fail), CB5 (version mismatch → `ContextBundleVersionError`). MUST fail (module absent).
- [ ] T006 [US1] `CORE/src/analysis/context-bundle.ts` — `ContextBundleSchema` + `ContextFileSchema`/`DependencySplitSchema`/`SourceExcerptSchema`/`DetectedInterfacesSchema` (zod mirrors of `gather-context.ts` interfaces), `serializeContextBundle(ctx)`, `readContextBundle(path)`, `ContextBundleVersionError`. Make T005 pass.
- [ ] T007 [P] [US1] `CORE/test/unit/extra-connections.test.ts` — absent file → `[]`; one valid `agentic-fallback` connection → parsed; malformed file → throws; a `foundBy:'evidence'` entry → rejected. MUST fail.
- [ ] T008 [US1] `CORE/src/correlate/extra-connections.ts` — `ExtraConnectionSchema` / `ExtraConnectionsSchema` (per data-model.md), `readExtraConnections(outDir): CrossRepositoryConnection[]`. Make T007 pass.
- [ ] T009 [US1] `CORE/src/config/config.schema.ts` — `localModel` → `.optional()`. Update `CORE/test/unit/config-loader.test.ts`: a config **without** `localModel` validates; one **with** it still validates. Keep every other field.
- [ ] T010 Wire T006/T008 exports into `CORE/src/index.ts`. `pnpm --filter @arch-atlas/llm-importer typecheck` clean.

**Checkpoint**: seam schemas exist and are tested; nothing else changed yet.

---

## Phase 3: User Story 1 — model-free importer core (Priority: P1) 🎯 MVP

**Goal**: `import` produces review + diagram from `{repo}.analysis.json` files with no model / no
network; `gather-context` emits bundles.

**Independent Test**: `import` over `CORE/test/fixtures/analyses/*.json` → review + diagram, `fetch`
spy never called.

### Tests (write first, must fail)

- [ ] T011 [P] [US1] `CORE/test/integration/model-free-pipeline.integration.test.ts` — run `runImport` (aggregate path) over the fixtures analyses; assert review + diagram match a committed snapshot modulo `generated_at`/`createdAt`; install a global `fetch`/`http.request` spy and assert 0 calls (CLI1). Also: one analysis file removed + one corrupted → both skipped, diagram from the rest (CLI4); config with a `localModel` block → identical output (CLI2); two runs → byte-identical review modulo timestamp (CLI3).
- [ ] T012 [P] [US1] `CORE/test/unit/cli.test.ts` updates — `gather-context import.yaml` writes one `{repo}.context.json` per repo (CB2); `--repos user-service` writes only that; `import` with a malformed `architecture.extra-connections.json` → exit `1`; `--analyze-only` is no longer a recognised flag.
- [ ] T013 [P] [US1] `CORE/test/unit/run-import.test.ts` updates — drop the analyze-loop / agentic-fallback assertions; add: `readExtraConnections` result is merged and surfaces as a `low`-confidence candidate; "no valid artifacts" → message + no diagram + exit `0`.

### Implementation

- [ ] T014 [US1] `CORE/src/analysis/run-import.ts` — delete the non-aggregate branch, `buildLocalModelRuntime`, `analyzeRepo`, `correlateAgentically`, `options.analyzeOnly`. Load analyses per configured repo (respect `--repos`), name+skip missing/invalid (contract §acceptance rules). After `correlateDeterministically`, merge `readExtraConnections(outDir)`. `RunImportOptions` loses `analyzeOnly` **and `forceRefresh`** (the runner owns `--force-refresh`). Make T011/T013 pass.
- [ ] T015 [US1] `CORE/src/cli.ts` — remove `--analyze-only`, the `checkLocalModelReachable` gate, exit code `2`, `LocalModelUnreachableError` import. Add `gather-context <config>` subcommand (`--out`, `--repos`) → `gatherContext` + `serializeContextBundle` + write. Keep `import` (`--output`, `--repos`, `--verbose`). Make T012 pass.
- [ ] T016 [US1] Commit the snapshot fixtures the integration test compares against (generated once from the current `--aggregate-only` output over `fixtures/analyses/*`, timestamps stripped).

**Checkpoint**: US1 done — MVP. Core has no model/network path. `pnpm --filter @arch-atlas/llm-importer test lint typecheck` green (pi files still present but unused by the run path).

---

## Phase 4: User Story 2 — reference local-model runner (Priority: P1)

**Goal**: `RUNNER` produces schema-valid `{repo}.analysis.json` from a local endpoint, parity with
the old in-app behaviour.

### Tests (write first, must fail)

- [ ] T017 [P] [US2] `RUNNER/test/unit/openai-client.test.ts` — mocked `fetch`: SSE `delta.content` accumulation → concatenated string; non-2xx → throws with status + truncated body; `responseFormat` forwarded in the body; `AbortSignal` aborts; **a `timeoutMs` shorter than the (fake) response aborts the request (LR7); no captured log line contains the full prompt/response or the `apiKey` (LR8)**.
- [ ] T018 [P] [US2] `RUNNER/test/unit/parse.test.ts` + `sanitize.test.ts` + `prompt.test.ts` — port the existing `analyze-repo` assertions for `extractJsonObject`/`parseLenient`/`coerceModelAnalysis`/`SalvageModelAnalysisSchema`/`sanitizeServed`/`sanitizeFrameworks`/`renderPrompt` unchanged.
- [ ] T019 [P] [US2] `RUNNER/test/unit/analyze-repo.test.ts` — mocked `chatComplete`: happy path → `complete`; invalid-then-valid → one retry; invalid-twice → salvage `partial` or `failed`; `verifyGrounding: true` → second call drops ungrounded; `input: { bundle }` → no repo file read (LR6, spy `fs`).
- [ ] T020 [P] [US2] `RUNNER/test/unit/agentic-fallback.test.ts` — mocked `chatComplete`: `MIN_AGENTIC_CONFIDENCE`/`isGenericInfraReasoning` filter; output shaped `foundBy:'agentic-fallback'`; `resolve-pairs` writes a schema-valid `architecture.extra-connections.json`.
- [ ] T021 [P] [US2] `RUNNER/test/unit/reachability.test.ts` — mocked `fetch`: reachable → resolves; 401 → resolves (creds not validated, matches current); timeout / ECONNREFUSED → `LocalModelUnreachableError`.
- [ ] T022 [P] [US2] `RUNNER/test/unit/cli.test.ts` — `analyze` fails fast on unreachable endpoint, writes nothing (LR5); per-repo failure logged, batch continues (LR3); `--from-bundles` path; skips valid-cached unless `--force-refresh`; atomic write (LR4 — assert no `.analysis.json` on a thrown mid-write).

### Implementation

- [ ] T023 [US2] `RUNNER/src/openai-client.ts` — `chatComplete(...)` per `contracts/local-runner-contract.md`: default `timeoutMs = 120_000` combined with any caller `signal` (LR7); never log the full prompt/response/`apiKey` (LR8); plus the hand-written `repo_analysis` JSON schema (research D9). Make T017 pass.
- [ ] T024 [P] [US2] `RUNNER/src/prompt.ts` — relocate `renderPrompt`, `GUIDANCE`, `MODEL_OUTPUT_SHAPE`, `detectedSection`, `dependencySection`, `section`, `RETRY_PREAMBLE` from `CORE/src/analysis/analyze-repo.ts` verbatim (import `AnalysisContext` from `@arch-atlas/llm-importer`). Make `prompt.test.ts` pass.
- [ ] T025 [P] [US2] `RUNNER/src/parse.ts` — relocate `extractJsonObject`, `parseLenient`, `coerceModelAnalysis`, `SalvageModelAnalysisSchema`, `EMPTY_SERVED`. Make `parse.test.ts` pass.
- [ ] T026 [P] [US2] `RUNNER/src/sanitize.ts` — relocate `sanitizeServed`, `sanitizeFrameworks`, `OPERATIONAL_PATH_RE`, `NON_FRAMEWORK_DEPS`. Make `sanitize.test.ts` pass.
- [ ] T027 [US2] `RUNNER/src/reachability.ts` — relocate `checkLocalModelReachable` + `LocalModelUnreachableError` from `CORE/src/model-runtime/local-model-runtime.ts` (already pi-free). Make T021 pass.
- [ ] T028 [US2] `RUNNER/src/analyze-repo.ts` — `analyzeRepoLocal(...)`: `renderPrompt` → `chatComplete` → `extractJsonObject` → `coerceModelAnalysis` → sanitize; one retry; salvage; optional `verifyGrounding`; `input` is a repo path (calls `gatherContext`) or a `{ bundle }`. Make T019 pass.
- [ ] T029 [US2] `RUNNER/src/agentic-fallback.ts` — relocate `agentic-correlator.ts` logic; `resolveUnresolvedPairs(...)` → `CrossRepositoryConnection[]`. Make T020 pass.
- [ ] T030 [US2] `RUNNER/src/config.ts` — `RunnerConfigSchema` (reads the shared `import.yaml`; `localModel` required). `RUNNER/src/index.ts` — public API re-exports.
- [ ] T031 [US2] `RUNNER/src/cli.ts` — `analyze <config>` + `resolve-pairs <config>` per contract (fail-fast reachability, `--repos`, `--force-refresh`, `--from-bundles`, atomic writes, per-repo continue). Make T022 pass.
- [ ] T032 [US2] `RUNNER/test/integration/live-analyze.integration.test.ts` — env-gated (`RUN_LIVE`); real endpoint; fixtures → `{repo}.analysis.json`; assert each validates and is within a field-level tolerance of `CORE/test/fixtures/analyses/{repo}.analysis.json`.

**Checkpoint**: US1 + US2 — a full offline pipeline works end to end with the bundled runner.

---

## Phase 5: User Story 3 — Claude Code skill (Priority: P2)

- [ ] T033 [P] [US3] `CORE/test/unit/skill-sample.test.ts` — `RepoAnalysisSchema.safeParse(sample).success`; `toCorrelationGraph(sample)` → `RepositoryKnowledgeGraphSchema` accepts; `SKILL.md` contains the schema field names + an "opt-in"/hosted-API caveat string. MUST fail (files absent).
- [ ] T034 [US3] Create `.claude/skills/repo-analysis/SKILL.md` (front-matter + procedure + inline `RepoAnalysis` schema, per `contracts/claude-skill-contract.md`), `README.md` (3-step walkthrough + offline-alternative note), `sample-analysis.json` (hand-authored, schema-valid). Make T033 pass.

---

## Phase 6: User Story 4 — bring-your-own producer (Priority: P2)

- [ ] T035 [P] [US4] `CORE/test/unit/producer-contract.test.ts` — a **hand-written** `RepoAnalysis` literal (imports no runner code) is accepted by `readAnalysis`/`runImport`; a `schemaVersion:'2.0'` one is rejected; a missing-`served` one is rejected; the hand-written one flows through `toCorrelationGraph` + `correlateDeterministically` and yields the expected connection for a 2-repo fixture. MUST fail if acceptance rules aren't wired (they are, from Phase 3 — this test formalises SC-004).
- [ ] T036 [US4] Finalise `contracts/analysis-producer-contract.md` wording against the shipped behaviour; link it from `CORE/README.md` and the skill README. (Docs task — no code.)

---

## Phase 7: User Story 5 — remove the agent SDK (Priority: P3)

**⚠️ Gate: T014/T031 green + T037 proof recorded + maintainer confirms (FR-018).**

- [ ] T037 [US5] Record the proof in `specs/010-*/proof.md`: model-free equivalence (T011), runner live parity (T032), eval baseline within tolerance (Phase 8), `npm ls @earendil-works/pi-coding-agent` output. Then **ask the maintainer to confirm removal.**
- [ ] T038 [US5] Delete `CORE/src/analysis/analyze-repo.ts`, `CORE/src/analysis/submit-analysis-tool.ts`, `CORE/src/model-runtime/local-model-runtime.ts` (whole dir if now empty), `CORE/src/correlate/agentic-correlator.ts`, and their `CORE/test/unit/*` tests.
- [ ] T039 [US5] `CORE/package.json` — remove `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`. `pnpm install` → lockfile shrinks. `grep -rn "@earendil-works\|typebox\|createAgentSession\|ModelRuntime" CORE/src` → empty.
- [ ] T040 [US5] `CORE/test/unit/*` — remove any remaining references (e.g. `run-import.test.ts` mocks of `analyzeRepo`, `local-model-runtime.test.ts`). `pnpm --filter @arch-atlas/llm-importer test lint typecheck build` all green.
- [ ] T041 [US5] Assert SC-002 in a test: `CORE/test/unit/no-agent-sdk.test.ts` reads `CORE/package.json` + walks `require.resolve` and fails if any `@earendil-works/*` is resolvable from the core.

---

## Phase 8: Polish & Proof

- [ ] T042 [US2] Rewire `CORE/test/eval/run.ts` — analyses via `@arch-atlas/analysis-runner-local` `analyzeRepoLocal`; judge via `chatComplete`; `correlateAgentically` → `resolveUnresolvedPairs`. Delete the pi imports.
- [ ] T043 [US2] Regenerate `CORE/test/eval/baseline.json` (`--set fixtures --set online-boutique`); confirm connection metrics within `TOLERANCE` (0.05) of the committed 009 baseline. Record deltas in `proof.md`.
- [ ] T044 [P] Docs: `CORE/README.md` (new pipeline: gather-context → producer → import; the 3 producer options), `RUNNER/README.md`, root `CHANGELOG.md` (010 entry), `SECURITY.md` (one line: shipped importer makes no external call; the repo-analysis skill is an opt-in hosted-API producer).
- [ ] T045 [P] `specs/010-*/security-review.md` — LLM-integration review (constitution IV): the skill only transmits the secret-scrubbed `ContextBundle` (CB1); the core has no external egress (CLI1); the runner's endpoint is user-configured and local (LR1), every request has a bounded timeout (LR7), and prompts/responses/`apiKey` are never logged in full (LR8).
- [ ] T046 Coverage: `pnpm --filter @arch-atlas/llm-importer test -- --coverage` and same for `RUNNER` — both ≥ 80% line/statement; add cases where short (esp. `openai-client.ts`, `cli.ts`).
- [ ] T047 Run `specs/010-*/quickstart.md` end to end as written (offline path + a live runner pass); fix any drift.
- [ ] T048 Final gate: `pnpm -r lint build test` (turbo) green; `git status` clean of stray output dirs / `tsbuildinfo`; `.gitignore` covers `*.context.json` / `architecture.extra-connections.json` under `architecture-output/` if the fixtures dir is real.

---

## Dependencies & order

- **Phase 1** T001→T002; T003/T004 [P].
- **Phase 2** T005→T006, T007→T008, T009 independent; T010 after T006+T008. **Blocks 3–7.**
- **Phase 3 (US1)** tests T011–T013 [P] → T014 → T015 → T016. MVP.
- **Phase 4 (US2)** tests T017–T022 [P] → impl T023–T031 (T024/T025/T026 [P] after T023; T028 after T023–T027; T031 after T028–T030) → T032.
- **Phase 5 (US3)** T033 → T034. Depends only on Phase 2 (schema) — can run alongside Phase 4.
- **Phase 6 (US4)** T035 → T036. Depends on Phase 3.
- **Phase 7 (US5)** after Phase 3 + Phase 4 + T037 proof + maintainer confirm.
- **Phase 8** T042/T043 after Phase 4; T044/T045 [P] after Phase 5; T046–T048 last.

## MVP

Phases 1 + 2 + 3 = the importer core is deterministic and model-free (US1). Ship/demo. Then Phase 4
restores turnkey local analysis, Phase 5 adds the Claude Code path, Phase 7 deletes the SDK.
