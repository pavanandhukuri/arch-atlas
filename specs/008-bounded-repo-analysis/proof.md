# Proof Gate — Bounded Per-Repository Analysis

**Status**: fixture evidence complete; live `uds-sdk` run pending maintainer-provided workspace + local-model endpoint. **Phase 7 (removal of the vendored Understand-Anything tree) must not start until this document is complete and maintainer-approved.**

---

## What is in place

The bounded-analysis replacement is implemented behind the same seam the 007 pipeline used, and the entire cross-repository correlator, review assembly, and `.arch.json` export are **unmodified in behavior** (`src/correlate/**`, `src/confidence/**`, `src/review/assemble-review.ts` logic, `src/export/diagram-builder.ts` logic — only additive optional fields added).

| Piece                        | File                                                         | Tests                                                                                                                |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `RepoAnalysis` schema        | `src/analysis/repo-analysis.schema.ts`                       | `test/unit/repo-analysis-schema.test.ts` (8)                                                                         |
| Deterministic context gather | `src/analysis/gather-context.ts`                             | `test/unit/gather-context.test.ts` (7) — incl. planted-`.env` exclusion (SC-007)                                     |
| Bounded model call           | `src/analysis/analyze-repo.ts`                               | `test/unit/analyze-repo.test.ts` (9) — mocked SDK: 1 turn, `tools:[]`, ≤2 calls, no nudge text, retry-once-then-fail |
| Persisted artifact store     | `src/analysis/analysis-store.ts`                             | `test/unit/analysis-store.test.ts` (10) — incl. ignores 007 `*.knowledge-graph.json`                                 |
| Correlation adapter          | `src/analysis/to-correlation-graph.ts`                       | `test/unit/to-correlation-graph.test.ts` (8) — endpoint nodes round-trip through the real `parseEndpointRoute`       |
| Pipeline wiring              | `src/analysis/run-import.ts`                                 | `test/unit/run-import.test.ts` (9)                                                                                   |
| C4 enrichment                | `diagram-builder.ts`, `assemble-review.ts`, `review-file.ts` | `diagram-builder.test.ts` (+3), `review-assembly.test.ts` (+3)                                                       |
| End-to-end (stubbed model)   | —                                                            | `test/integration/pipeline-e2e.integration.test.ts`                                                                  |

Full suite: **204 passing, 2 skipped** (the two live-model integration tests). Coverage **96.05% statements / 83.1% branch** (gate: 80%). `tsc --noEmit` and `eslint` clean.

---

## Fixture workspace evidence (`test/fixtures/repos/`, no model)

A 4-service, 2-language workspace:

| Repo                   | Lang       | Serves                                                  | Consumes / calls                                              |
| ---------------------- | ---------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `user-service`         | TypeScript | `users` (Postgres); publishes `user-created`            | calls `notification-service` via `/api/notifications/v1/send` |
| `notification-service` | TypeScript | `POST /v1/send` (gateway-prefixed `/api/notifications`) | consumes `user-created`                                       |
| `audit-service`        | Go         | `POST /v1/audit`; `audit_log` (Postgres)                | consumes `user-created` (kafka-go `ReaderConfig{Topic:…}`)    |
| `gateway`              | TypeScript | `/api/users/*`, `/api/notifications/*`, `/api/audit/*`  | proxies to all three services                                 |

Running the full pipeline (`pipeline-e2e.integration.test.ts`) with the bounded model call stubbed to return the pre-canned `RepoAnalysis` fixtures, and the **real** evidence correlator over the fixture source on disk:

```
endpoint:    2 connection(s)
topic:       1 connection(s)
name-mention: 5 connection(s)
Deterministic pass: 8 connection(s), 2 pair(s) unresolved
```

Cross-repo connection set (source → target):

```
gateway -> audit-service            (endpoint: gateway proxy mount vs audit /v1/audit)
gateway -> notification-service     (endpoint: gateway probe /api/notifications/v1/send vs /v1/send)
gateway -> user-service             (name-mention: proxy target)
user-service -> gateway             (name-mention: "…through the API gateway" in analysis prose — low-value extra)
user-service -> notification-service (endpoint gateway-prefix + topic user-created pub→sub)
```

The gateway-prefixed HTTP match (`/api/notifications/v1/send` ↔ `/v1/send`) and the shared-topic match (`user-created` published by `user-service`, consumed by `notification-service`) — the two connection classes 007's live-run notes call out as the ones the pipeline must not regress on — are both recovered, and the endpoint match depends on the `endpoint` graph node the **adapter synthesised from the `RepoAnalysis`**, confirming FR-009.

