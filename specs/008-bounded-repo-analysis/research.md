# Phase 0 Research: Bounded Per-Repository Analysis

Source material: direct inspection of the running `007-llm-repo-importer` implementation under `apps/llm-importer/src` and `apps/studio/src/lib/import`, read in full during the design pass that produced `spec.md`. Every decision below resolves an open question raised while turning the spec into an implementable plan. There are no `NEEDS CLARIFICATION` markers in the spec (the three design forks — proof workspace, artifact shape, C4 enrichment — were resolved with the maintainer before drafting).

---

## D1 — How the bounded call is issued

**Decision**: Reuse the exact pattern `src/correlate/agentic-correlator.ts` already uses: `createAgentSession({ agentDir, model, modelRuntime, tools: [], sessionManager: SessionManager.inMemory(), settingsManager: SettingsManager.inMemory({}) })`, then a single `session.prompt(...)`, accumulating the assistant's `text_delta` events from `session.subscribe`, then `session.dispose()`. Parse the accumulated text into JSON (first `{ ... }` object, tolerant of surrounding prose) and validate with the `RepoAnalysis` zod schema.

**Rationale**: This boundary is already proven against a real local model (oMLX / Qwen3-Coder-30B, 007 T062) and against the mocked SDK in `test/unit/agentic-correlator.test.ts`. It respects the user's `model-runtime` configuration with no new HTTP client, honours FR-017 (local-only) for free, and keeps one consistent "no-tools single-turn reasoning call" idiom in the codebase. `tools: []` structurally guarantees "no tool orchestration" (spec FR-001).

**Alternatives considered**:

- Call `@earendil-works/pi-ai` `getModel(...).complete/stream` directly, bypassing `createAgentSession` — rejected: re-implements session/runtime wiring the SDK already gives us, and diverges from the agentic-correlator idiom for no benefit.
- Raw HTTP to the local endpoint — rejected: duplicates provider handling (`ollama`/`mlx`/`openai-compatible` + optional `apiKey`) that `local-model-runtime.ts` already centralizes.
- Native structured-output / JSON-schema response mode if the local server supports it — **noted as an optional hardening**, not required: many local servers ignore `response_format`, so prompt-instructed JSON + zod validation + one retry is the portable baseline. If `pi-ai` exposes a schema-constrained mode uniformly, the implementer may pass the schema through as belt-and-braces, but the parser must still not assume it took effect.

---

## D2 — Deterministic context assembly

**Decision**: New `src/analysis/gather-context.ts`, independent of `src/correlate/evidence/collect.ts` (which stays untouched) but mirroring its bounded-walk discipline and importing the same `matchesSecretPattern` from `src/analysis/secret-paths.ts`. It produces an in-memory `AnalysisContext` (not persisted) with four parts:

1. **READMEs**: `README*`, `readme*`, and top-level `docs/` index files with extension in `.md/.markdown/.rst/.txt`, at repo root and one level down. Each capped at `MAX_README_BYTES`.
2. **Manifests**: the same basename set `collect.ts` recognizes — `package.json`, `pyproject.toml`, `go.mod`, `cargo.toml`, `pom.xml`, `build.gradle`, `build.gradle.kts` — plus `requirements.txt`, `Gemfile`, `*.csproj`, `composer.json`, and any `docker-compose*.y{a,}ml` / `Dockerfile`. Full content, capped per file.
3. **Directory listing**: repo-relative paths only (no content), from the bounded walk — depth ≤ `MAX_DEPTH`, entries ≤ `MAX_LISTING_ENTRIES`, applying `matchesSecretPattern` and the same perf-skip dirs `collect.ts` uses (`node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.next`, `.turbo`, `out`, `__pycache__`, `.venv`, dot-dirs).
4. **Relevance-ranked source excerpts**: up to `MAX_SOURCE_FILES` files, each truncated to `MAX_SOURCE_BYTES`, chosen by a scored heuristic over the walk results:
   - basename matches an entrypoint pattern: `main.*`, `index.*`, `app.*`, `server.*`, `cmd/**/main.go`, `src/main/**`, `Program.cs`, `__main__.py` — high score
   - path segment matches `route|router|routes|handler|handlers|controller|controllers|endpoint|api|consumer|producer|publisher|subscriber|listener|worker|queue|kafka|grpc|proto|schema` — medium score
   - shallower depth and larger (but under cap) files break ties
   - extension in `collect.ts`'s `CODE_EXTENSIONS` set is a prerequisite for consideration

