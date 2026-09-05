# Phase 0 Research: Harness-Neutral Importer

No open "NEEDS CLARIFICATION" — the current codebase and the 008/009 specs settle every choice.

---

## D1 — The producer↔core seam: two files, two schemas

**Decision**: The boundary between "an analysis producer" and "the importer core" is exactly two
on-disk artifacts, each `zod`-validated:

1. **Context bundle** — `{outDir}/{repo}.context.json`. The verbatim serialisation of
   `gatherContext()`'s `AnalysisContext` (repo name/path, description hint, README excerpts, manifest
   excerpts, dependency splits, bounded listing, ranked source excerpts, detected interface hints,
   `totalBytes`). Emitted by the core's new `gather-context` subcommand and by
   `serializeContextBundle()`. A producer's _input_.
2. **Analysis artifact** — `{outDir}/{repo}.analysis.json`, schema `RepoAnalysisSchema` **unchanged**
   from 008. A producer's _output_, the core's _input_.

**Rationale**: `gather-context.ts` already builds precisely the material a producer needs; nothing
new is analysed, it's serialisation. Keeping the artifact schema byte-identical means `analysis-store.ts`,
`to-correlation-graph.ts`, `assemble-review.ts`, `diagram-builder.ts` and Studio need zero change
(FR-015). Two files + two schemas is the entire contract (FR-006).

**Alternatives considered**: a streaming/stdin protocol (rejected — files are resumable, cacheable,
inspectable, and match the existing `{repo}.analysis.json` cache); a plugin interface the core loads
(rejected — that _is_ framework lock-in, just ours; spec Out of Scope).

---

## D2 — The core exposes a library entrypoint (`src/index.ts` + `exports`)

**Decision**: `apps/llm-importer` adds `src/index.ts` and an `exports` map re-exporting only the
contract surface: `gatherContext`, the `AnalysisContext`/`ContextFile`/`SourceExcerpt`/
`DependencySplit`/`DetectedInterfaces` types, `RepoAnalysisSchema` + `RepoAnalysis`,
`serializeContextBundle`/`readContextBundle`/`ContextBundleSchema`, the `analysis-store`
read/write/list helpers, `toCorrelationGraph`, and the `CrossRepositoryConnection` /
`correlateDeterministically` types. `packages/analysis-runner-local` imports from
`@arch-atlas/llm-importer` (never deep paths).

**Rationale**: The runner needs `gatherContext` + schemas to build a prompt and validate output. The
app already is the importer library; it only lacked a front door. Adding one is ~30 lines and keeps
Principle I clean without a `packages/importer-core` extraction (see plan Complexity Tracking).

**Alternatives**: extract `packages/importer-core` (rejected for scope — moves ~15 files); duplicate
`gatherContext` into the runner (rejected — two copies of the bounded-walk/secret rules is exactly
the drift FR-005 forbids).

---

## D3 — What moves to `packages/analysis-runner-local`, verbatim vs. reworked

**Relocated verbatim** (pure, no pi): from `analyze-repo.ts` — `renderPrompt`, `GUIDANCE`,
`MODEL_OUTPUT_SHAPE`, `detectedSection`, `dependencySection`, `section`, `RETRY_PREAMBLE`,
`extractJsonObject`, `parseLenient`, `coerceModelAnalysis`, `SalvageModelAnalysisSchema`,
`EMPTY_SERVED`, `sanitizeServed`, `sanitizeFrameworks`, `OPERATIONAL_PATH_RE`, `NON_FRAMEWORK_DEPS`.
Their existing unit tests move with them.

**Reworked** (drop pi): `callModelForAnalysis` + `textAccumulator` (pi `createAgentSession` + event
stream) → one `chatComplete()` call against `openai-client.ts`. `runOnce`/`verifyGrounding`/
`analyzeRepo` keep their shape; the `model`/`modelRuntime` params become an `endpoint` config.
`local-model-runtime.ts` `checkLocalModelReachable` (already a raw `fetch`, no pi) → `reachability.ts`.
`agentic-correlator.ts` → `agentic-fallback.ts` (same prompt/filters, `createAgentSession` → `chatComplete`).

**Deleted outright**: the pi `ModelRuntime` wrapper + `withSamplingDefaults` Proxy (its only job was
injecting `temperature` because `AgentSession.prompt` had no sampling knob — the OpenAI client takes
`temperature` directly).

---

## D4 — `openai-client.ts`: minimal, dependency-free

