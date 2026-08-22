# Tasks: Repository Architecture Importer (Agentic Local-Model Rewrite)

**Revised**: 2026-07-25 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

**Language**: TypeScript 5.3.0 strict, Node.js ≥ 22, in `apps/llm-importer/` — replaces the Python package at the same path

**Tests**: Included. The constitution's Principle III ("Test-Driven Development — NON-NEGOTIABLE") and ≥80%-coverage Definition-of-Done gate apply to this feature, and research.md D12 commits to a specific testing strategy (mocked `ModelRuntime` for deterministic coverage, opt-in integration tests against a real local model). Write each test task before its corresponding implementation task and confirm it fails first.

**Organization**: Tasks are grouped by user story (spec.md P1–P4) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- File paths below are relative to `apps/llm-importer/` unless stated otherwise

---

## Phase 1: Setup

**Purpose**: Retire the Python package and stand up the new TypeScript package skeleton (research.md D1 — immediate, full replacement at the same path).

- [x] T001 Delete the retired Python source tree at `apps/llm-importer/` (`llm_importer/`, `tests/`, `pyproject.toml`, `Dockerfile`, `docker-run.sh`, `.venv/`, `samples/`) — confirm via `git status` that nothing else in the repo references these paths before removing
- [x] T002 Create the new package skeleton directories at `apps/llm-importer/`: `vendor/understand-anything/`, `vendor/pi-subagent/`, `src/{cli,config,model-runtime,analysis,graph,correlate,confidence,review,export,concurrency}/`, `test/{unit,integration,fixtures/repos,fixtures/knowledge-graphs}/` per plan.md Project Structure
- [x] T003 [P] Initialize `apps/llm-importer/package.json` — name `@arch-atlas/llm-importer`, dependencies `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `zod`, `commander`; devDependencies `vitest`, `typescript`, `@types/node`
- [x] T004 [P] Create `apps/llm-importer/tsconfig.json` — strict mode, `noUncheckedIndexedAccess`, ES2022 target (matches monorepo convention per CLAUDE.md)
- [x] T005 [P] Create `apps/llm-importer/vitest.config.ts` with an 80% coverage threshold configured (constitution Definition of Done)
- [x] T006 [P] Register `apps/llm-importer` in the monorepo's `pnpm-workspace.yaml` and `turbo.json` pipeline so `turbo run typecheck lint test` covers it
- [x] T007 [P] Configure eslint for `apps/llm-importer` matching the monorepo's existing TypeScript packages

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Vendored assets, config/model-runtime plumbing, and shared infrastructure every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 Vendor Understand-Anything's skill assets into `apps/llm-importer/vendor/understand-anything/`: `SKILL.md`, `agents/{project-scanner,file-analyzer,assemble-reviewer}.md`, `compute-batches.mjs`, `merge-batch-graphs.py`, `languages/`, `frameworks/`, `schema.ts`, copied from `Egonex-AI/Understand-Anything` at a pinned commit/tag recorded in T012's README (research.md D4)
- [x] T009 Apply the two structural headless patches to `vendor/understand-anything/SKILL.md`: replace Phase 0.5's "Wait for user confirmation before proceeding" (`.understandignore` generation) with automatic proceed, and remove the Phase 0 git-worktree redirect + Phase 7 dashboard auto-launch steps (research.md D4 adaptations 1–2)
- [x] T010 Trim `vendor/understand-anything/SKILL.md`'s phase sequence to remove Phase 4 (`architecture-analyzer`) and Phase 5 (`tour-builder`) and their agent dispatch instructions, renumbering remaining phase labels for clarity (research.md D4)
- [x] T011 [P] Vendor and adapt pi's example subagent extension into `apps/llm-importer/vendor/pi-subagent/index.ts` and `agents.ts` (research.md D3), replacing the hardcoded `MAX_CONCURRENCY`/`MAX_PARALLEL_TASKS` constants with values read from `src/concurrency/shared-limiter.ts` (T016)
- [x] T012 Document vendored-asset provenance in `apps/llm-importer/README.md`: source repo/commit for each of T008 and T011, the exact patches applied, and the re-diff process to follow on upstream updates (Constitution Check tracked-risk requirement)
- [x] T013 [P] Implement `src/config/config.schema.ts` — zod schema for `ImportConfig` v2.0 (`localModel`, `output`, `analysis` incl. `maxConcurrency`, `repositories`, max 50 entries) per `data-model.md` and `contracts/config-schema-contract.md`
- [x] T014 Implement `src/config/loader.ts` — parse and validate a YAML/JSON config file against T013's schema; reject a v1.0-shaped config (containing a `provider` block) with a clear, specific error naming the unsupported field (`contracts/config-schema-contract.md` Migration section)
- [x] T015 [P] Implement `src/model-runtime/local-model-runtime.ts` — build a pi `ModelRuntime` from `config.localModel` (`ollama`/`mlx`/`openai-compatible`), no code path that constructs a hosted-provider client (research.md D9, FR-017)
- [x] T016 [P] Implement `src/concurrency/shared-limiter.ts` — a single semaphore/pool, sized by `config.analysis.maxConcurrency`, acquired by both repo-level fan-out and the vendored subagent dispatcher's internal batch fan-out (research.md D8, FR-016)
- [x] T017 Implement `src/analysis/resource-loader.ts` — a full-control pi `ResourceLoader` wiring `vendor/understand-anything`'s skill/agents and `vendor/pi-subagent`'s extension explicitly, with no filesystem discovery of `~/.pi/agent/...` (research.md D6)
- [x] T018 Enforce the FR-015 secret-path exclusion list at the agent's file-access tool layer inside `src/analysis/resource-loader.ts` (deny-list applied to the `read`/`grep`/`find` tool configuration itself, not filtered from output after the fact) — constitution Principle IV
- [x] T019 Add log-event redaction for agent tool-call previews (file contents) in `src/analysis/resource-loader.ts` or a small wrapper around `session.subscribe` — constitution Principle IV ("log safely, redaction by default")
- [x] T020 [P] Implement `src/graph/schema.ts` — trimmed zod `GraphNode`/`GraphEdge` schema (research.md D10) applied as an ingestion-time filter over UA's native `.ua/knowledge-graph.json` output
- [x] T021 [P] Implement `src/graph/knowledge-graph-store.ts` — read/write `{repo-name}.knowledge-graph.json` artifacts per `data-model.md`'s `RepositoryKnowledgeGraph`, validating against T020's schema before persisting
- [x] T022 [P] Implement `src/review/review-file.ts` — `ReviewFile`/`SystemGroup`/`ReviewCandidate` types, field-for-field compatible with `apps/studio/src/lib/import/types.ts` (schema unchanged — spec's "Explicitly out of scope")
- [x] T023 Implement `src/cli.ts` skeleton — `commander` setup, `<config-file>` argument, wiring config loading (T014) and model-runtime construction (T015); command flags are wired incrementally in later phases

**Checkpoint**: Foundation ready — vendored skill runs headlessly, config/model-runtime/concurrency/schema plumbing exists, security controls are active. User story implementation can begin.

---

## Phase 3: User Story 1 — Single Repository Analysis (Priority: P1) 🎯 MVP

**Goal**: Run one agent-driven analysis session against a single repository and produce a valid, retry-tolerant knowledge-graph artifact — no hosted API call at any point.

**Independent Test**: Point the tool at one repository with known connections, using a configured local model. Verify the resulting `{repo}.knowledge-graph.json` lists each known connection with a recognizable type/target/weight, and that no outbound call to a hosted LLM API occurs.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail before implementing T028–T031.

- [x] T024 [P] [US1] Unit test `test/unit/run-understand.test.ts` — mocked `ModelRuntime`/`createAgentSession`: happy path produces a valid knowledge graph; malformed output triggers exactly one retry; a retry that also fails marks the repo `failed` and does not write an artifact (FR-010a)
- [x] T025 [P] [US1] Unit test `test/unit/graph-schema-filter.test.ts` — fixture UA-native JSON containing design/knowledge-base node and edge types (e.g. `page`, `token`, `article`) is filtered down to exactly the trimmed type set from research.md D10
- [x] T026 [P] [US1] Contract test `test/unit/knowledge-graph-artifact.test.ts` — the example JSON in `contracts/knowledge-graph-schema-contract.md` validates successfully against `src/graph/schema.ts`
- [x] T027 [P] [US1] Integration test `test/integration/single-repo-analysis.integration.test.ts` — runs the real vendored (trimmed, patched) skill against a real local Ollama model when `OLLAMA_HOST`/equivalent is reachable in the test environment; skipped otherwise (research.md D12)

### Implementation for User Story 1

- [x] T028 [US1] Implement `src/analysis/run-understand.ts` — per-repo session launcher: `createAgentSession({ cwd: repoPath, ... })` using T017's resource loader, invoke the vendored skill non-interactively, apply the one-retry-then-skip behavior (FR-010a), copy `knowledge-graph.json` out of `$UA_DIR` into the configured output directory via T021's store, and remove `.ua/` from the analyzed repository afterward (research.md D4 adaptation 3)
- [x] T029 [US1] Wire the single-repo path in `src/cli.ts`: load config → build model runtime → build resource loader → invoke `run-understand.ts` per repo → write the knowledge-graph artifact
- [x] T030 [US1] Implement per-repo progress reporting in `src/cli.ts` (FR-009) — phase-transition lines mirroring the vendored skill's own phase reports, per `contracts/cli-contract.md`'s Progress Output example
- [x] T031 [US1] Handle the no-detectable-connections case in `run-understand.ts`/`knowledge-graph-store.ts` — a repo with zero outbound connections produces a valid artifact with an empty `edges` list, not a failure (US1 acceptance scenario 3)
- [x] T032 [US1] Add `test/fixtures/repos/` (one small sample repo with 1–2 known outbound connections) and `test/fixtures/knowledge-graphs/` (corresponding pre-canned `knowledge-graph.json`) used by T024–T027

**Checkpoint**: User Story 1 is fully functional and independently testable — single-repo import produces a valid, retry-tolerant knowledge-graph artifact with zero outbound calls to any hosted API.

---

## Phase 4: User Story 2 — Multi-Repository Architecture Diagram (Priority: P2)

**Goal**: Analyze multiple repositories with centrally bounded concurrency, correlate connections that span repositories (hybrid deterministic-then-agentic), and assemble a complete diagram — with graceful partial-failure handling.

**Independent Test**: 3+ repositories with a known inter-service relationship (e.g. a shared Kafka topic). Verify the correlator finds it via the deterministic pass (or the agentic fallback if the deterministic pass can't resolve it), the relationship appears in the final diagram, and one repo's analysis failure still yields a partial diagram from the rest.

### Tests for User Story 2 ⚠️

- [x] T033 [P] [US2] Unit test `test/unit/deterministic-correlator.test.ts` — literal identifier matching (service name, port, topic, env var) across fixture knowledge graphs produces the expected `CrossRepositoryConnection`s (research.md D7 pass 1)
- [x] T034 [P] [US2] Unit test for `src/correlate/agentic-correlator.ts` (mocked local-model fallback) — confirms it is invoked _only_ for repo pairs the deterministic pass leaves unresolved, not for already-resolved pairs (research.md D7 pass 2)
- [x] T035 [P] [US2] Unit test `test/unit/bucket-mapper.test.ts` — weight→bucket thresholds (`≥0.8`→high, `0.5–0.79`→medium, `<0.5`→low), the deterministic-corroboration bump (capped at high), and the agentic-fallback cap (capped at medium) — research.md D11
- [x] T036 [P] [US2] Unit test `test/unit/review-assembly.test.ts` — `src/review/assemble-review.ts` combines N knowledge graphs + `CrossRepositoryConnection`s into a valid `ReviewFile`
- [x] T037 [P] [US2] Unit test for `src/export/diagram-builder.ts` — builds a final `.arch.json` from an assembled review artifact and validates it against `@arch-atlas/model-schema`
- [x] T038 [P] [US2] Unit test for `src/concurrency/shared-limiter.ts` under multi-repo load — confirms repo-level fan-out and the vendored subagent dispatcher's internal batch fan-out draw from one pool and never jointly exceed `maxConcurrency` (FR-016)
- [x] T039 [P] [US2] Integration test `test/integration/multi-repo-correlation.integration.test.ts` — 3 fixture repos with a known cross-repo connection, real vendored skill + real local model when reachable, else skipped

### Implementation for User Story 2

- [x] T040 [US2] Implement `src/correlate/deterministic-correlator.ts` (research.md D7 pass 1)
- [x] T041 [US2] Implement `src/correlate/agentic-correlator.ts` (research.md D7 pass 2) — bounded to the repo pairs T040 could not resolve, uses T015's local-model runtime with condensed per-repo summaries (not full graphs)
- [x] T042 [US2] Implement `src/confidence/bucket-mapper.ts` (research.md D11)
- [x] T043 [US2] Implement `src/review/assemble-review.ts` — combine knowledge graphs, `CrossRepositoryConnection`s, and T042's bucket mapping into a `ReviewFile` (T022's types)
- [x] T044 [US2] Implement `src/export/diagram-builder.ts` — `ReviewFile` → final `.arch.json` (schema unchanged from the retired revision)
- [x] T045 [US2] Wire multi-repo fan-out in `src/cli.ts` using `shared-limiter.ts` (T016) for repo-level concurrency (FR-016); extend T030's progress reporting to N repos plus a correlation-phase status line (`contracts/cli-contract.md`)
- [x] T046 [US2] Implement partial-diagram-on-failure handling in `src/cli.ts` (US2 acceptance scenario 3 / FR-010) — continue with successfully-analyzed repos, report failed repos clearly, still write a diagram if ≥1 repo succeeded
- [x] T047 [US2] Extend `test/fixtures/` with a 3-repo set containing a known cross-repo Kafka-topic connection, for T039

**Checkpoint**: User Stories 1 AND 2 both work independently — multi-repo import produces a correlated diagram with bounded concurrency and graceful partial failure.

---

## Phase 5: User Story 3 — Incremental Re-Import (Priority: P3)

**Goal**: Skip repositories with a valid existing knowledge-graph artifact by default; support `--force-refresh` and `--aggregate-only` for explicit override.

**Independent Test**: Re-run the tool against a repo set that was already fully imported — verify no repo is re-analyzed by default, `--force-refresh` re-analyzes everything, and `--aggregate-only` runs correlation/assembly/export with zero analysis sessions.

### Tests for User Story 3 ⚠️

- [x] T048 [P] [US3] Unit test for `knowledge-graph-store.ts`'s skip-if-exists check — a repo with a valid existing artifact is not re-analyzed on a normal run
- [x] T049 [P] [US3] Unit test confirming `--force-refresh` bypasses T048's skip check and re-analyzes regardless of cache state
- [x] T050 [P] [US3] Unit test confirming `--aggregate-only` triggers zero `run-understand.ts` invocations and runs only correlation + assembly + export against existing artifacts

### Implementation for User Story 3

- [x] T051 [US3] Implement skip-if-cached logic in the `src/cli.ts` run loop — check `knowledge-graph-store.ts` for a valid existing artifact per repo before invoking `run-understand.ts`
- [x] T052 [US3] Wire `--force-refresh` in `src/cli.ts` (bypasses T051's skip check)
- [x] T053 [US3] Wire `--aggregate-only` in `src/cli.ts` — load all existing knowledge-graph artifacts, skip analysis entirely, run T040–T044 only
- [x] T054 [US3] Wire `--analyze-only` in `src/cli.ts` — run per-repo analysis only, skip correlation/assembly/export (`contracts/cli-contract.md`)
- [x] T055 [US3] Wire `--repos <names>` in `src/cli.ts` — filter which configured repos are processed by any of the above

**Checkpoint**: User Stories 1, 2, AND 3 all work independently — re-imports are cheap by default, override flags behave as documented.

---

## Phase 6: User Story 4 — Local Model Configuration (Priority: P4)

**Goal**: Fail fast and clearly when the configured local model endpoint is unreachable, before any repository analysis begins; guarantee no configuration path results in a hosted-API call.

**Independent Test**: Configure an unreachable endpoint — verify the run aborts immediately with a clear error and exit code 2, before touching any repository. Configure a reachable endpoint with a specific `modelId` — verify that model is used for every analysis and correlation call in the run.

### Tests for User Story 4 ⚠️

- [x] T056 [P] [US4] Unit test for `local-model-runtime.ts`'s reachability check — reachable vs. unreachable endpoint (US4 acceptance scenario 2)
- [x] T057 [P] [US4] Unit test confirming `config.schema.ts` has no field shape that could carry hosted-provider credentials (characterizes FR-017 at the config-contract level)
- [x] T058 [P] [US4] Unit test confirming no code path in `local-model-runtime.ts`/`resource-loader.ts` constructs an outbound hosted-API client under any valid config permutation (FR-017)

### Implementation for User Story 4

- [x] T059 [US4] Wire the startup reachability check into `src/cli.ts` — validate `localModel.endpoint` + `modelId` before any repository analysis begins (US4 acceptance scenario 2), exit code `2` on failure per `contracts/cli-contract.md`
- [x] T060 [US4] Wire `--max-concurrency <n>` CLI override in `src/cli.ts` (overrides `config.analysis.maxConcurrency`, feeds T016's shared limiter)
- [x] T061 [US4] Print the local-model reachability confirmation banner in `src/cli.ts` (`contracts/cli-contract.md`'s "Checking local model endpoint..." / "✓ Model ... is available" output)

**Checkpoint**: All four user stories are independently functional.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T062 [P] Run `quickstart.md` end-to-end against a real local Ollama instance and correct any drift between the documented steps and actual CLI behavior
- [x] T063 [P] Verify ≥80% test coverage across `apps/llm-importer` (constitution Definition of Done); add tests to close any gaps found
- [x] T064 [P] Confirm `apps/llm-importer` runs cleanly under `turbo run typecheck lint test` alongside the rest of the monorepo (plan.md Structure Decision)
- [x] T065 Security review pass: confirm T018's secret-path exclusions are enforced at the tool-permission layer (not post-hoc filtering), confirm T019's log redaction is effective, and document both in the PR description per the constitution's requirement for explicit security review on data-import-related changes
- [x] T066 [P] Final cleanup verification — confirm no orphaned Python artifacts (`pyproject.toml`, `.venv/`, `__pycache__/`, old `tests/`) remain anywhere under `apps/llm-importer` after T001

---

## Phase: Evidence-Grounded Correlation (2026-08-22 revision)

**Purpose**: Replace the FR-006 deterministic matcher's name-substring heuristic with
evidence-grounded passes over raw repository source, ported from the
understand-everything project's cross-repo linker core (developed and tested against
Understand-Anything workspaces). Motivation: validated against a real 5-repo
workspace (uds-sdk), the name-mention matcher found 0 connections while the ported
passes found every known cross-repo connection — including one a hosted-model agent
had also missed — in <100ms with zero model calls.

- [x] T067 Extract the FR-015 secret-path pattern list into `src/analysis/secret-paths.ts`, shared by the tool-call extension and the new evidence collector (single source of truth)
- [x] T068 Port the evidence parsers into `src/correlate/evidence/parsers/` — manifests (npm/pyproject/go.mod/Cargo/pom/gradle), routes (URL-literal extraction, method hints, normalization, gateway-prefix suffix matching with a concrete-segment-agreement requirement, OIDC third-party path exclusion), schemas (proto/GraphQL/OpenAPI digests), compose, topics — with unit tests
- [x] T069 Implement `src/correlate/evidence/collect.ts` — bounded repository walk (depth/file-count/size caps) applying the FR-015 exclusions, resolving repo roots from the artifact's recorded path and degrading to graph-only correlation when a path is unavailable — with unit tests against the fixture repos (including a planted `.env` proving exclusion)
- [x] T070 Implement `src/correlate/evidence-passes.ts` — manifest, endpoint (exact + gateway-suffix + literal-vs-literal fallback), schema (identical copy, proto drift, OpenAPI client coverage), compose (repo image/build-context mapping, service depends_on/env wiring, well-known external systems such as PostgreSQL/Kafka/Keycloak), and topic passes, each emitting evidenced `CrossRepositoryConnection`s at calibrated weights — with unit tests per pass
- [x] T071 Rewire `correlateDeterministically` — evidence passes run first with per-pass failure isolation, the original name-mention matcher is retained as the final pass, `foundBy: 'evidence'` maps to a new no-bump `evidence-correlation` confidence source, pass summaries surface in `runImport`'s progress output, and a pair is unresolved (agentic-fallback input) only when no pass connects it in either direction
- [x] T072 Integration coverage: fixture repos extended with a gateway-prefixed HTTP call (`/api/notifications/v1/send` vs `/v1/send`), correlation asserted end-to-end against real fixture source including byte-determinism across runs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately (T001 should run first; T002–T007 depend on T001 having cleared the path)
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase completion
  - US1 → US2 → US3 → US4 in priority order is the recommended sequential path, since US2's correlator consumes US1's per-repo artifacts, US3's caching wraps US1/US2's run loop, and US4 hardens the model-runtime plumbing US1 already depends on minimally
  - US2, US3, and US4 could be staffed in parallel once US1 is stable, since each touches a distinct module set (correlate/confidence/review/export for US2; cli.ts flags + knowledge-graph-store for US3; model-runtime + cli.ts startup check for US4) — see Parallel Team Strategy below
- **Polish (Final Phase)**: Depends on all four user stories being complete

### Within Each User Story

- Tests (T024–T027, T033–T039, T048–T050, T056–T058) MUST be written and FAIL before their corresponding implementation tasks
- Within Phase 2, schema/config/model-runtime/limiter tasks (T013, T015, T016, T020) can run in parallel with each other but must all complete before T017 (resource loader wires them together)
- Implementation before integration within each story (e.g. T040–T044 before T045's wiring in US2)
- Story complete (checkpoint reached) before starting the next priority's implementation, if working sequentially

### Parallel Opportunities

- All Setup tasks marked [P] (T003–T007) can run in parallel once T001–T002 complete
- Within Foundational: T011, T013, T015, T016, T020, T021, T022 are all [P] — different files, no cross-dependencies among themselves
- Once Foundational completes, all four user stories' test tasks marked [P] can be written in parallel
- Different user stories (US2, US3, US4) can be worked on in parallel by different contributors once US1 is stable, per the note under Phase Dependencies

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (write first, confirm they fail):
Task: "Unit test test/unit/run-understand.test.ts"
Task: "Unit test test/unit/graph-schema-filter.test.ts"
Task: "Contract test test/unit/knowledge-graph-artifact.test.ts"
Task: "Integration test test/integration/single-repo-analysis.integration.test.ts"
```

