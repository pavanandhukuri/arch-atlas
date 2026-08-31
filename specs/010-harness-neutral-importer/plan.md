# Implementation Plan: Harness-Neutral Importer

**Branch**: `010-harness-neutral-importer` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-harness-neutral-importer/spec.md`

## Summary

`apps/llm-importer` bundles one specific agent framework (`@earendil-works/pi-coding-agent` +
`pi-ai`). Post-008 that dependency is nearly vestigial — 3 runtime files, each doing a single chat
completion. This feature removes it and splits the tool cleanly:

- **The importer core** (`apps/llm-importer`) becomes **deterministic and model-free**: it gathers a
  bounded per-repo context, reads pre-produced `{repo}.analysis.json` artifacts, runs the unchanged
  cross-repo correlation (incl. 009's `grpcPass`), assembles the review artifact, and exports the
  diagram. No model call, no network, no agent-framework dependency. It also gains a `gather-context`
  subcommand that serializes the context bundle a producer needs.
- **The per-repo analysis step** moves to swappable, in-repo **producers**, none of which the core
  depends on:
  - `packages/analysis-runner-local` — a new workspace package: a reference local-model runner
    (minimal OpenAI-compatible client + the relocated prompt / tolerant-parse / retry / salvage /
    sanitize logic from `analyze-repo.ts`). Local-only. Also carries the relocated agentic
    cross-repo fallback as an optional step that writes `architecture.extra-connections.json`.
  - `.claude/skills/repo-analysis/` — a Claude Code skill that produces a schema-valid
    `{repo}.analysis.json` from a repo path or a context bundle. Documented as the hosted-API opt-in.
  - Contract docs: `RepoAnalysisSchema` + the new `ContextBundleSchema` are the whole contract.

Net effect: the importer core's dependency tree loses `@earendil-works/pi-coding-agent`,
`@earendil-works/pi-ai`, and `typebox`; it gains no runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node.js ≥ 22 — monorepo convention
**Primary Dependencies**:

- `apps/llm-importer` (core) after this change: `zod`, `js-yaml`, `commander`, workspace `@arch-atlas/core-model` + `@arch-atlas/layout`. **Removed**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`.
- `packages/analysis-runner-local` (new): `zod`, `js-yaml`, `commander`, workspace `@arch-atlas/llm-importer` (for `gatherContext`, the schemas, the context-bundle codec). Model transport = global `fetch` (Node ≥ 22) — no HTTP dependency. No `zod-to-json-schema`: the `structuredOutput: 'tool'` JSON schema is hand-written to mirror `ModelAnalysisSchema`.
  **Storage**: Local filesystem — `{repo}.analysis.json` (unchanged), `{repo}.context.json` (new, gitignored by users), `architecture.extra-connections.json` (new, optional), `architecture.review.yaml` + `architecture.arch.json` (unchanged).
  **Testing**: `vitest` per project. Core: model-free pipeline test over `test/fixtures/analyses/*.json`; contract test that hand-written artifacts are accepted. Runner: mocked-`fetch` unit tests + one opt-in live integration test. Skill: a committed `sample-analysis.json` validated against `RepoAnalysisSchema`.
  **Target Platform**: Node.js CLI, local execution.
  **Project Type**: Monorepo — one app (`apps/llm-importer`) reworked, one new library package (`packages/analysis-runner-local`), one repo-local skill directory.
  **Performance Goals**: The core is now pure file IO + in-memory correlation — sub-second on the fixtures. The runner's cost is unchanged (one bounded call per repo).
  **Constraints**: core makes **no** model/network call under any config; runner is local-only; correlation stays byte-deterministic given fixed artifacts; TDD; ≥ 80% coverage for every changed/added project.
  **Scale/Scope**: workspaces of ≤ 50 repos (existing config cap). ~4 files deleted from the core, ~2 added; ~10 files in the new package; ~3 files in the skill.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                                   | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Product-Centered Monorepo Boundaries**                 | The core keeps its responsibility (deterministic import) and gains a real public entrypoint (`src/index.ts` + `exports` map) exposing only the contract surface — `gatherContext`, `AnalysisContext` & friends, `RepoAnalysisSchema`, the context-bundle codec, `correlateDeterministically` types. `packages/analysis-runner-local` has one clear responsibility (produce analysis artifacts from a local model) and depends on the core **through that entrypoint only** — no deep imports. The skill is repo tooling. | PASS   |