**Decision**: `chatComplete({ endpoint, modelId, apiKey?, messages, temperature?, responseFormat?,
signal? }): Promise<string>`. `POST ${endpoint}/chat/completions` with `stream: true`; accumulate
`choices[0].delta.content` from the SSE lines; return the concatenated text. `responseFormat` passes
through as OpenAI `response_format` (`{ type: 'json_schema', json_schema: {...} }`) for the
`structuredOutput: 'tool'` mode — the schema is **hand-written** to mirror `ModelAnalysisSchema`
(≈ 40 lines), so no `zod-to-json-schema` dependency. Uses global `fetch` (Node ≥ 22). A non-2xx
response throws with status + a truncated body.

**Rationale**: The three current pi call-sites each do one completion. `fetch` + SSE parsing is ~90
lines and removes an entire dependency tree. `endpoint` is the OpenAI-style base URL the config
already stores (`localModel.endpoint`, e.g. `http://localhost:11434/v1`).

**Alternatives**: `openai` npm client (rejected — a dependency for one endpoint shape); keep
`pi-ai`'s `getModel` only (rejected — still the `@earendil-works` tree, still the coupling).

---

## D5 — The agentic cross-repo fallback becomes an optional file, not a core call

**Decision**: The core's `correlateDeterministically` already returns `unresolvedPairs`. The core no
longer resolves them. Instead, before `assembleReviewFile`, `run-import.ts` calls
`readExtraConnections(outDir)` which returns `CrossRepositoryConnection[]` from an **optional**
`{outDir}/architecture.extra-connections.json` (schema `ExtraConnectionsSchema`: an array of
connections with `foundBy: 'agentic-fallback'`), or `[]` if the file is absent. Those are merged with
the deterministic connections exactly as `run-import.ts` merges `agenticConnections` today.

The runner's `resolve-pairs` command (or `analyze` with a flag) runs the relocated fallback prompt
over `unresolvedPairs` and writes that file.

**Rationale**: Keeps the core deterministic and file-driven (same pattern as the analysis artifacts).
`assemble-review.ts` already maps `foundBy: 'agentic-fallback'` → `low` confidence (009 D14.4), so no
review-assembly change. FR-013 (fallback leaves the core) + FR-014 (correlation logic unchanged) both
satisfied.

