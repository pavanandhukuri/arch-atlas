# Implementation Plan: Bounded Per-Repository Analysis

**Branch**: `008-bounded-repo-analysis` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-bounded-repo-analysis/spec.md`

## Summary

Replace the per-repository analysis stage of the `apps/llm-importer` pipeline. Today (007) each repository is analyzed by running a vendored copy of Understand-Anything's multi-phase `/understand` skill inside a local-model agent session; the deep knowledge graph it produces is almost entirely discarded downstream. This feature replaces that stage with a **single bounded, structured-output model call** per repository over a deterministically-gathered context (README(s), manifest file(s), a bounded directory listing, a few relevance-ranked source files). The call runs with no tools, one turn, and one retry on invalid output. Its result is persisted as a new `{repo}.analysis.json` artifact (`RepoAnalysis` schema) and mapped by a thin adapter into the exact in-memory graph shape the existing cross-repository correlator already consumes, so `correlate/*`, `confidence/*`, `review/*`, and `export/*` are not modified in behavior. Additively, each analyzed repository's container element in the exported `.arch.json` (and the review artifact — verified non-breaking for Studio's parser) gains a `description` and a `technology` label. Once implemented and proven end-to-end against both an expanded fixture workspace and one real multi-repository workspace with a live local model, the vendored Understand-Anything tree, the vendored subagent extension, the headless-operation babysitting logic (resource-loader reload/verify, persistence nudges, fabrication detection), their tests, and the Python runtime prerequisite are removed — **gated on maintainer confirmation**.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — monorepo convention), Node.js ≥ 22 (retained; the `pi` SDK is still used for the bounded call and the agentic correlator)
**Primary Dependencies**: `@earendil-works/pi-coding-agent` (`createAgentSession` with `tools: []`, single `session.prompt` — same pattern `src/correlate/agentic-correlator.ts` already uses), `@earendil-works/pi-ai` (`getModel` via the existing `model-runtime`), `zod` (new `RepoAnalysis` schema + existing config/graph schemas), `commander` (CLI — unchanged). **No package.json dependency is added or removed**; the removals in this feature are two vendored source trees and a runtime Python prerequisite, not npm packages.
**Storage**: Local filesystem — per-repository `{repo-name}.analysis.json` artifacts (replace 007's `{repo-name}.knowledge-graph.json`); review artifact (`architecture.review.yaml`) and final `.arch.json` unchanged in location and (except two additive optional fields) in schema.
**Testing**: Vitest, ≥80% statement/line coverage (constitution Definition of Done). Deterministic stages (context gathering, the `RepoAnalysis` schema, the correlation-graph adapter, the artifact store, the export enrichment) are fully unit-tested with no live model. The bounded call is unit-tested against a mocked `@earendil-works/pi-coding-agent` `createAgentSession` (mirroring `test/unit/agentic-correlator.test.ts`). One opt-in live integration test runs the real bounded call against a reachable local model, skipped otherwise — replacing 007's two vendored-skill integration tests.
**Target Platform**: Local CLI, Node.js runtime, macOS/Linux (unchanged).
**Project Type**: CLI / library package within the monorepo (`apps/llm-importer`), joining `turbo run typecheck lint test`.
**Performance Goals**: No fixed wall-clock target (spec NFR-001). Per repository: exactly one model call, plus at most one retry (spec NFR-002 — no "keep going" nudges). Context assembly is bounded by fixed caps on directory depth, file count, per-file bytes, and total bytes.
**Constraints**: No outbound call to any hosted/cloud model API under any configuration (007 FR-017 carries forward). No Python interpreter invoked or required at any point. Secret-path exclusions (008 FR-003, = the 007 FR-015 pattern list) enforced during context assembly — an excluded file is never read into the prompt. Total concurrent local-model load bounded by the existing single shared limiter. Analysis is best-effort consistent, not byte-deterministic; the correlation stage stays byte-deterministic given fixed artifacts.
**Scale/Scope**: Up to 50 repositories per run (unchanged config ceiling).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                                         | Status            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Product-Centered Monorepo Boundaries                           | PASS              | In-place change to `apps/llm-importer`; package boundary, ownership, and responsibility unchanged. No new cross-package reach-ins — `export/diagram-builder.ts` already imports `@arch-atlas/core-model` types; this feature only sets two fields that type already defines.                                                                                                                                                                                                                     |
| II. Type Safety & Explicit Contracts at Boundaries                | PASS              | New `zod` `RepoAnalysis` schema sits at two boundaries: the (untrusted) model response and the persisted artifact. The adapter's output is validated against the retained `RepositoryKnowledgeGraphSchema` before the correlator sees it. No `any`, no unchecked casts at these boundaries.                                                                                                                                                                                                      |
| III. Test-Driven Development (NON-NEGOTIABLE)                     | PASS              | Every deterministic unit (gather-context, schema, adapter, store, export enrichment) is testable with no model. The bounded call is tested at the same mocked-SDK boundary `agentic-correlator.test.ts` already uses. ≥80% coverage is reachable in CI with no live model. Tests are written before implementation per phase.                                                                                                                                                                    |
| IV. Security & Privacy by Design                                  | PASS, simplified  | Local-only model backend (no external provider at all). Secret-path exclusions move from an agent-tool deny-list to "not gathered into context in the first place" — a stricter, simpler control since analysis no longer performs arbitrary agent file reads. The model response is untrusted and only accepted after explicit schema validation (NFR-003). Logging risk drops: 007 redacted raw file previews from a tool-call event stream; this stage logs only validated structured fields. |
| V. Latest Supported Versions & Supply-Chain Hygiene               | PASS, improved    | Net reduction in third-party surface: two vendored source trees (`vendor/understand-anything`, `vendor/pi-subagent`) removed, along with the manual upstream re-diff obligation 007's Constitution Check tracked as a standing risk. No new dependencies.                                                                                                                                                                                                                                        |
| Repository Structure: "Python kept in clearly separated packages" | Deviation RETIRED | 007's documented deviation (a vendored Python merge script invoked as a subprocess inside a TypeScript package, plan.md D5/D13) is eliminated by this feature — no Python is bundled, invoked, or required after removal.                                                                                                                                                                                                                                                                        |

No gate failures. No new complexity to track — this feature removes a tracked risk and a documented deviation rather than adding either. Complexity Tracking table intentionally omitted.

## Project Structure

### Documentation (this feature)

```text
specs/008-bounded-repo-analysis/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — design decisions D1–D13
├── data-model.md        # Phase 1 output — entities & schemas
├── quickstart.md        # Phase 1 output — adapted from 007 (Python prereq removed)
├── contracts/           # Phase 1 output
│   ├── repo-analysis-schema.md       # The RepoAnalysis JSON contract (artifact + model output)
│   ├── analysis-call-contract.md     # Bounded-call input/output, retry & no-tools guarantees
│   ├── correlation-adapter-contract.md  # RepoAnalysis → RepositoryKnowledgeGraph mapping table
│   └── cli-contract.md               # Delta vs. 007's cli-contract (filenames, progress wording)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks — not produced here)
```

### Source Code (repository root)

```text
apps/llm-importer/
├── src/
│   ├── cli.ts                              # UNCHANGED (flags identical to 007)
│   ├── config/
│   │   ├── config.schema.ts                # UNCHANGED shape; `maxFilesPerRepo` doc note; `maxConcurrency` default 2→1 (Phase 9)
│   │   └── loader.ts                        # UNCHANGED
│   ├── model-runtime/
│   │   └── local-model-runtime.ts          # UNCHANGED
│   ├── concurrency/
│   │   └── shared-limiter.ts                # KEPT (repo-level fan-out + agentic fallback still use it)
│   ├── analysis/
│   │   ├── secret-paths.ts                 # KEPT (shared with evidence collector)
│   │   ├── repo-analysis.schema.ts         # NEW — zod RepoAnalysis (model output + persisted artifact)
│   │   ├── gather-context.ts               # NEW — deterministic bounded context assembly
│   │   ├── analyze-repo.ts                 # NEW — the one bounded call; replaces run-understand.ts
│   │   ├── analysis-store.ts               # NEW — read/write/validate {repo}.analysis.json + cache check
│   │   ├── to-correlation-graph.ts         # NEW — adapter: RepoAnalysis → RepositoryKnowledgeGraph
│   │   ├── run-import.ts                   # CHANGED — call analyzeRepo instead of runUnderstand;
│   │   │                                     write .analysis.json; pass analyses to buildDiagram
│   │   ├── run-understand.ts               # REMOVED in Phase 7 (gated)
│   │   ├── resource-loader.ts              # REMOVED in Phase 7 (gated)
│   │   └── secret-exclusion-extension.ts   # REMOVED in Phase 7 (gated)
│   ├── graph/
│   │   ├── schema.ts                       # KEPT as the correlator's in-memory input contract;
│   │   │                                     `filterToTrimmedSchema` + UA-superset comments removed in Phase 7
│   │   └── knowledge-graph-store.ts        # REMOVED in Phase 7 — superseded by analysis-store.ts
│   ├── correlate/
│   │   ├── evidence/**                     # UNCHANGED (collect.ts still reads `endpoint` nodes — the
│   │   │                                     adapter now produces them; no code change there)
│   │   ├── evidence-passes.ts              # UNCHANGED
│   │   ├── deterministic-correlator.ts     # UNCHANGED
│   │   └── agentic-correlator.ts           # UNCHANGED
│   ├── confidence/bucket-mapper.ts         # UNCHANGED
│   ├── review/
│   │   ├── review-file.ts                  # CHANGED — add optional `repos?: RepoMeta[]` to ReviewFile
│   │   └── assemble-review.ts              # CHANGED — populate `repos` from analyses (non-breaking for Studio)
│   └── export/
│       └── diagram-builder.ts              # CHANGED — set element.description + element.technology from analyses
├── test/
│   ├── unit/
│   │   ├── repo-analysis-schema.test.ts        # NEW
│   │   ├── gather-context.test.ts              # NEW (incl. planted-secret exclusion)
│   │   ├── analyze-repo.test.ts                # NEW (mocked createAgentSession — retry/skip, no-nudge)
│   │   ├── analysis-store.test.ts              # NEW (write/validate/cache; ignores 007-format files)
│   │   ├── to-correlation-graph.test.ts        # NEW (endpoint-node shape, edge mapping, schema-valid)
│   │   ├── diagram-builder.test.ts             # EXTENDED — description/technology on container elements
│   │   ├── review-assembly.test.ts             # EXTENDED — `repos` block present & non-breaking
│   │   ├── run-import.test.ts                  # UPDATED — analyzeRepo mock replaces runUnderstand mock
│   │   ├── run-understand.test.ts              # REMOVED in Phase 7
│   │   ├── resource-loader.test.ts             # REMOVED in Phase 7
│   │   └── secret-exclusion-extension.test.ts  # REMOVED in Phase 7
│   ├── integration/
│   │   ├── single-repo-analysis.integration.test.ts   # REWRITTEN — real bounded call vs. local model, else skip
│   │   └── multi-repo-correlation.integration.test.ts # UPDATED — bounded call, no vendored skill
│   └── fixtures/
│       ├── repos/                          # EXPANDED — 3–5 repo multi-language set (Go + TS, shared
│       │                                     topic, gateway-prefixed HTTP call, a database)
│       └── analyses/                       # NEW — pre-canned {repo}.analysis.json fixtures
├── vendor/
│   ├── understand-anything/                # REMOVED in Phase 7 (gated)
│   └── pi-subagent/                        # REMOVED in Phase 7 (gated)
├── package.json                           # CHANGED in Phase 7 — no scripts referencing vendored assets
├── quickstart-adjacent docs / README.md   # CHANGED in Phase 7 — Python prereq + vendored-asset section removed
└── (monorepo) turbo.json / pnpm-workspace  # UNCHANGED
```

**Structure Decision**: The pipeline-stage module layout established in 007 (`analysis → graph → correlate → confidence → review → export`) is preserved. All new code lands in `src/analysis/`, replacing `run-understand.ts` as the single point where a per-repository fact set is produced. `src/graph/schema.ts` is deliberately retained: its `RepositoryKnowledgeGraph`/`GraphNode`/`GraphEdge` types stop describing a persisted artifact and instead describe the correlator's in-memory input, which the new adapter constructs. This keeps every module under `src/correlate/` byte-for-byte unchanged — the central claim of the feature — while the honest, purpose-built `RepoAnalysis` shape is what users see on disk. Removal work is isolated to `vendor/` and a small set of now-orphaned `src/analysis/` + `src/graph/` files, all enumerated above and gated behind the proof step and maintainer confirmation.

## Phased Delivery (informs /speckit.tasks)

1. **Phase 1 — Setup**: fixtures/analyses dir, schema test scaffolding. No behavior change.
2. **Phase 2 — Foundational (US1 core, behind the seam)**: `repo-analysis.schema.ts`, `gather-context.ts`, `analyze-repo.ts`, `analysis-store.ts`, `to-correlation-graph.ts` — all TDD, none wired into `run-import.ts` yet. `runUnderstand` still runs.
3. **Phase 3 — US1 wiring**: swap `run-import.ts` to `analyzeRepo` + `analysis-store`; per-repo progress lines; single-repo path green end to end.
4. **Phase 4 — US2**: multi-repo fan-out through the shared limiter; confirm `correlate/*`/`review/*`/`export/*` pass unchanged against the adapter output; caching + `--force-refresh`/`--aggregate-only`/`--analyze-only`/`--repos`; partial-failure diagram. Expand `test/fixtures/repos/`.
5. **Phase 5 — US3**: `diagram-builder.ts` description/technology enrichment; `review-file.ts` + `assemble-review.ts` `repos` block (with a test proving Studio's `parseReviewYaml` still accepts the file).
6. **Phase 6 — Proof gate (US4 pre-req, FR-017)**: expanded-fixture integration run + one live `uds-sdk` run with a real local model; produce a written connection-set comparison vs. the 007 pipeline. **Present evidence, request maintainer confirmation.**
7. **Phase 7 — Removal (US4, gated on Phase 6 confirmation, FR-018/FR-019)**: delete `vendor/understand-anything/`, `vendor/pi-subagent/`, `run-understand.ts`, `resource-loader.ts`, `secret-exclusion-extension.ts`, `graph/knowledge-graph-store.ts`, `filterToTrimmedSchema`, and their tests; strip the Python prerequisite from `quickstart.md`/`README.md`/plan Technical Context; retire the D5/D13 deviation note; run full `turbo run typecheck lint test` + coverage.
8. **Phase 8 — Polish**: README rewrite, `CHANGELOG.md`, `security-review.md`, coverage sweep, quickstart re-run.
9. **Phase 9 — Reliability hardening (research.md D13, post-proof)**: per-kind context budgets + walk depth 4→12 (`context-limits.ts`, `gather-context.ts`); tolerant `extractJsonObject` (trailing commas / comments / truncation repair) + differentiated retry preamble + partial salvage (`analyze-repo.ts`); `analysis.maxConcurrency` default 2→1 (`config.schema.ts`). All TDD; verified with a second live `uds-sdk` run (4/4 vs. the earlier 2–3/4).
