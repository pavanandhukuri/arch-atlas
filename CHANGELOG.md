# Changelog

All notable user-facing changes SHOULD be documented in this file.

## Unreleased

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