| **II. Type Safety & Explicit Contracts at Boundaries**      | The producer↔core boundary becomes two explicit, `zod`-validated schemas: `RepoAnalysisSchema` (unchanged) and the new `ContextBundleSchema`. The optional agentic connections file gets `ExtraConnectionsSchema` (a narrowed `CrossRepositoryConnection`). Strict TS throughout; no `any`.                                                                                                                                                                                                                              | PASS   |
| **III. Test-Driven Development (NON-NEGOTIABLE)**           | tasks.md orders every code task after a failing test. Core: model-free pipeline equivalence, malformed/missing-artifact skip, determinism, config-ignores-localModel. Runner: prompt shape, streaming accumulation, tolerant parse, one-retry, salvage, sanitize, reachability, agentic-fallback → extra-connections file. Contract: hand-written artifact accepted with no runner code.                                                                                                                                 | PASS   |
| **IV. Security & Privacy by Design**                        | The core **loses all network capability** — a strict improvement. The runner is local-only (FR-008), reuses the unchanged secret-path exclusions (FR-005) so a context bundle never carries excluded content. The Claude Code skill is a hosted-API path: it only ever transmits the already-secret-scrubbed context bundle; documented in `security-review.md` and flagged in the skill README. `SECURITY.md` gets a one-line note that the shipped importer makes no external call and the skill is opt-in.            | PASS   |
| **V. Latest Supported Versions & Supply-Chain Hygiene**     | Net removal of 3 dependencies from the core (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `typebox`) and their transitive trees; the new package adds **zero** runtime dependencies (uses `fetch`, `zod`, `js-yaml`, `commander` already in the monorepo). Lockfile shrinks.                                                                                                                                                                                                                              | PASS   |
| **Quality gate: ≥ 80% coverage per changed project**        | Enforced by each project's `vitest` coverage config; the relocated logic keeps its existing tests (moved with it).                                                                                                                                                                                                                                                                                                                                                                                                       | PASS   |
| **Quality gate: OSS hygiene / CHANGELOG / security review** | Root `CHANGELOG.md`, `apps/llm-importer/README.md`, `packages/analysis-runner-local/README.md`, `.claude/skills/repo-analysis/README.md`, `SECURITY.md` note, and `specs/010-*/security-review.md` all in the Polish phase.                                                                                                                                                                                                                                                                                              | PASS   |

No violations. **Complexity Tracking** notes one deliberate, minimal choice (below); nothing to justify as a violation.

### Post-Design Re-check (after Phase 1)

