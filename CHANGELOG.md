# Changelog

All notable user-facing changes SHOULD be documented in this file.

## Unreleased

### Removed — the local-model reference producer

- **`packages/analysis-runner-local` is deleted.** It was a reference implementation of the
  analysis-producer contract that called a local, OpenAI-compatible model endpoint directly —
  the only code in this repo that ever made a model call. That call is now made exclusively by
  whichever coding agent a developer chooses to run `plugins/repo-analysis`'s procedure with,
  against whichever model (local or hosted) that agent is configured for. No code shipped from
  this repo talks to a model, under any configuration.
- `ImportConfigSchema` drops the now-unused `localModel` and `analysis` (temperature,
  maxConcurrency, structuredOutput, …) config blocks that existed only to configure that
  package — backward compatible for any existing `import.yaml` that still carries them (they're
  now silently ignored rather than read, per zod's non-strict parsing).

### Changed — repo-analysis packaging & multi-agent compatibility

- **The `repo-analysis` producer moved from `.claude/skills/repo-analysis/` to `plugins/repo-analysis/`,
  restructured as a proper, portable Claude Code plugin** (`.claude-plugin/plugin.json` manifest +
  `skills/repo-analysis/`). `.claude/` is personal, gitignored configuration for whoever is
  developing this repo — not the right place to ship a deliverable other people install into their
  own, unrelated projects. Install with `claude --plugin-dir /path/to/plugins/repo-analysis`; see
  `plugins/repo-analysis/README.md`.
- **The canonical procedure is now `plugins/repo-analysis/AGENTS.md`**, following the open
  [agents.md](https://agents.md) convention (adopted by 20+ coding agents — Claude Code, Cursor,
  GitHub Copilot, OpenAI Codex, Windsurf, Gemini CLI, Aider, Jules, Zed, Devin, and more).
  `SKILL.md` is now a thin Claude-Code-specific wrapper that points at it, kept only for
  discoverability inside a Claude Code session. Which model the procedure runs against — local
  or hosted — is entirely a property of the coding agent you use; arch-atlas has no opinion.

### Added — `@arch-atlas/llm-importer` published to npm

- **`@arch-atlas/core-model`, `@arch-atlas/layout` and `@arch-atlas/llm-importer` now publish to
  the public npm registry** (`.github/workflows/publish.yml`, triggered by pushing a `vX.Y.Z`
  tag, or manually with a dry-run default). Uses npm **trusted publishing** (OIDC) — no
  long-lived npm token in CI, and provenance attestations are generated automatically.
  Lockstep-versioned; the workflow verifies all three `package.json` versions match the tag,
  runs lint/type-check/test, `pnpm pack`s each package (so `workspace:*` deps become real
  versions), then `npm publish`es any not already on npm — in dependency order. (First-ever
  publish of each package still needs a one-time token; see the workflow header.)
- **`plugins/repo-analysis` now runs the importer via `npx @arch-atlas/llm-importer@latest`** —
  no arch-atlas checkout, no build step, no `$ARCH_ATLAS_HOME`. `AGENTS.md`, `SKILL.md` and the
  plugin README are rewritten around this; a developer using the plugin needs only Node ≥ 22.
- **Fixed:** the `arch-atlas-import` bin silently no-op'd (exit 0, no output) when invoked
  through the `node_modules/.bin` symlink that npm / npx / pnpm create — the entry-point check
  now compares realpath-resolved paths. Covered by `test/integration/cli-entrypoint.integration.test.ts`.
- Package hygiene for the three published packages: `files`, `publishConfig.access`, `engines`,
  `repository.directory`, `homepage`, and a `prepack` clean-rebuild so a stale `dist/` can't
  ship.

### Security

- Patched 62 of 90 known vulnerabilities across the dependency tree (`pnpm audit`: 2 critical / 45 high / 36 moderate / 7 low → 0 critical-among-fixed / 28 remaining, all isolated to 4 packages below) via scoped `pnpm.overrides` in the root `package.json` — `minimatch`, `brace-expansion`, `picomatch`, `js-yaml`, `undici`, `nanoid`, `postcss`, `qs`, `ajv`, `flatted`, `browserslist`, `esbuild`, `rollup`, `@babel/core`. Every override target is caret-bounded (`^X.Y.Z`) to the same major line the vulnerable range was already on — verified against the lockfile that no override accidentally forces a cross-major jump (a first, careless pass using open `>=X` targets did exactly that for `minimatch`, `vite`, and `turbo` before being caught and corrected; see the session notes / PR description for the specific near-misses).
- **Not fixed here, deliberately** — each needs an isolated, tested major-version migration, not a blind override: `vitest` (1.6.1 → ≥3.2.6, 1 critical CVE — a Vitest UI arbitrary-file-read; UI server isn't run in this repo, so no live exposure, but the fix is a real major bump touching every package's test config), `next` (`apps/studio`, 14.2.35 → ≥15.5.21, several high — App Router DoS/SSRF/cache-poisoning; a real production-facing app, needs a tested App Router migration), `vite` (`apps/viewer`, stuck on 5.4.21 — `@vitejs/plugin-react@4.7.0`'s own peer range already wants `vite@^6.4.3`, a pre-existing mismatch this pass left alone since bumping requires coordinating both packages), `turbo` (1.13.4 → ≥2.9.14, low/moderate, dev-tooling only — `turbo.json` still uses the v1 `"pipeline"` key, which v2 replaces with `"tasks"`; needs a config migration, not just a version bump).

### Fixed

- `turbo.json`'s `typecheck` task depended only on upstream packages' builds (`^build`), never its own — on a fully cold cache (e.g. after any dependency change invalidates every task simultaneously), `apps/studio`'s `typecheck` could race ahead of its own `next build` and fail on missing `.next/types/**/*.ts` codegen. Added `build` (own-package) to `typecheck`'s `dependsOn`. Verified deterministic across repeated `--force` (fully-cold) runs.

### Changed (012-endpointpass-wildcard-fp)

- **The cross-repo correlator no longer reports a call from a plain data string that merely happens to path-match a low-specificity served route.** `endpointPass`'s endpoint-node matching now requires either a served route with at least two static path segments, or an HTTP-method signal on the calling literal, before accepting a match — a route like `/product/{id}` (one static segment) is no longer matched by _any_ literal sharing the word "product" (e.g. an ad-content redirect URL embedding a product id as plain data), unless that literal actually carries call-site evidence (a `.get(`/`.post(`-style hint, or an options-object `method:`).
- Effect: on the Online Boutique reference workspace, this was the single remaining documented false positive after 011 — connection precision reaches a clean 1.0 (up from ~0.93), with connection recall unchanged at 1.0. No other correlation pass or match branch (gateway-prefixed variant, literal-vs-literal fallback, exact-method matches, higher-specificity routes) is affected.
- Internal only: no new dependency, no change to `{repo}.analysis.json` / review-artifact / `.arch.json` schemas, the CLI, or Studio. Resolves the last false positive documented in `specs/011-schemapass-shared-contract/research.md` (D2) / `specs/009-grpc-cross-repo-correlation/research.md` (D14).

### Changed (011-schemapass-shared-contract)

- **The cross-repo correlator no longer reports a dependency between two services just because they both vendor a copy of the same shared multi-service contract.** `schemaPass`'s "identical schema copy" signal now fires only when exactly one repository actually serves every service the contract declares — that repo is the owner, and the other copy-holders get a directed `depends_on` toward it. An aggregate `.proto` (many services, copied into every service repo, e.g. Online Boutique's `demo.proto`) links nothing. The low-confidence "proto-package drift" signal is likewise suppressed when the package name is declared in 3+ repositories (a workspace namespace, not a bilateral contract).
- Effect: on a workspace built around one shared aggregate contract, cross-repo connection precision rises sharply (Online Boutique ~0.67 → ~0.93) with no loss of real connections. Single-owner contracts, OpenAPI client-coverage, and every other correlation pass are unchanged.
- Internal only: no new dependency, no change to `{repo}.analysis.json` / review-artifact / `.arch.json` schemas, the CLI, or Studio. Resolves the follow-up deferred in `specs/009-grpc-cross-repo-correlation/research.md` (D14).

### Changed (010-harness-neutral-importer)

- **`apps/llm-importer` is now deterministic and model-free.** It reads one `{repo}.analysis.json` per repository, correlates, and writes the review artifact + diagram — no model call, no network request, no agent-framework dependency. The `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` dependencies are removed.
- The per-repository analysis step is now an **external, swappable producer**. Two ship in-repo, plus a documented contract for your own:
  - `@arch-atlas/analysis-runner-local` (`packages/analysis-runner-local`) — reference runner against a **local** OpenAI-compatible endpoint (offline; carries the 007/008 local-only guarantee).
  - `.claude/skills/repo-analysis` — a Claude Code skill; **opt-in hosted-API** path.
  - Contract: `RepoAnalysisSchema` (unchanged) + the new `{repo}.context.json` bundle format — see `specs/010-harness-neutral-importer/contracts/`.
- CLI: `arch-atlas-import` gains `gather-context <config>` (write context bundles) and `import <config>` (build the diagram from artifacts). Removed: `--analyze-only`, the model-endpoint reachability gate, exit code 2. A missing/malformed `{repo}.analysis.json` is named and skipped; the rest still produce a diagram.
- The model-assisted cross-repo fallback moved out of the core: a producer may write an optional `architecture.extra-connections.json` which `import` merges (unchanged `low`-confidence mapping).
- Schemas for `{repo}.analysis.json`, the review artifact, and `.arch.json` are unchanged; Studio needs no change.

### Added (009-grpc-cross-repo-correlation)

- **gRPC service-to-service calls are now detected** and drawn as connections. The deterministic evidence-grounded correlator gains a sixth pass (`grpc`) that matches gRPC client/stub construction sites in one repository's source (Go, C#, Node/JS, Python, Java, plus a generic fallback) against the gRPC services another repository serves (from the per-repo analysis and/or `.proto` `service` declarations), producing directed `calls` connections with file/line evidence. Previously a workspace whose services talked only over gRPC produced containers with no connections between them.
- gRPC connections surface in the review artifact as candidate `type: "grpc"` (Studio already understands it) and export as `calls` relationships.
- Purely additive: no change to the per-repo analysis call or its schema, the other five correlation passes, the agentic fallback, `.arch.json` / review-artifact schemas, or Studio. No new dependencies, no model call in the correlation path.

### Changed (008-bounded-repo-analysis)

- **`apps/llm-importer` per-repository analysis** replaced: instead of running a vendored Understand-Anything multi-phase agentic skill per repo, each repository is now analyzed by a single bounded, structured-output local-model call over a deterministically-gathered context (README(s), manifest file(s), a bounded directory listing, relevance-ranked source excerpts). Cross-repository correlation, review-artifact assembly, and `.arch.json` export are unchanged.
- Per-repository artifact renamed `{repo}.knowledge-graph.json` → **`{repo}.analysis.json`** (new `RepoAnalysis` shape). 007-format artifacts are ignored on upgrade; affected repos are re-analyzed.
- Exported `.arch.json` container elements (and the review artifact's new optional `repos` block) now carry a `description` and `technology` label per analyzed repository.

### Removed (008-bounded-repo-analysis)

- The vendored `understand-anything/` and `pi-subagent/` trees, the headless-operation hardening logic (resource-loader reload/verify, persistence nudges, fabricated-graph detection), and the **Python 3.11+ runtime prerequisite** — the importer now has no Python dependency.

### Reliability (008-bounded-repo-analysis)

- Per-kind context budgets (READMEs vs manifests vs source) and a deeper file walk so Java/Kotlin services (code nested under `src/main/…`) are analyzed from real source, not just manifests.
- Tolerant model-output parsing (trailing commas, comments, truncated responses), a stricter retry prompt, and partial-result salvage when only part of the JSON is malformed.
- `analysis.maxConcurrency` now defaults to `1` — a single local model serving two large concurrent requests was unreliable. Raise it for smaller models / stronger endpoints.

### LLM quality (008-bounded-repo-analysis)

- Analysis + agentic-correlation calls now run at a low sampling temperature (`analysis.temperature`, default `0.1`) — the main source of run-to-run variance in a repo's extracted interfaces.
- `frameworks` no longer includes test runners / linters / bundlers / type stubs: the context separates runtime from dev dependencies, and a denylist strips the rest from the model's output.
- The prompt now carries deterministically-detected route/topic hints for the model to confirm and classify, plus explicit rules on what counts as a framework / served interface.
- Agentic-fallback connections are filtered (confidence ≥ 0.8, concrete reasoning, no "both repos use X" guesses) and always surface as **low** confidence.
- Operational endpoints (`/actuator/**`, `/health*`, `/metrics`, …) are dropped from a repo's served routes — they were causing cross-service false positives.
- New opt-in knobs: `analysis.verifyGrounding` (second pass that drops ungrounded findings) and `analysis.structuredOutput: "tool"` (experimental constrained-sampling path).

### Eval harness (008-bounded-repo-analysis)

- `pnpm eval` scores per-repo extraction (precision/recall/F1 for languages, frameworks, served interfaces, outbound targets), cross-repo connection recall, run-to-run consistency, and an LLM-judged description score against hand-labelled ground truth. Two golden sets: an in-repo synthetic one and `GoogleCloudPlatform/microservices-demo` cloned at a pinned SHA. `--check` gates on regression vs. a committed `baseline.json`.

### Added (003-diagram-enhancements)

- **External system marking** (US1): Systems can be marked as external via the element editor. External systems render in a distinct red/maroon colour, drill-down is blocked, and a confirmation dialog warns before child containers are deleted. Reverting to internal starts with an empty container view.
- **New container diagram shapes** (US2): Five new draggable shapes added to the container-level palette — Database (cylinder), Storage Bucket (trapezoid), Static Content (folder), User Interface (browser chrome), Backend Service (terminal). Each shape carries a `containerSubtype` field and renders with a distinct PixiJS graphic.
- **Element colour formatting** (US3): A right-side properties panel opens when any non-external node is selected. Architects can customise background, border, and font colours from a 16-swatch palette. Changes apply live and persist through save/reload cycles. The panel is hidden for external systems.

### Changed (003-diagram-enhancements)

- `Element` model extended with optional `isExternal`, `containerSubtype`, and `formatting` fields.
- Validation pipeline extended with `validateElementAttributes` rule: enforces kind-guards for `isExternal`/`containerSubtype` and validates hex colour format on `formatting` fields.
- JSON schema updated to include new Element and Relationship fields; pre-existing missing fields (`person` kind, `action`/`integrationMode` on Relationship) also corrected.

---

- Initial project scaffolding
