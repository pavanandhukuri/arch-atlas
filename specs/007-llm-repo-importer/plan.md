# Implementation Plan: Repository Architecture Importer (Agentic Local-Model Rewrite)

**Branch**: `007-llm-repo-importer` | **Revised**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-llm-repo-importer/spec.md` (revised for the agentic/local-model pipeline; all 3 `[NEEDS CLARIFICATION]` markers resolved).

## Summary

Full rewrite of `apps/llm-importer` from Python (Tree-sitter + Semgrep static extraction, single hosted/local LLM enrichment call) to TypeScript, built on the `pi` open-source coding-agent SDK (`@earendil-works/pi-coding-agent`). Each repository is analyzed by running Understand-Anything's actual `/understand` skill natively inside a pi session, backed by a user-supplied local model (Ollama/MLX-style endpoint only — no hosted API path). We vendor UA's skill, agent prompts, batching/merge scripts, and schema rather than hand-porting or reimplementing them, applying only three narrow headless-operation patches (research.md D2/D4) — UA's own orchestration, batching, and failure-tolerance logic runs as designed. A new hybrid (deterministic-then-agentic) cross-repository correlator — which does not exist in the reused skill — finds connections that span repositories. Output remains the same review-artifact schema Studio's import wizard already consumes; only the mechanism producing it changes. This is an immediate, full replacement: the Python pipeline is retired, not kept as a fallback.

**What is retired (Python, deleted)**: `extraction/` (manifest/tree-sitter/semgrep), `graph/` (networkx/Neo4j graph + old correlator), `enrichment/` (single hosted-or-local enrichment call), `session/session_manager.py`, `providers/` (Anthropic/Ollama/MLX/OpenAI HTTP clients — superseded by pi's own `ModelRuntime`).

**What is preserved conceptually (ported to TypeScript, schema unchanged)**: the review-artifact format (`ReviewFile`/`SystemGroup`/`ReviewCandidate`), the final `.arch.json` export contract, the CLI's config-file-driven invocation model, per-repo caching/incremental re-import (`--force-refresh`, `--aggregate-only`), and secret-path exclusion.

**What is newly built**: pi SDK integration (full-control `ResourceLoader`, local `ModelRuntime` config), a vendored copy of Understand-Anything's skill/agents/scripts patched for headless operation (research.md D4), a vendored/adapted subagent dispatcher so UA's "dispatch a subagent" instructions resolve to real isolated `pi` subprocesses (D3), an ingestion-time filter trimming UA's native output to the architecture-relevant subset we need (D10), the hybrid cross-repo correlator, the confidence bucket mapper, and a single shared concurrency limiter spanning both repo-level and UA's internal agent fan-out.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — matches monorepo convention), Node.js ≥ 22 (matches `pi`'s own stated minimum)
**Primary Dependencies**: `@earendil-works/pi-coding-agent` (SDK — `ModelRuntime`, `createAgentSession`, `DefaultResourceLoader`/custom `ResourceLoader`, `SessionManager`, `SettingsManager`), `@earendil-works/pi-ai` (`getModel`), `zod` (ingestion-time schema filter + config schema validation), `commander` (CLI, replaces Python `click`)
**Vendored assets** (not npm dependencies — copied source, patched in place, tracked as a drift risk in Constitution Check below): Understand-Anything's skill (`SKILL.md`, trimmed per research.md D4), its `project-scanner`/`file-analyzer`/`assemble-reviewer` agent definitions, its batching (`compute-batches.mjs`) and merge (`merge-batch-graphs.py`) scripts, its language/framework context files, and its graph schema (`schema.ts`); pi's official example subagent extension (`packages/coding-agent/examples/extensions/subagent/`), with its concurrency constants replaced by our shared limiter (D8)
**Runtime-adjacent dependency**: Python 3.11+ interpreter required at runtime — UA's own skill invokes the vendored `merge-batch-graphs.py` directly (D5); not a build/test dependency, only a runtime prerequisite for that one step
**Storage**: Local filesystem — per-repository `{name}.knowledge-graph.json` artifacts (successor to `.metadata.json`), final `.arch.json` and review artifact (unchanged format/location)
**Testing**: Vitest (matches monorepo convention; replaces `pytest`), ≥80% coverage per the constitution; deterministic-logic tests run with no live model, agent-session tests run against a mocked `ModelRuntime`/`createAgentSession`, a small opt-in integration suite runs against a real local Ollama instance when available (skipped otherwise) — see research.md D12
**Target Platform**: Local CLI, Node.js runtime, macOS/Linux (unchanged from prior revision)
**Project Type**: CLI / library package within the monorepo (unchanged shape from prior revision, new language)
**Performance Goals**: No fixed wall-clock target for a multi-repo run (spec NFR-001) — total time now depends on the user's local model/hardware. A per-repository agent session has a bounded timeout (configurable; default generous, mirroring the retired Python provider's 30-minute allowance for slow local reasoning models) after which it counts as a failure eligible for the one retry (FR-010a).
**Constraints**: No outbound call to any hosted/cloud LLM API under any configuration (FR-017); single shared concurrency limiter across repo-level and internal agent fan-out (FR-016); secret-path exclusions (FR-015) must be enforced at the agent's file-access tool layer, not just as a post-hoc filter
**Scale/Scope**: Config format supports up to 50 repositories per run (unchanged ceiling from prior revision), but this is a batch-size limit, not a runtime guarantee — see Performance Goals

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                                         | Status                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Product-Centered Monorepo Boundaries                           | PASS                                                 | Replaces `apps/llm-importer` in place (research.md D1); package boundary, ownership, and responsibility are unchanged from the prior revision, only the internals and language change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| II. Type Safety & Explicit Contracts at Boundaries                | PASS                                                 | TypeScript strict mode; every boundary (config file, knowledge-graph artifact, review artifact, `.arch.json`) has an explicit `zod` schema (research.md D10, D11). No `any`/unchecked casts at these boundaries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| III. Test-Driven Development (NON-NEGOTIABLE)                     | PASS (with a stated testing strategy)                | Deterministic stages are fully unit-testable without a live model; agent-session orchestration is unit-tested via a mocked `ModelRuntime`; ≥80% coverage is achievable without requiring a live local model in CI (research.md D12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| IV. Security & Privacy by Design                                  | PASS, exceeds baseline                               | This revision requires local-only model backends (FR-017) — no prompts, code, or derived architecture data ever leave the user's machine, which trivially satisfies (and exceeds) the constitution's "avoid sending secrets to external providers" bar, since there is no external provider at all. Secret-path exclusions (FR-015) are enforced at the agent's file-read tool layer (deny-list applied before the tool executes, not just filtered from output). Tool-call event logging must redact file contents by default (constitution: "log safely, redaction by default") since pi's event stream can include read-tool previews of source content.                                                                              |
| V. Latest Supported Versions & Supply-Chain Hygiene               | PASS, with tracked risk                              | Dependencies pinned via lockfile as usual. **Tracked risk (expanded after research.md D2 revision)**: two vendored asset trees now live in `vendor/` rather than being consumed as versioned package imports — pi's example subagent extension (D3) and, more substantially, Understand-Anything's skill/agents/scripts (D4, patched in three places for headless operation). Neither receives automatic upstream fixes; both must be manually re-diffed against their respective upstream releases periodically, and the `vendor/understand-anything` patches specifically must be re-applied (not just re-copied) on each UA update. Documented here, and `README.md` is required to document the re-diff process (Project Structure). |
| Repository Structure: "Python kept in clearly separated packages" | **Deviation — RETIRED by 008-bounded-repo-analysis** | research.md D13: two small vendored Python scripts (merge/normalize) lived inside the TypeScript package and ran as a subprocess. **No longer applies**: 008 replaced the vendored Understand-Anything skill (the only caller of those scripts) with a single bounded model call. The `vendor/` tree and the Python 3.11+ runtime prerequisite were removed; the importer now has no Python dependency at all.                                                                                                                                                                                                                                                                                                                           |

No unresolved gate failures. The one deviation (Repository Structure) is captured in Complexity Tracking below per the constitution's exception process ("Any exception... MUST be documented (what/why/risk/mitigation) and time-bounded").

## Project Structure

### Documentation (this feature)

```text
specs/007-llm-repo-importer/
├── plan.md              # This file
├── research.md          # Phase 0 output — 13 resolved design decisions (D1-D13)
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit.tasks — not produced by this command)
```

### Source Code (repository root)

```text
apps/llm-importer/                       # TypeScript package, replaces the Python package at the same path
├── vendor/
│   ├── understand-anything/             # Vendored UA assets, patched per research.md D4 — re-diffed against
│   │   ├── SKILL.md                     # Trimmed (no Phase 4/5), 3 headless patches (0.5 confirm, worktree
│   │   │                                 # redirect, dashboard launch) — diff against upstream tracked in README
│   │   ├── agents/
│   │   │   ├── project-scanner.md       # Vendored as-is
│   │   │   ├── file-analyzer.md         # Vendored as-is
│   │   │   └── assemble-reviewer.md     # Vendored as-is (deterministic inline-validate path only)
│   │   ├── compute-batches.mjs          # Vendored as-is
│   │   ├── merge-batch-graphs.py        # Vendored as-is — invoked BY the skill itself, not by our code (D5)
│   │   ├── languages/                   # Vendored language context files
│   │   ├── frameworks/                  # Vendored framework context files
│   │   └── schema.ts                    # UA's native graph schema — used for ingestion-time validation
│   └── pi-subagent/
│       ├── index.ts                     # Adapted from pi's example subagent extension (D3)
│       └── agents.ts                    # Adapted agent-discovery logic; concurrency reads from shared-limiter
├── src/
│   ├── cli.ts                           # CLI entrypoint (commander) — replaces cli.py
│   ├── config/
│   │   ├── loader.ts                    # Parse + validate YAML/JSON run config
│   │   └── config.schema.ts             # zod: repos[], localModel{endpoint,provider,modelId}, maxConcurrency, outputDir
│   ├── model-runtime/
│   │   └── local-model-runtime.ts       # Builds pi ModelRuntime from config.localModel (research.md D9)
│   ├── analysis/
│   │   ├── resource-loader.ts           # Explicit ResourceLoader wiring vendor/understand-anything + vendor/pi-subagent, no discovery (D6)
│   │   └── run-understand.ts            # Per-repo session launcher: createAgentSession(cwd=repo), invoke
│   │                                     # the vendored skill, retry-once-then-skip (FR-010a), copy
│   │                                     # knowledge-graph.json out of $UA_DIR and clean up (D4 adaptation 3)
│   ├── graph/
│   │   ├── schema.ts                    # Trimmed zod GraphNode/GraphEdge schema — ingestion-time filter (D10)
│   │   └── knowledge-graph-store.ts     # Read/write per-repo {name}.knowledge-graph.json artifacts
│   ├── correlate/
│   │   ├── deterministic-correlator.ts  # D7 pass 1 — literal identifier matching across repos
│   │   └── agentic-correlator.ts        # D7 pass 2 — bounded fallback for unresolved pairs
│   ├── confidence/
│   │   └── bucket-mapper.ts             # D11 — weight → high/medium/low, corroboration adjustment
│   ├── review/
│   │   ├── review-file.ts               # ReviewFile/SystemGroup/ReviewCandidate types — schema unchanged
│   │   └── assemble-review.ts           # Builds review artifact from graphs + correlated connections
│   ├── export/
│   │   └── diagram-builder.ts           # Builds final .arch.json — schema unchanged
│   └── concurrency/
│       └── shared-limiter.ts            # D8 — single semaphore shared by repo-level fan-out and the
│                                         # vendored subagent dispatcher's internal batch fan-out
├── test/
│   ├── unit/
│   │   ├── config-loader.test.ts
│   │   ├── deterministic-correlator.test.ts
│   │   ├── bucket-mapper.test.ts
│   │   ├── graph-schema-filter.test.ts
│   │   ├── run-understand.test.ts       # Mocked ModelRuntime/createAgentSession (D12) — retry/skip, copy/cleanup
│   │   └── review-assembly.test.ts
│   ├── integration/
│   │   ├── single-repo-analysis.integration.test.ts   # Runs the real vendored skill; skipped if no local model reachable (D12)
│   │   └── multi-repo-correlation.integration.test.ts
│   └── fixtures/
│       ├── repos/                       # Small sample repos with known cross-repo connections
│       └── knowledge-graphs/            # Pre-canned knowledge-graph.json fixtures
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md                            # Must document the vendored-asset diff-tracking process (Constitution Check)
```

**Structure Decision**: Single TypeScript package at `apps/llm-importer` (research.md D1), following this monorepo's existing `apps/*` convention and joining the shared `turbo run typecheck lint test` pipeline instead of a separate Python CI lane. A dedicated `vendor/` directory separates copied-and-patched third-party source (Understand-Anything's skill, pi's example subagent extension) from `src/`, which contains only code this project owns outright — this boundary exists specifically so the Constitution Check's tracked drift-risk (re-diffing vendored assets against upstream) has a clear, greppable surface rather than being scattered through the codebase. Internal module boundaries in `src/` mirror the pipeline stages named in `spec.md`'s Approach diagram (analysis → graph → correlate → review → export) so each stage remains independently testable, matching how the retired Python package was organized by pipeline stage.

## Complexity Tracking

| Violation                                                                                                                                              | Why Needed                                                                                                                                                                              | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python subprocess dependency inside an otherwise-TypeScript package (research.md D5, D13) — **RETIRED by 008**                                         | Reused UA's batch-merge/normalize logic without a risky reimplementation.                                                                                                               | Superseded: 008 removed the vendored UA skill entirely, so there is no longer any Python in this package to justify.                                                                                                                                                                                                                           |
| Vendored (not package-imported) copy of pi's example subagent extension (research.md D3)                                                               | pi does not publish its example extensions as an installable package; the only way to reuse the isolated-subprocess-dispatch logic is to copy and adapt the source                      | Depending on the user having it pre-installed under `~/.pi/agent/extensions/` was rejected (research.md D6) as non-reproducible; the tracked cost is manual re-sync against upstream `pi` changes, noted in the Constitution Check table above                                                                                                 |
| Vendored, patched copy of Understand-Anything's `SKILL.md` and agent definitions, run natively rather than reimplemented (research.md D2 revision, D4) | Reuses UA's already-tested multi-phase orchestration, batching, and failure-tolerance logic directly instead of maintaining a parallel, likely-worse reimplementation of the same thing | A from-scratch TypeScript orchestrator (the original D2) was built out in this plan's first draft and explicitly superseded once re-examined — it duplicated logic UA's own Error Handling section already provides (retry-once-then-skip-a-phase, always save partial results), for a reliability benefit that was more theoretical than real |