`audit-service`'s `user-created` consumption is not recovered by the deterministic topic pass (Go kafka-go `Topic:` field, capital `T`, not matched by the topic literal extractor — pre-existing evidence-pass behavior, unchanged). This is exactly the residual the agentic fallback exists to cover; it is stubbed in this "no model" test.

No Python process is spawned and no `understand` skill is loaded anywhere in this run.

---

## Live `uds-sdk` run (T032) — 2026-08-30

**Workspace**: `/Users/…/uds-sdk`, 4 real services:

| Repo                              | Language                 | Analysed as                                               | Result                                                                                                                                                     |
| --------------------------------- | ------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consumer-mesh-signaling-service` | Go                       | Gin + Pion; 6 routes, 1 topic, redis                      | ✓ (attempt 0)                                                                                                                                              |
| `udssdk-notification-service`     | Go                       | gorilla/websocket + sarama + dd-trace; 3 routes, 2 topics | ✓ (attempt 0)                                                                                                                                              |
| `udssdk-multimodal-data-service`  | Java / Maven             | Spring Boot; 3 outbound intents                           | ✓ (attempt 0)                                                                                                                                              |
| `udssdk-llm-orchestrator-service` | Java / Maven (437 files) | Spring Boot; 8 routes, 9 outbound intents                 | failed both attempts on the full run; **succeeded cleanly on an isolated re-run** — non-deterministic (NFR-003), FR-014 partial diagram produced meanwhile |

**Model**: oMLX `Qwen3-Coder-30B-A3B-Instruct-MLX-4bit` (`openai-compatible`, `apiKey`) — the same model family as 007's T062/T075 runs. maxConcurrency 2. Wall clock: ~3.5 min for the 4-repo run.

### Cross-repository connections found

Evidence-grounded (deterministic, file:line-cited):

| #   | Edge                                                            | Pass                      | Confidence | Evidence                                                                                                                                            |
| --- | --------------------------------------------------------------- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `consumer-mesh-signaling-service → udssdk-notification-service` | endpoint (exact)          | medium     | `internal/server/signaling/server.go:414` references `/api/notifications/v1/publish` == notification-service's `POST /api/notifications/v1/publish` |
| 2   | `udssdk-multimodal-data-service → udssdk-notification-service`  | endpoint (gateway-prefix) | low        | 3× `…/rest/*ItTest.java` reference `/api/notification-orchestrator/v1/publish`, a gateway-prefixed variant of `/v1/publish`                         |
| 3   | `udssdk-llm-orchestrator-service → PostgreSQL`                  | compose                   | medium     | `docker-compose.yaml` runs `postgres:latest`                                                                                                        |
| 4   | `udssdk-multimodal-data-service → PostgreSQL`                   | compose                   | medium     | `docker-compose.yaml` runs `postgres:latest`                                                                                                        |

Agentic fallback (speculative, plainly reasoned as inference): 4 further `http`/`kafka` edges among the four services, all `medium`, none contradicting the evidence set.

### Comparison to prior tooling on this workspace

- **understand-everything's own linker** (`uds-sdk/.ue/link-report.json`, 2026-08-12): **0 edges / 0 candidates** across all five passes.
- **007's T075 note**: the arch-atlas importer on the 2-repo subset (`consumer-mesh-signaling-service` + `udssdk-notification-service`) found _"an evidence-correlation candidate with file:line reasoning"_ — that is **connection #1 above, reproduced exactly** by the bounded-call pipeline.
- 008 additionally recovers #2–#4 (the other two repos were not in the 007 subset).
- **008's evidence connection set ⊇ the known-correct set 007 produced** → **SC-002 satisfied**.

### No Python / no skill (SC-001, SC-006, FR-010)

- Run log (`--verbose`): zero occurrences of `skill` / `python` / `.ua` / `subagent` / `phase` / `understand`. Only `gathering context (N files, K KB)` → `calling model...` → `[done]`.
- Zero `.ua/` directories created or modified during the run (`find -newermt <run start>` → empty). The single pre-existing `.ua/` under `udssdk-multimodal-data-service` is dated **2026-08-11**, from an earlier unrelated Understand-Anything run.
- No stray script/driver files left in any analyzed repo (`git status --porcelain` clean apart from that pre-existing `.ua/`).
- `analyze-repo.ts` calls `createAgentSession({ tools: [] })` — no tool orchestration is structurally possible.

### Analysis quality

Genuine, not templated: each artifact has real routes with attributed `filePath`s, correct framework detection (Gin+Pion; gorilla/websocket+sarama+dd-trace; Spring Boot), and real outbound intents (`keycloak`, `kafka`, `zookeeper`). None of the "same boilerplate summary copy-pasted across unrelated files" pattern that 007's T075 `verifyGenuineAnalysis` was built to catch.

### Artifacts

`specs/008-bounded-repo-analysis/` is not the store; the run output lives at the scratchpad path used for the run:
`…/scratchpad/uds-sdk-008-output/{consumer-mesh-signaling-service,udssdk-notification-service,udssdk-multimodal-data-service,udssdk-llm-orchestrator-service}.analysis.json`, `architecture.review.yaml`, `architecture.arch.json`, plus `uds-sdk-run.log`.

---

## Gate decision

FR-017 proof is complete: the bounded-call pipeline runs end-to-end against a real multi-language workspace with a live local model, invokes no Python and loads no skill, and produces an evidence connection set that is a superset of what 007 produced for a comparable slice.

Maintainer confirmed; Phase 7 (removal) done — `vendor/`, the 007 orphan files, the T073–T075 hardening logic and the Python prerequisite are gone. Full monorepo `turbo run typecheck lint test` green (28/28).

---

## Reliability follow-up (post-removal) — 2026-08-30

The first `uds-sdk` runs had 1 repo failing analysis (flaky). Root-causing it against the live model surfaced concrete fixes (research.md D13):

| Fix                                                                                                                                                                                          | Before                                                            | After                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Context budgeting** — separate byte/count budgets for READMEs vs manifests vs source, so a README-heavy repo can't starve source excerpts                                                  | `udssdk-llm-orchestrator-service`: 14 READMEs, **0 source files** | 2 READMEs, **12 source files** (its `api/*Controller.java` classes)                                   |
| **Walk depth 4 → 12** — reach `src/main/java/<group>/<pkg…>/…` where Java/Kotlin code actually lives                                                                                         | Java services: **0 source files**                                 | `multimodal-data-service`: 0 → **5 served routes**; `llm-orchestrator`: analysis-fail → **22 routes** |
| **Tolerant JSON parse** — trailing commas, `//` / block comments, and truncated (unclosed) responses recovered by synthesising closers                                                       | strict `JSON.parse` on the first balanced `{…}`                   | recovers all three                                                                                    |
| **Differentiated retry** — the retry attempt prepends "your previous response could not be parsed; return ONLY the JSON object"                                                              | identical prompt resent                                           | stricter instruction on attempt 2                                                                     |
| **Partial acceptance** — a response with a good `description`/stack but malformed `served`/`outbound` is kept as `analysisStatus: "partial"` with those emptied, instead of failing the repo | whole repo failed                                                 | repo kept, correlation still runs (it reads raw source anyway)                                        |
| **Default `maxConcurrency` 2 → 1** — one local model serving two large-context 30B requests at once was returning unparseable output for one of them                                         | 3/4, 3/4, 2/4 across runs                                         | **4/4, 4/4** across two consecutive serial runs                                                       |

Final serial run (default config, 4 repos, ~1m50s): all four analyzed —
`consumer-mesh-signaling-service` (Gin, 8 routes), `udssdk-notification-service`
(gorilla/websocket, 3 routes), `udssdk-multimodal-data-service` (Spring Boot, 5
routes / 4 topics), `udssdk-llm-orchestrator-service` (Spring Boot, 22 routes / 6
outbound) — then 4 deterministic + 5 agentic cross-repo connections.

Analysis remains best-effort / non-deterministic (NFR-003): individual repos can
still produce a thin result on a given run, and the one-retry-then-skip +
partial-diagram path still backstops a hard failure.

---

## LLM quality follow-up (research.md D14) — 2026-08-30

After a second dogfood pass (the arch-atlas monorepo through the importer, then
its `review.yaml` through Studio's wizard) the LLM-derived output was noisy:
run-to-run interface variance, `frameworks` reporting `vitest`/`typescript`, and
the agentic fallback proposing "both repos use AWS / Keycloak" connections.

Re-run against `uds-sdk` after D14 (default config: temperature 0.1, detected
hints, framework denylist, tightened agentic):

|                                   | Before D14                                                                                  | After D14                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Repos analyzed                    | 4/4                                                                                         | 4/4                                                                  |
| `frameworks` values               | `Gin`, `Spring Boot`, `gorilla/websocket`, and stray `Next.js`/`Vitest` on other workspaces | `Gin`, `Spring Boot`, `gorilla/websocket`, `IBM/sarama` — no tooling |
| Deterministic connections         | 4 (endpoint + compose)                                                                      | 5 (endpoint 3 + compose 2)                                           |
| Agentic connections               | 4, all `medium`, mostly "both use X"                                                        | 2, both `low`, after the concrete-match + infra filter               |
| `/actuator/health` false positive | present                                                                                     | filtered by `sanitizeServed`                                         |

`analysis.structuredOutput: "tool"` (constrained sampling) was implemented and
unit-tested but a live one-repo run against oMLX did not finish in 5 minutes —
kept opt-in, default stays `"prompt"`.