**Alternatives**: drop the fallback entirely (rejected — it's a real, if minor, signal and users may
want it); keep a tiny OpenAI client in the core just for it (rejected — violates "core makes no model
call under any configuration", FR-001).

---

## D6 — Config: one file, core ignores the model block

**Decision**: `import.yaml` stays a single file. `ImportConfigSchema.localModel` becomes
`.optional()`. The **core** reads `output`, `repositories`, and `analysis.{maxFilesPerRepo,
excludePatterns}` (the context-gather knobs) and **never** touches `localModel`,
`analysis.{temperature, verifyGrounding, structuredOutput, maxConcurrency, forceRefresh}`. The
**runner** reads `localModel` + those model knobs from the same file via its own `RunnerConfigSchema`
(a superset view). FR-001 AS-4 ("config still references a model endpoint → core unaffected") is
satisfied by construction.

**Rationale**: One config file is the better UX; splitting it would break every existing `import.yaml`.
`.optional()` (not removed) keeps old configs valid.

**Alternatives**: separate `runner.yaml` (rejected — two files, migration pain); remove `localModel`
from the schema (rejected — breaks existing configs, and the runner wants it there).

---

## D7 — `import` command: aggregate-only is the only mode

**Decision**: `run-import.ts` keeps only its current `options.aggregateOnly` branch
(`listAllAnalyses(outputDir)` → `register`), made unconditional. Removed: `buildLocalModelRuntime`,
the `analyzeRepo` loop, `hasValidCachedAnalysis`/`readAnalysis`/`writeAnalysis` calls in the analyze
path, `correlateAgentically`, `options.analyzeOnly`. `cli.ts` removes `--analyze-only`, the
`checkLocalModelReachable` gate, exit code 2, and the `LocalModelUnreachableError` import. `--repos`
still filters which loaded analyses enter correlation (FR-016). `--force-refresh` moves to the runner
CLI (nothing to refresh in the core). New subcommand: `gather-context <config> [--out <dir>]`.

**Rationale**: `--aggregate-only` already _is_ the model-free path; this just makes it the default and
deletes the rest. Exit codes: `1` config error, `0` success — code `2` (endpoint unreachable) is gone
because the core never contacts an endpoint.

---

## D8 — Context bundle format = `AnalysisContext` + a version tag

**Decision**: `ContextBundleSchema` = the `AnalysisContext` fields plus
`{ schemaVersion: '1.0', generatedAt: string }`. `serializeContextBundle(ctx)` returns the object;
the CLI writes it as pretty JSON to `{repo}.context.json`. `readContextBundle(path)` parses +
validates, and on a version mismatch throws a clear "regenerate with `gather-context`" error.
`totalBytes` and the ranked-excerpt order are preserved so a producer sees exactly what the model
saw.

**Rationale**: A producer (esp. a human or a non-JS harness) needs a stable, self-describing input.
Reusing `AnalysisContext` verbatim means the runner's `renderPrompt` takes the bundle unchanged.

---

## D9 — `structuredOutput: 'tool'` in the runner

**Decision**: The runner keeps the `'prompt' | 'tool'` option. `'prompt'` = free-form JSON + the
relocated hardened parse (default). `'tool'` = `response_format: { type: 'json_schema', json_schema:
{ name: 'repo_analysis', strict: true, schema: <hand-written> } }`. The hand-written schema lives in
`openai-client.ts` (or `prompt.ts`) and a unit test asserts it accepts a valid `ModelAnalysis` and
rejects a missing `served`. `submit-analysis-tool.ts` + `typebox` are deleted from the app.

**Rationale**: OpenAI `response_format: json_schema` is the portable equivalent of pi's
`constrainedSampling`. Hand-writing ~40 lines beats adding `zod-to-json-schema` for one schema. Stays
documented-experimental (008 D14.6: pathologically slow on oMLX).

---

## D10 — Eval harness rewire (revised during implementation)

**Decision**: the eval moves from `apps/llm-importer/test/eval/` to
`packages/analysis-runner-local/eval/`. `run.ts` uses `analyzeRepoLocal` / `chatComplete` /
`resolveUnresolvedPairs` from the runner's own `../src/index.js`, and `RepoAnalysis` /
`CrossRepositoryConnection` / `toCorrelationGraph` / `correlateDeterministically` from
`@arch-atlas/llm-importer`. The `pnpm eval` script moves to the runner package too. `baseline.json`
moves with it; 009 connection numbers must hold within the harness's 0.05 `TOLERANCE`.

**Why the move (not a devDependency)**: the eval needs _both_ the runner (analysis half) and the
importer (correlation half). A devDependency `apps/llm-importer → @arch-atlas/analysis-runner-local`
alongside the runtime `@arch-atlas/analysis-runner-local → @arch-atlas/llm-importer` is a cycle that
**turbo rejects** ("Invalid package dependency graph: cyclic dependency detected") regardless of
dev/prod. The runner already depends on the importer, so hosting the eval there is the only acyclic
home. The `golden/*/workspace/` git-ignore + eslint/tsconfig/vitest excludes are repointed to the
new path.

---

## D11 — Removal order (FR-018)

1. Land the core rework (index.ts, context-bundle, extra-connections, run-import/cli changes) +
   `packages/analysis-runner-local` with `analyze` working + tests green.
2. Prove: model-free pipeline equivalence on fixtures; runner live parity vs. the committed
   pi-produced `test/fixtures/analyses/*.json`; eval baseline within tolerance.
3. **Confirm with the maintainer**, then delete: `@earendil-works/pi-coding-agent`,
   `@earendil-works/pi-ai`, `typebox` from `apps/llm-importer/package.json` + `pnpm-lock.yaml`;
   `src/analysis/analyze-repo.ts`, `src/analysis/submit-analysis-tool.ts`,
   `src/model-runtime/local-model-runtime.ts`, `src/correlate/agentic-correlator.ts` and their tests;
   the `--analyze-only` code paths.
4. `npm ls @earendil-works/pi-coding-agent` in `apps/llm-importer` → empty (SC-002).

**Rationale**: Mirrors 008's "prove the replacement, then remove the vendored tree" discipline.

---

## D12 — Claude Code skill shape

**Decision**: `plugins/repo-analysis/skills/repo-analysis/SKILL.md` — a skill that takes a repo path (or a
`{repo}.context.json`), runs `gather-context` if given a path, presents the bundle, and instructs the
model to emit a `RepoAnalysis` JSON (schema inlined in the skill body) written to
`{outDir}/{repo}.analysis.json`. `README.md` gives the multi-repo walkthrough and states plainly that
this path sends the (secret-scrubbed) context bundle to a hosted API — use the local runner to stay
offline. `sample-analysis.json` is committed and a core test (`skill-sample.test.ts`) asserts
`RepoAnalysisSchema.safeParse(sample).success`.

**Rationale**: FR-011/FR-012. The skill is documentation + a prompt; its correctness gate is "its
sample validates", not a live model call in CI.