**Caps (planning-level defaults, tunable in one constants block)**: `MAX_DEPTH = 4`, `MAX_LISTING_ENTRIES = 400`, `MAX_README_BYTES = 16_384`, `MAX_SOURCE_FILES = 12`, `MAX_SOURCE_BYTES = 6_144`, `MAX_TOTAL_CONTEXT_BYTES = 131_072` (hard ceiling; stop adding source excerpts when hit). `config.analysis.maxFilesPerRepo` is re-purposed as the ceiling on files _examined by the walk_ (default 200 already fits), keeping the config field meaningful without a shape change.

**Rationale**: A fixed, inspectable context is the whole point — it makes the call bounded, cheap, cacheable in spirit, and reproducible in structure (only the model's response varies, NFR-001). Reusing `secret-paths.ts` keeps the FR-003 exclusion list (the 007 FR-015 pattern set, extracted in 007 T067) single-sourced. Not sharing code with `collect.ts` is deliberate: `collect.ts` is on the "keep unchanged" list and serves a different consumer (raw-evidence passes), so duplicating ~30 lines of walk logic is cheaper than coupling them.

**Alternatives considered**:

- Hand the model a tool to read files on demand — rejected: that is exactly the multi-turn agentic browsing this feature removes.
- Embed whole files rather than truncated excerpts — rejected: unbounded token cost on a local model; the heuristic + truncation is enough to identify a stack and surface interface declarations.

---

## D3 — Persisted artifact: name and shape

**Decision**: New artifact `{output.directory}/{repo-name}.analysis.json`, schema `RepoAnalysis` (see `data-model.md` / `contracts/repo-analysis-schema.md`). It is **not** the 007 `RepositoryKnowledgeGraph` shape and does not reuse the `.knowledge-graph.json` filename.

007-format files (`*.knowledge-graph.json`) left in an output directory from a prior version are **ignored** by the cache check (different suffix) and by `--aggregate-only`'s directory scan (which will be retargeted to `*.analysis.json`). `analysis-store.ts` additionally logs a one-line notice if it finds `*.knowledge-graph.json` files and no `*.analysis.json`, so an upgrading user understands why every repo is being re-analyzed (spec edge case).

**Rationale**: Honest storage. The persisted thing is a short structured description of a repository's identity and interfaces, not a graph of hundreds of file/function nodes; naming it `knowledge-graph.json` would be a lie that misleads the next maintainer. Churn from the rename is contained entirely within `apps/llm-importer` (`analysis-store.ts` replaces `knowledge-graph-store.ts`; `run-import.ts` updates two call sites) — nothing outside the package reads the per-repo artifact (Studio consumes `architecture.review.yaml` and `.arch.json` only).

**Alternatives considered**:

- Keep `RepositoryKnowledgeGraph` as the persisted shape, populate few nodes — rejected: preserves vestigial structure (13 node types, dangling-edge handling, `filterToTrimmedSchema`) with no live producer of most of it.
- Keep the old filename, new shape — rejected: silently loads as a format mismatch on upgrade; a new name makes the break explicit.

---

## D4 — Adapter to the correlator's input model

**Decision**: New `src/analysis/to-correlation-graph.ts` exporting `toCorrelationGraph(analysis: RepoAnalysis): RepositoryKnowledgeGraph`. The retained `src/graph/schema.ts` types now describe _the correlator's in-memory input_, and `RepositoryKnowledgeGraphSchema.parse` validates the adapter's output before it reaches `correlateDeterministically`. Mapping (full table in `contracts/correlation-adapter-contract.md`):

| `RepoAnalysis` field                  | Correlation-graph output                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repository` (name/path/description)  | `graph.repository` (unchanged shape)                                                                                                                                                                                                                                                                                                                                                                                           |
| —                                     | one `module` node `id: "module:{name}"`, `name: {name}` (anchor for `moduleNodeId()` in evidence-passes)                                                                                                                                                                                                                                                                                                                       |
| `served.httpRoutes[]`                 | one `endpoint` node each: `id: "endpoint:{method} {path}"`, `name: "{METHOD} {path}"` (or `"{path}"` when method unknown), `filePath` if the model attributed one — shaped so `parseEndpointRoute(node)` in `evidence/parsers/routes.ts` recovers method+path from `node.name`/`node.id`                                                                                                                                       |
| `served.datastores[]`                 | one `table` node each (name = store/table name)                                                                                                                                                                                                                                                                                                                                                                                |
| `served.topics[]` (produced/consumed) | one `resource` node each (name = topic)                                                                                                                                                                                                                                                                                                                                                                                        |
| `outbound[]` intents                  | one `GraphEdge` each: `source` = the `module` node, `target` = a synthetic node id for the named external target, `type` = mapped from the intent verb (`calls`/`depends_on`/`publishes`/`subscribes`/`reads_from`/`writes_to`), `weight` = the analysis's per-intent confidence (0–1, default 0.5), `description` = the intent's prose (this is what the name-mention pass and the agentic-fallback `condenseForPrompt` read) |
| `languages`/`frameworks`              | not represented in the correlation graph (consumed only by export enrichment, D6)                                                                                                                                                                                                                                                                                                                                              |

`analysisStatus` maps `complete`/`partial`; `retryCount` passes through 0/1.

**Rationale**: This is the seam that lets the entire `src/correlate/` tree stay byte-for-byte unchanged (verified against the spec's "keep unchanged" list). `evidence/collect.ts`'s `graph.nodes.filter(n => n.type === 'endpoint')` and `evidence-passes.ts`'s `parseEndpointRoute` / `moduleNodeId` / `fileNodeId` all keep working because the adapter emits nodes in the shapes those functions expect. The `endpoint` literal-vs-literal fallback and all five evidence passes read raw repo source and are unaffected by graph thinness.

**Alternatives considered**:

- Change `collect.ts` to read `analysis.served.httpRoutes` directly (as the spec tentatively allowed) — rejected once D4's node-shaping was confirmed feasible: keeping `collect.ts` on the untouched list is a stronger guarantee and removes a review surface.
- Feed `RepoAnalysis` straight into the correlator and rewrite the passes to consume it — rejected: exactly the "modify the kept modules" outcome the feature is designed to avoid.

---

## D5 — Endpoint-node shape (confirms D4 feasibility)

**Finding**: `parseEndpointRoute(node)` (`src/correlate/evidence/parsers/routes.ts:112`) recovers a route by trying to parse `node.name` as `"METHOD /path"` or `"/path"`, then falling back to the substring of `node.id` after its last `:`. It reads no other node field for routing. `EndpointRoute` is `{ method?: string; path: string }`.

**Decision**: The adapter emits each served HTTP route as `{ id: "endpoint:" + label, type: "endpoint", name: label, filePath?, summary: "<prose or ''>" }` where `label` is `"GET /v1/send"` (method upper-cased, single space, normalized path) or `"/v1/send"` when the model gave no method. This satisfies both `parseEndpointRoute` parse paths. A contract test pins the format.

**Rationale**: Removes the only real risk in the "correlator unchanged" claim — that the endpoint pass silently stops matching because synthesized nodes don't parse.

---

## D6 — C4 enrichment (description + technology)

**Decision**: `buildDiagram(review, analysesByRepoName, title)` gains a third argument: a `Map<string, { description?: string; technology?: string }>` keyed by repository name. For each container element whose name matches an analyzed repository, set `element.description` (from `analysis.description`) and `element.technology` (from `analysis.frameworks[0] ?? analysis.languages.join('/')` — a short label, not the full list). Elements introduced only as candidate targets (external systems) are left as-is. `@arch-atlas/core-model` `Element` already declares both fields (`description?: string`, `technology?: string`) — no schema change.

`run-import.ts` builds the map from the in-memory analyses it already holds and passes it to `buildDiagram`.

**Rationale**: Realizes the reason for producing a description/stack at all. Scoped to source-repo containers so external-system elements aren't given a spurious tech label.

**Alternatives considered**: joining all frameworks+languages into `technology` — rejected as noisy for a diagram label; first framework (or languages) is enough and the full lists live in the artifact.

---

## D7 — Description/technology in the review artifact

**Finding**: Studio's `apps/studio/src/lib/import/parse-review.ts` (`parseReviewYaml`) is a hand-rolled permissive parser. It reads `version`, `generated_at`, `source_repos`, `systems`, `candidates` by key and **ignores every other top-level key**; it throws only on missing/mis-typed _known_ fields. An added top-level `repos` array cannot break it.

**Decision**: Add optional `repos?: Array<{ name: string; description?: string; technology?: string }>` to `ReviewFile` in `src/review/review-file.ts`, and populate it in `assemble-review.ts` from the analyses. `src/review/review-file.ts`'s header already notes it is a producer-side port; Studio's own `types.ts` is not touched (it parses structurally, not via this type). A `review-assembly.test.ts` case round-trips the produced file through a local copy of the `parseReviewYaml` field checks (or asserts the shape) to prove non-breakage.

**Rationale**: Satisfies spec FR-016's "include if non-breaking" branch — confirmed non-breaking. Gives a future Studio change a place to read pre-filled classify data with zero importer rework.

---

## D8 — Retry & failure semantics

**Decision**: Mirror 007 FR-010a exactly, minus the nudges. `analyzeRepo` runs inside `limiter.run(...)`. An inner `runOnce` throws on: empty response, no parseable JSON object, or `RepoAnalysisSchema` validation failure. The outer loop tries attempts `[0, 1]`; on the second failure it returns `{ status: 'failed', error, retryCount: 1 }`; on success it returns `{ status: 'complete', analysis, retryCount }`. No same-session "continue" prompts (spec NFR-002) — the bounded call either produces valid structured output in one turn or it is retried from scratch once.

**Rationale**: Same partial-failure guarantees `run-import.ts` already depends on (`failures[]`, `reportFailures`, partial diagram), so its failure-handling code is unchanged. The nudge loop existed only because a multi-phase skill could stall mid-orchestration; a single structured call has no mid-state to nudge.

---

## D9 — Concurrency

**Decision**: Repo-level fan-out stays wrapped in `SharedLimiter` (`config.analysis.maxConcurrency`, default 2), unchanged. The `process.env.ARCH_ATLAS_MAX_CONCURRENCY` assignment in `run-import.ts` (which only existed to bound the vendored subagent extension's internal batch fan-out) is removed in Phase 7 with `vendor/pi-subagent`. `agentic-correlator.ts` continues to use the same limiter. There is no longer a second, independently-scaling fan-out layer, so FR-016's "two layers multiplied" risk simply disappears.

**Rationale**: One model call per repo means repo-level concurrency _is_ the total concurrency; the shared limiter is sufficient and already present.

---

## D10 — Testing strategy under the TDD/coverage gate

**Decision**:

- **Pure unit, no model**: `repo-analysis.schema.ts` (valid/invalid fixtures), `gather-context.ts` (fixture repos incl. a planted `.env` that must never appear in the context — SC-007), `to-correlation-graph.ts` (endpoint-node format, edge mapping, output passes `RepositoryKnowledgeGraphSchema`), `analysis-store.ts` (write/validate/cache-hit/ignore-007-files), `diagram-builder.ts` (description/technology set on the right elements), `assemble-review.ts` (`repos` block present, file still parses).
- **Mocked SDK**: `analyze-repo.test.ts` mocks `@earendil-works/pi-coding-agent`'s `createAgentSession` exactly as `agentic-correlator.test.ts` does (fake `session` whose `prompt` emits `message_update` / `text_delta` events) — covers happy path, one-retry-then-success, retry-then-fail (no artifact written), and asserts `prompt` is called at most twice and no "continue" text is ever sent.
- **Opt-in integration**: `single-repo-analysis.integration.test.ts` rewritten to run the real bounded call against a reachable local model (`OLLAMA_HOST` / configured endpoint), skipped otherwise; `multi-repo-correlation.integration.test.ts` updated to the bounded call with the expanded fixtures. These replace 007's two vendored-skill integration tests.
- **Proof-gate artifacts (Phase 6, not CI)**: a scripted expanded-fixture run and one live `uds-sdk` run, each emitting a connection-set comparison against the 007 pipeline's known-correct set.

**Rationale**: ≥80% is reachable in ordinary CI with no local model — the deterministic surface is large and the one model-touching module is tested at the same mock boundary 007 already established. Fewer moving parts than 007's strategy (no multi-phase orchestrator, batcher, or `$UA_DIR` copy/cleanup to characterize).

---

## D11 — Removal inventory (Phase 7, gated)

Deleted only after FR-017 proof + maintainer confirmation:

- `apps/llm-importer/vendor/understand-anything/` (entire tree, ~392 KB)
- `apps/llm-importer/vendor/pi-subagent/` (entire tree, ~52 KB) — referenced only by `resource-loader.ts`
- `src/analysis/run-understand.ts` + `test/unit/run-understand.test.ts`
- `src/analysis/resource-loader.ts` + `test/unit/resource-loader.test.ts`
- `src/analysis/secret-exclusion-extension.ts` + `test/unit/secret-exclusion-extension.test.ts`
- `src/graph/knowledge-graph-store.ts` + `test/unit/knowledge-graph-store.test.ts` (superseded by `analysis-store.ts`)
- `filterToTrimmedSchema` and the UA-superset commentary in `src/graph/schema.ts` (the `GraphNode`/`GraphEdge`/`RepositoryKnowledgeGraph` types **stay** — now the adapter's target)
- `run-import.ts`: the `process.env.ARCH_ATLAS_MAX_CONCURRENCY` line and its research.md D8 comment
- `quickstart.md`, `README.md`, plan Technical Context: the Python 3.11+ prerequisite, the vendored-asset provenance/re-diff section, and 007's "genuine-analysis markers" troubleshooting entry
- 007 plan's D5/D13 "Python bundled in a TS package" deviation — marked retired

**Retained** (retained consumers depend on them): `src/analysis/secret-paths.ts` (used by `evidence/collect.ts` and `gather-context.ts`), `src/concurrency/shared-limiter.ts` (repo fan-out + agentic fallback).

---

## D12 — Dependencies

**Decision**: No `package.json` dependency changes. `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` are still used (bounded call + agentic correlator + model runtime). `zod`, `commander` unchanged. Node ≥ 22 retained (pi SDK minimum). The only "dependency" removed is the _runtime Python interpreter_, which was never an npm dependency — it was a documented environmental prerequisite, deleted from the docs in Phase 7.

**Rationale**: The feature's supply-chain win is removing vendored source and an out-of-band interpreter requirement, not trimming the npm tree.

---

## D13 — Reliability hardening (post-proof, from live `uds-sdk` runs)

**Decision**: five changes, all contained to `gather-context.ts` / `context-limits.ts` / `analyze-repo.ts` / `config.schema.ts`:

1. **Independent context budgets** — READMEs (≤ `MAX_README_FILES` / `MAX_README_TOTAL_BYTES`), manifests (`MAX_MANIFEST_TOTAL_BYTES`), and source excerpts each have their own budget instead of competing for one running total. A README-heavy repo was producing 14 READMEs and 0 source files.
2. **Walk depth 4 → 12** — a conventional Maven/Gradle layout puts real code at `src/main/java/<group>/<several.package.segments>/…`, depth 7–10; depth 4 never reached it, so Java/Kotlin services were analysed from manifests + READMEs only. `MAX_FILES_EXAMINED` / `MAX_LISTING_ENTRIES` still bound the cost (~20 ms on a 437-file repo).
3. **Tolerant JSON extraction** — `extractJsonObject` (renamed from `extractFirstJsonObject`) strips trailing commas and `//` / block comments, and synthesises the missing `}` / `]` closers for a truncated response before parsing.
4. **Differentiated retry** — the retry attempt prepends a stricter "return ONLY the JSON object, no prose/markdown/comments" preamble rather than resending the identical prompt.
5. **Partial salvage** — when strict `ModelAnalysisSchema` fails but the response still carries a usable `description` or a language/framework list, keep it as `analysisStatus: "partial"` with the unparseable sub-objects emptied, instead of failing the repository. The correlator reads raw source for interfaces anyway.

**Also**: default `analysis.maxConcurrency` 2 → **1**. A single local model serving two large-context 30B requests concurrently was observed returning unparseable output for one of them; serial runs went 4/4 where concurrent runs were 2–3/4. Still tunable up to 8 for smaller models or a stronger endpoint.

**Not adopted as default**: forcing JSON via a single-tool + `constrainedSampling: {type:"json_schema"}` call — implemented as opt-in in D14.6 below.

---

## D14 — LLM quality hardening (post-dogfood)

Running against `uds-sdk` and the arch-atlas monorepo itself surfaced three quality problems the D13 reliability work did not fix: (a) run-to-run variance in a repo's extracted interfaces, (b) `frameworks` reporting test/build tooling (`vitest`, `typescript`) as "the framework", (c) the agentic-fallback correlator producing plausible-sounding but unfounded connections ("both repos use AWS", "both depend on Keycloak").

**D14.1 — Low sampling temperature.** oMLX defaults `temperature: 1.0`; pi's `AgentSession.prompt` exposes no sampling knob and models.json has no `temperature` field, but `ModelRuntime.stream/complete` accept it in their options arg. `withSamplingDefaults()` (a `Proxy` over the runtime) injects `config.analysis.temperature` (default **0.1**) into every generation call — analysis and agentic correlation both. The single biggest variance reducer.

**D14.2 — Framework denylist + dependency split.** `gather-context` parses JSON manifests into `{ dependencies, devDependencies, peerDependencies }` name lists; the prompt says "frameworks come from RUNTIME deps, never dev deps". A post-processing `sanitizeFrameworks()` also strips a fixed denylist (`vitest`, `jest`, `eslint`, `typescript`, `tsx`, `turbo`, `webpack`, `@types/*`, …).

**D14.3 — Tighter prompt.** An explicit rules block: `frameworks` = runtime frameworks only; list an interface only with a `filePath`; `served` = what this repo exposes vs `outbound` = what it calls.

**D14.4 — Agentic-fallback tightening.** The prompt demands a concrete matching name/path/topic and forbids generic-similarity proposals; results kept only at `confidence ≥ 0.8` with a substantive reason; an `isGenericInfraReasoning()` filter drops "both repos use/depend on <shared third-party>" proposals. Agentic-fallback connections now map to the **`low`** confidence bucket (was `medium` in D11). On `uds-sdk` this cut agentic output from 4 noisy connections to 2, both surfaced as `low`.

**D14.5 — Deterministic interface hints.** `gather-context` runs the evidence parsers' URL-literal + topic extraction over the source excerpts and passes results into the prompt as "detected interface hints (crude scan, NOT authoritative — confirm/refine/classify)". Flips the model's job from open-ended discovery to verification, and gives a non-empty floor on a thin run.

**D14.6 — Constrained tool output (`analysis.structuredOutput: "tool"`, EXPERIMENTAL, default off).** A `submit_analysis` custom tool whose TypeBox `parameters` mirror `ModelAnalysisSchema`, with `constrainedSampling: { type: "json_schema", strict: "prefer" }`; `analyze-repo` registers it via `customTools`, reads the captured params, falls back to the text path if no tool call arrives. Implemented and unit-tested (incl. a zod↔TypeBox drift guard) — **but a live one-repo run against oMLX did not complete in 5 minutes**; guided decoding over this schema is pathologically slow there. Left opt-in and documented as such; the hardened text path stays the default.

**D14.8 — Grounding verify pass (`analysis.verifyGrounding: true`, opt-in).** A second bounded call: "return the analysis with any entry not supported by the provided source removed". Doubles per-repo cost; a verify hiccup is non-fatal.

**D14.9 — Operational-endpoint filter.** `sanitizeServed()` strips `/actuator/**`, `/health*`, `/metrics`, `/ping`, `/.well-known/**`, etc. from `served.httpRoutes` before persisting — every service exposes them and they produced cross-service false positives in the endpoint correlation pass.

**D14.10 — Eval harness (`test/eval/`, `pnpm eval`).** Standard practice for measuring prompt/pipeline quality is an eval: fixed inputs, hand-labelled ground truth, precision/recall/F1 per field, plus a consistency measure over N runs (since output is non-deterministic). Two golden sets: `fixtures` (in-repo, offline, exact) and `online-boutique` (`GoogleCloudPlatform/microservices-demo` at a pinned SHA — the polyglot demo UA's README points at). `pnpm eval` runs `analyzeRepo` N× per repo against a live local model, scores against `ground-truth.json`, writes a `baseline.json`; `pnpm eval --check` fails on a > 0.05 regression. The scoring logic (`score.ts`) is pure and unit-tested; the runner needs a live model and is not in `pnpm test`. **First baseline (Qwen3-Coder-30B / oMLX):** per-repo `frameworks`/`routes`/`languages` F1 ≈ 0.87–0.97 with `consistency` ≈ 0.97 on the real polyglot workspace (temperature 0.1 makes runs near-identical); `grpcServices` F1 ≈ 0.73; **connection recall on Online Boutique is 0** — every edge there is a gRPC call and the deterministic correlator only reasons about HTTP/topic/compose/manifest evidence. That last number is the clearest signal for future work: proto/gRPC-aware cross-repo correlation.
