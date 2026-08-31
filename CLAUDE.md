# arch-atlas Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-08-31

## Active Technologies

- TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node.js ≥ 22 (`apps/llm-importer`). **No new dependency**: adds one deterministic `grpcPass` to `src/correlate/` (a literal-level `.proto`/stub-construction matcher) plus additive `RepoEvidence` fields; existing `zod`/`js-yaml`/`vitest` only. No persisted-artifact or Studio change. (009-grpc-cross-repo-correlation)
- TypeScript 5.3.0 strict, Node.js ≥ 22. **010**: `apps/llm-importer` core goes deterministic + model-free (drops `@earendil-works/pi-*` + `typebox`); the per-repo `RepoAnalysis` is produced by swappable in-repo producers — `packages/analysis-runner-local` (reference local-model runner, offline) and `.claude/skills/repo-analysis` (Claude Code, hosted, opt-in). New artifacts: `{repo}.context.json`, optional `architecture.extra-connections.json`. (010-harness-neutral-importer)

- TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — monorepo convention), Node.js ≥ 22 (retained; the `pi` SDK is still used for the bounded call and the agentic correlator) + `@earendil-works/pi-coding-agent` (`createAgentSession` with `tools: []`, single `session.prompt` — same pattern `src/correlate/agentic-correlator.ts` already uses), `@earendil-works/pi-ai` (`getModel` via the existing `model-runtime`), `zod` (new `RepoAnalysis` schema + existing config/graph schemas), `commander` (CLI — unchanged). **No package.json dependency is added or removed**; the removals in this feature are two vendored source trees and a runtime Python prerequisite, not npm packages. (008-bounded-repo-analysis)
- Local filesystem — per-repository `{repo-name}.analysis.json` artifacts (replace 007's `{repo-name}.knowledge-graph.json`); review artifact (`architecture.review.yaml`) and final `.arch.json` unchanged in location and (except two additive optional fields) in schema. (008-bounded-repo-analysis)

- TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — matches monorepo convention), Node.js ≥ 22 (matches `pi`'s own stated minimum) + `@earendil-works/pi-coding-agent` (SDK — `ModelRuntime`, `createAgentSession`, `DefaultResourceLoader`/custom `ResourceLoader`, `SessionManager`, `SettingsManager`), `@earendil-works/pi-ai` (`getModel`), `zod` (knowledge-graph + config schema validation), `commander` (CLI, replaces Python `click`) (007-llm-repo-importer)
- Local filesystem — per-repository `{name}.knowledge-graph.json` artifacts (successor to `.metadata.json`), final `.arch.json` and review artifact (unchanged format/location) (007-llm-repo-importer)
- Runtime-adjacent: Python 3.11+ interpreter required only to run two vendored Understand-Anything merge/normalize scripts as a subprocess step — not a build/test dependency, and not the primary pipeline language (that Python pipeline — tree-sitter/semgrep/networkx/single enrichment call — is retired as of the 2026-07-25 revision; superseded by the agentic pi-SDK pipeline above) (007-llm-repo-importer)

- TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target) + Next.js 14.1.0 (App Router), React 18.2.0, `@arch-atlas/renderer` (workspace, PixiJS v7), `@arch-atlas/core-model` (workspace), `@arch-atlas/layout` (workspace) (006-diagram-viewer-zoom)
- Google Drive REST API v3 (existing `GoogleDriveProvider`); local filesystem read-only viewing is out of scope for the shareable URL (006-diagram-viewer-zoom)

- TypeScript 5.3.0 (strict mode, `noUncheckedIndexedAccess`, ES2022 target) + `@arch-atlas/core-model` (workspace dep, types only — no runtime coupling) (004-architecture-dsl)
- N/A — pure in-memory transformation library (004-architecture-dsl)

- TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, PixiJS v7 (via `@arch-atlas/renderer`), Vitest 1.0.0, `@testing-library/react` (003-diagram-enhancements)
- Local file system (File System Access API) + Google Drive REST API v3; persisted as `.arch.json` files via `StorageProvider` interface (003-diagram-enhancements)

- TypeScript 5.3.0 + Next.js 14.1.0, React 18.2.0, Vitest 1.0.0 (existing); `@react-oauth/google ^0.13.4`, `@googleworkspace/drive-picker-react ^1.0.1`, `browser-fs-access ^0.35.0`, `idb ^8.0.0` (new) (002-flexible-storage)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.3.0: Follow standard conventions

## Recent Changes

- 009-grpc-cross-repo-correlation: new deterministic `grpcPass` in the evidence-grounded correlator — matches gRPC client/stub construction sites against served gRPC services to draw directed cross-repo `calls` edges (fixes `connectionsRecall = 0` on all-gRPC workspaces). Purely additive; no new deps, no persisted-schema change.
- 010-harness-neutral-importer: importer core made deterministic + model-free; `@earendil-works/pi-*` + `typebox` removed; per-repo analysis externalised to `packages/analysis-runner-local` (offline) + `.claude/skills/repo-analysis` (Claude Code, opt-in) + a documented producer contract

- 008-bounded-repo-analysis: Added TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — monorepo convention), Node.js ≥ 22 (retained; the `pi` SDK is still used for the bounded call and the agentic correlator) + `@earendil-works/pi-coding-agent` (`createAgentSession` with `tools: []`, single `session.prompt` — same pattern `src/correlate/agentic-correlator.ts` already uses), `@earendil-works/pi-ai` (`getModel` via the existing `model-runtime`), `zod` (new `RepoAnalysis` schema + existing config/graph schemas), `commander` (CLI — unchanged). **No package.json dependency is added or removed**; the removals in this feature are two vendored source trees and a runtime Python prerequisite, not npm packages.

- 007-llm-repo-importer: Added TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target — matches monorepo convention), Node.js ≥ 22 (matches `pi`'s own stated minimum) + `@earendil-works/pi-coding-agent` (SDK — `ModelRuntime`, `createAgentSession`, `DefaultResourceLoader`/custom `ResourceLoader`, `SessionManager`, `SettingsManager`), `@earendil-works/pi-ai` (`getModel`), `zod` (knowledge-graph + config schema validation), `commander` (CLI, replaces Python `click`)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
