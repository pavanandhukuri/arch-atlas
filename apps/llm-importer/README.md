# @arch-atlas/llm-importer

Agentic, local-model-driven repository architecture importer. Analyzes one or more local
repositories using a coding-agent session backed by a user-supplied local model (Ollama,
MLX, or any other OpenAI-compatible local endpoint — no hosted/cloud API path exists in
this package), then correlates connections across repositories and produces the same
review-artifact format the Studio import wizard already consumes.

See `specs/007-llm-repo-importer/` in the repo root for the full spec, plan, research
decisions, data model, and contracts this package implements.

## Prerequisites

- Node.js ≥ 22
- A running local model server (Ollama: `ollama serve` + `ollama pull <model>`, or an
  MLX/OpenAI-compatible server)
- Python 3.11+ on `PATH` — used only by two vendored Understand-Anything scripts
  (`vendor/understand-anything/merge-batch-graphs.py`,
  `merge-subdomain-graphs.py`), invoked as a subprocess during analysis

## Vendored third-party assets

This package vendors (copies, and in places patches) source from two external open-source
projects, rather than depending on them as npm packages, because parts of what's reused
either aren't published to npm or need behavior changes for headless/non-interactive
operation. **Do not edit vendored files without reading this section first** — on any
re-sync against upstream, patches must be re-applied, not silently lost by an overwrite.

### `vendor/understand-anything/`

Source: [`Egonex-AI/Understand-Anything`](https://github.com/Egonex-AI/Understand-Anything),
pinned at commit `6ae71878beb50226a1e4b7e2f52ac6468c86f74b` (vendored 2026-07-25).
License: MIT.

| File                                                                                  | Status                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md`                                                                            | **Patched** — see below     | The `/understand` skill, adapted for headless operation                                                                                                                                                                                                                                                                                                                                                                                               |
| `agents/project-scanner.md`, `agents/file-analyzer.md`, `agents/assemble-reviewer.md` | Vendored as-is              | `architecture-analyzer.md`, `tour-builder.md`, `domain-analyzer.md`, `graph-reviewer.md` intentionally **not** vendored — their phases are trimmed (see below)                                                                                                                                                                                                                                                                                        |
| `merge-batch-graphs.py`, `merge-subdomain-graphs.py`                                  | Vendored as-is              | Pure Python, no dependency on `@understand-anything/core` — confirmed by inspection before vendoring                                                                                                                                                                                                                                                                                                                                                  |
| `schema.ts`                                                                           | Vendored as-is              | UA's native graph schema, used for ingestion-time validation before our own trimmed schema filter (`src/graph/schema.ts`) is applied                                                                                                                                                                                                                                                                                                                  |
| `languages/*.md` (24 files), `frameworks/*.md` (10 files)                             | Vendored as-is              | Context files SKILL.md injects into agent prompts by detected language/framework                                                                                                                                                                                                                                                                                                                                                                      |
| `compute-batches.mjs`                                                                 | **Rewritten, not vendored** | UA's original does import-graph-aware batching via `graphology`/`graphology-communities-louvain`, backed by `@understand-anything/core`'s tree-sitter grammars. That package is **not published to npm** (confirmed via `npm view @understand-anything/core` → 404) and pulls in a dozen native/WASM grammar packages. Replaced with plain fixed-size chunking — no import-graph analysis, no external dependency. See the file's own header comment. |
| `generate-ignore.mjs`                                                                 | **Rewritten, not vendored** | UA's original does `.gitignore`-aware smart exclusion generation via the same un-vendored core package. Replaced with a fixed exclusion list matching `FR-015`'s hardcoded patterns.                                                                                                                                                                                                                                                                  |
| `build-fingerprints.mjs`                                                              | **Removed, not vendored**   | UA's file-level fingerprint baseline (for UA's own auto-update mechanism) also depends on `@understand-anything/core`. Not needed: this importer's incremental re-import (`FR-011`/US3) works at the repository level — does a valid `{repo}.knowledge-graph.json` already exist — not the file level.                                                                                                                                                |

**Patches applied to `SKILL.md`** (search the file for `arch-atlas headless patch` to find each one):

1. **Phase 0.5** — the `.understandignore` generation step no longer waits for user
   confirmation; it generates and proceeds immediately (no human in the loop for a
   batch/CI import).
2. **Phase 0 step 1.5** — UA's original plugin-root discovery (searching
   `~/.agents/skills/understand`, `~/.understand-anything-plugin`, etc.) and
   `@understand-anything/core` build step are removed entirely. `SKILL_DIR` is passed
   explicitly by `src/analysis/resource-loader.ts`; nothing needs discovering or building.
3. **Phases 4 and 5** (architecture-analyzer / layers, tour-builder / tour) — trimmed
   entirely. The review wizard doesn't consume either, and generating them costs two full
   agent dispatches' worth of local-model time per repository. `layers`/`tour` are
   hardcoded to `[]` in the Phase 6 JSON assembly instructions.
4. **Phase 7** — the fingerprint-baseline generation step (which depended on the
   un-vendored `build-fingerprints.mjs`) is removed; `meta.json` is written directly.
   Dashboard auto-launch is removed (no interactive session to launch it in) —
   `src/analysis/run-understand.ts` copies `knowledge-graph.json` out of `$UA_DIR`
   instead.
5. Progress-counter labels (`[Phase N/7]`) renumbered to `[Phase N/6]` to match the
   6 phases that actually run (0/0.5/1/1.5/2/3/6/7 minus the two trimmed — the `##
Phase 6`/`## Phase 7` section headers themselves are left as their original numbers
   for easier upstream diffing; only the user-facing progress text changed).

**Re-syncing against upstream**: fetch the new commit, diff each vendored file against
this patch list, and re-apply patches 1–5 by hand — do not blindly overwrite `SKILL.md`.
The un-vendored/rewritten scripts (`compute-batches.mjs`, `generate-ignore.mjs`) don't
need re-syncing against upstream at all, since they're not copies of UA's originals.

### `vendor/pi-subagent/`

Source: [`earendil-works/pi`](https://github.com/earendil-works/pi),
`packages/coding-agent/examples/extensions/subagent/`, pinned at commit
`518855dd502220d0c6480fb8863e2e7f8799893f` (vendored 2026-07-25). License: MIT.

Vendored as-is initially (`index.ts`, `agents.ts`); `MAX_CONCURRENCY`/`MAX_PARALLEL_TASKS`
constants are repointed at `src/concurrency/shared-limiter.ts` so repo-level and
internal-batch fan-out share one bound (research.md D8, FR-016) — see that file's diff
against the pinned upstream commit when re-syncing.

### Ported (not vendored): evidence-grounded correlation

`src/correlate/evidence/` and `src/correlate/evidence-passes.ts` are a **port** — owned
and maintained here, not re-synced against any upstream — of the deterministic
cross-repository linker core from the author's `understand-everything` project
(a multi-repo wrapper around Understand-Anything; MIT). Adapted to this package's
trimmed knowledge-graph schema and `CrossRepositoryConnection` contract, with two
additions developed here: gateway-prefix route matching with a concrete-segment
requirement, and well-known external-system detection from compose files. Unlike the
`vendor/` assets there is no pinned upstream commit to diff against; treat these as
first-party code.

## Development

```bash
pnpm --filter @arch-atlas/llm-importer typecheck
pnpm --filter @arch-atlas/llm-importer test
pnpm --filter @arch-atlas/llm-importer lint
```

See `specs/007-llm-repo-importer/quickstart.md` for end-to-end usage.