## Parallel Example: Foundational Phase

```bash
# These five have no dependencies on each other:
Task: "Implement src/config/config.schema.ts"
Task: "Implement src/model-runtime/local-model-runtime.ts"
Task: "Implement src/concurrency/shared-limiter.ts"
Task: "Implement src/graph/schema.ts"
Task: "Implement src/review/review-file.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (retire Python, stand up TS skeleton)
2. Complete Phase 2: Foundational (CRITICAL — vendored skill + patches + config/model-runtime/limiter/schema plumbing)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run the independent test — single repo, known connections, no cloud call
5. Demo if ready — this alone replaces the retired pipeline's single-repo use case

### Incremental Delivery

1. Setup + Foundational → foundation ready (vendored skill runs headlessly against one repo)
2. Add US1 → validate independently → MVP demo
3. Add US2 → validate independently (multi-repo + correlation) → demo
4. Add US3 → validate independently (incremental re-import) → demo
5. Add US4 → validate independently (fail-fast local model config) → demo
6. Polish phase → coverage/lint/security/quickstart sign-off

### Parallel Team Strategy

1. Team completes Setup + Foundational together (Phase 2's vendoring/patching work, T008–T012, benefits from one owner to avoid merge conflicts on `SKILL.md`)
2. Once Foundational is done and US1 is stable:
   - Developer A: US2 (correlate/confidence/review/export modules)
   - Developer B: US3 (cli.ts flags + knowledge-graph-store caching)
   - Developer C: US4 (model-runtime hardening + cli.ts startup check)
3. Stories integrate at `src/cli.ts`, which is the one file all three touch — coordinate on that file specifically, everything else is disjoint

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- `vendor/understand-anything/SKILL.md` (T008–T010) is the one file with the highest coordination cost — patches must be re-applied (not just re-copied) on every upstream UA sync (research.md D4, plan.md Constitution Check tracked risk)
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