The design keeps `RepoAnalysisSchema`, the review-artifact schema, and the diagram schema untouched
(FR-015); `correlate/**`, `confidence/**`, `review/**`, `export/**` logic is not modified (FR-014);
Studio is not touched. The one structural addition — the core app exposing a library entrypoint — is
the smallest way to let the runner reuse `gatherContext` without a third "importer-core" package.
Re-check: **PASS**, Complexity Tracking unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/010-harness-neutral-importer/
├── plan.md
├── research.md          # D1–D12: seam shape, context-bundle format, relocation, agentic fallback, config, eval rewire, removal order
├── data-model.md        # ContextBundle, ExtraConnections, config deltas, the (unchanged) RepoAnalysis
├── quickstart.md        # the 3 producer paths + the model-free run
├── contracts/
│   ├── context-bundle-contract.md       # ContextBundleSchema + `gather-context` subcommand + `serializeContextBundle`/`readContextBundle`
│   ├── analysis-producer-contract.md     # what any producer must emit; the RepoAnalysis schema restated as the boundary; acceptance rules
│   ├── importer-core-cli-contract.md     # `import` (aggregate-only default), `gather-context`; removed flags; exit codes; extra-connections merge
│   ├── local-runner-contract.md          # `packages/analysis-runner-local` CLI + public API + config
│   └── claude-skill-contract.md          # `.claude/skills/repo-analysis` inputs/outputs + the opt-in framing
├── checklists/requirements.md
├── proof.md             # filled during implementation — model-free equivalence, runner parity, eval baseline delta
├── security-review.md   # LLM-integration review for the skill + the "core makes no external call" assertion
└── tasks.md             # /speckit.tasks output
```

### Source Code (repository root)

```text
apps/llm-importer/
├── package.json                         # MODIFIED — drop @earendil-works/*, typebox; add `exports`; add devDep on @arch-atlas/analysis-runner-local (eval only)
├── src/
│   ├── index.ts                         # NEW — public entrypoint: gatherContext, AnalysisContext/ContextFile/SourceExcerpt/DependencySplit/DetectedInterfaces, RepoAnalysisSchema + types, serializeContextBundle/readContextBundle/ContextBundleSchema, analysis-store fns, correlate/deterministic types, toCorrelationGraph
│   ├── cli.ts                           # MODIFIED — remove --analyze-only + reachability gate + LocalModelUnreachableError path; add `gather-context <config> [--out]` subcommand; `import` runs aggregate-only
│   ├── analysis/
│   │   ├── run-import.ts                # MODIFIED — aggregate-only is the only path; no buildLocalModelRuntime / analyzeRepo / correlateAgentically; merge optional architecture.extra-connections.json before assembleReviewFile
│   │   ├── context-bundle.ts            # NEW — ContextBundleSchema (zod) + serializeContextBundle(ctx)/readContextBundle(path); a bundle is gatherContext() output serialised verbatim
│   │   ├── gather-context.ts            # UNCHANGED logic (re-exported via index.ts)
│   │   ├── analysis-store.ts            # UNCHANGED
│   │   ├── repo-analysis.schema.ts      # UNCHANGED
│   │   ├── analyze-repo.ts              # DELETED (removal phase) — relocated to the runner
│   │   └── submit-analysis-tool.ts      # DELETED — relocated (as hand-written JSON schema) to the runner
│   ├── correlate/
│   │   ├── evidence/** , evidence-passes.ts, deterministic-correlator.ts   # UNCHANGED
│   │   ├── agentic-correlator.ts        # DELETED from core — relocated to the runner
│   │   └── extra-connections.ts         # NEW — ExtraConnectionsSchema + readExtraConnections(dir): CrossRepositoryConnection[] (foundBy:'agentic-fallback' only), tolerant of an absent file
│   ├── model-runtime/
│   │   └── local-model-runtime.ts       # DELETED — pi ModelRuntime + withSamplingDefaults gone; checkLocalModelReachable relocated to the runner
│   └── config/config.schema.ts          # MODIFIED — `localModel` becomes .optional() and is ignored by the core; keep `analysis.{maxFilesPerRepo,excludePatterns}` (context-gather knobs); the runner reads `localModel` + the model knobs from the same file
└── test/
    ├── integration/model-free-pipeline.integration.test.ts   # NEW — import over fixtures/analyses/*, assert review+diagram equivalence + zero network
    ├── unit/extra-connections.test.ts   # NEW
    ├── unit/context-bundle.test.ts      # NEW
    ├── unit/cli.test.ts / run-import.test.ts   # MODIFIED — drop analyze/agentic paths
    ├── eval/run.ts                       # MODIFIED — analyses come from @arch-atlas/analysis-runner-local; judge uses its chat client; baseline regenerated
    └── unit/{analyze-repo,submit-analysis-tool,local-model-runtime,agentic-correlator}.test.ts   # DELETED / relocated

packages/analysis-runner-local/          # NEW — @arch-atlas/analysis-runner-local
├── package.json                         # deps: zod, js-yaml, commander, @arch-atlas/llm-importer (workspace)
├── src/
│   ├── index.ts                         # public API: analyzeRepoLocal(opts), resolveUnresolvedPairs(opts), chatComplete(opts), checkLocalModelReachable
│   ├── openai-client.ts                 # minimal fetch client: POST {endpoint}/chat/completions, SSE stream accumulation, temperature, apiKey, response_format
│   ├── prompt.ts                        # relocated renderPrompt + GUIDANCE + MODEL_OUTPUT_SHAPE + detectedSection + dependencySection
│   ├── parse.ts                         # relocated extractJsonObject + parseLenient + coerceModelAnalysis + SalvageModelAnalysisSchema
│   ├── sanitize.ts                      # relocated sanitizeServed + sanitizeFrameworks (+ OPERATIONAL_PATH_RE, NON_FRAMEWORK_DEPS)
│   ├── analyze-repo.ts                  # relocated analyzeRepo (runOnce, verifyGrounding) — now calls openai-client; input is a repo path OR a context bundle
│   ├── agentic-fallback.ts             # relocated agentic-correlator logic → returns CrossRepositoryConnection[]; CLI writes architecture.extra-connections.json
│   ├── reachability.ts                  # relocated checkLocalModelReachable + LocalModelUnreachableError
│   ├── config.ts                        # RunnerConfigSchema (localModel + analysis knobs), reads the shared import.yaml
│   └── cli.ts                           # `analysis-runner-local analyze <config> [--repos] [--force-refresh]`, `... resolve-pairs <config>`
└── test/
    ├── unit/{openai-client,parse,sanitize,prompt,analyze-repo,agentic-fallback,reachability}.test.ts   # mocked fetch
    └── integration/live-analyze.integration.test.ts   # opt-in (env-gated), real local endpoint

.claude/skills/repo-analysis/            # NEW
├── SKILL.md                             # skill definition — inputs (repo path | context bundle), output ({repo}.analysis.json), the RepoAnalysis schema inline, the "opt-in hosted API" note
├── README.md                            # walkthrough: gather-context → run skill per repo → import
└── sample-analysis.json                 # committed; a core test asserts it satisfies RepoAnalysisSchema

Root: CHANGELOG.md, SECURITY.md (one-line note), pnpm-lock.yaml, eslint/tsconfig/vitest configs updated for the new package, CLAUDE.md (speckit-regenerated).
```

**Structure Decision**: Monorepo, three parts. (1) `apps/llm-importer` is reworked in place and gains
a library entrypoint so its deterministic contract surface is importable. (2) `packages/analysis-runner-local`
is a new standard workspace library holding everything model-touching that used to be in the app.
(3) `.claude/skills/repo-analysis/` is a repo-local skill. No third "core" package is introduced —
the app's own entrypoint is the reuse boundary (see Complexity Tracking).

## Complexity Tracking

No constitution violations. One deliberate choice recorded for reviewers:

| Choice                                                                                                                                                      | Why                                                                                                                                                      | Alternative rejected because                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/analysis-runner-local` depends on `apps/llm-importer` (via its new `exports` entrypoint) rather than extracting a shared `packages/importer-core` | Smallest change that lets the runner reuse `gatherContext` + the schemas; the app already _is_ the importer library, it just lacked a public entrypoint. | Extracting `packages/importer-core` now would move ~15 files, rewrite every intra-app import, and expand the diff well beyond this feature's intent. It stays available as a later refactor if a second consumer appears. |
