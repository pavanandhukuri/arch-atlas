# Phase 0 Research: Agentic Local-Model Importer Rewrite

Source material for all decisions below: direct inspection of `earendil-works/pi` (SDK examples under `packages/coding-agent/examples/sdk/`, the official `subagent` example extension, and `packages/coding-agent/docs/rpc.md`) and `Egonex-AI/Understand-Anything` (`understand-anything-plugin/skills/understand/SKILL.md`, `packages/core/src/schema.ts`, `agents/*.md`), read in full during design discussion prior to this planning pass. Every decision below resolves a "NEEDS CLARIFICATION"-equivalent open question that was carried out of `spec.md` or surfaced while turning that spec into an implementable plan.

---

## D1 — Package location & language

**Decision**: Replace `apps/llm-importer` in place. Delete the Python source tree; the new TypeScript package lives at the same path.

**Rationale**: The spec (Q2) already committed to an immediate, full replacement with no fallback path — there is no scenario where the Python and TypeScript importers run side by side, so there is no reason to mint a second package name. Reusing the path also lets the new package join the rest of the monorepo's `turbo run typecheck lint test` pipeline instead of requiring a separate Python CI lane, which was a standing piece of tooling friction called out during design discussion.

**Alternatives considered**: New package name (`apps/repo-importer`) — rejected; adds directory churn with no benefit since the old app isn't kept around to disambiguate from.

---

## D2 — Orchestration model: who drives the multi-phase analysis

**Decision (revised)**: Run Understand-Anything's actual `/understand` skill natively inside a pi session — one session per repository, `cwd` set to that repository — rather than reimplementing phase orchestration as our own TypeScript control flow. Our code's job is to vendor a **trimmed, headless-adapted copy** of the skill (see D4) and its dependencies, launch it per repository via `createAgentSession`, and consume the resulting artifact. We do not write our own batcher, our own per-phase prompt sequencing, or our own subagent-dispatch driver.

**This supersedes the original D2**, which proposed a from-scratch TypeScript orchestrator to avoid depending on a local model correctly following UA's orchestration prose. On reflection that rationale was weaker than it first appeared: SKILL.md's own Error Handling section already specifies retry-once-then-skip-that-phase, "ALWAYS save partial results," and "NEVER silently drop errors" — essentially the same failure tolerance this project independently designed into FR-010a, just already built, tested, and maintained upstream. Reimplementing the orchestration layer ourselves would have meant maintaining a parallel, likely-worse version of logic UA already got right (batch sizing, cross-batch neighbor maps for import-based confidence boosts, node-id normalization, dangling-edge cleanup), for no benefit beyond a theoretical reliability concern the skill already mitigates.

**Rationale**: Directly reuses UA's already-correct, already-tested orchestration instead of reinventing it. Keeps this package's own code surface small (a session launcher + three targeted headless adaptations, D4) rather than an independently-maintained reimplementation of a multi-phase pipeline. The residual reliability risk (a local model still has to follow _some_ of SKILL.md's instructions correctly) is real but bounded by the skill's built-in partial-failure handling, and is no longer a reason to duplicate the whole orchestration layer.

**Alternatives considered**:

- Original D2 (fully custom TypeScript orchestrator, UA used only as a source of prompts/schema to port) — superseded, see above.
- Hybrid (support both a native-skill mode and a custom-orchestrator mode) — rejected as unnecessary complexity; no requirement motivates maintaining two extraction paths.

---

## D3 — Parallel/isolated analysis mechanism

**Decision**: Vendor a modified copy of pi's official example subagent extension (`packages/coding-agent/examples/extensions/subagent/index.ts`), installed into the same pi session that runs UA's skill (D2), so that skill's own "dispatch a subagent" instructions resolve to a real tool call. Its hardcoded `MAX_CONCURRENCY` (4) / `MAX_PARALLEL_TASKS` (8) constants are replaced with a shared, configurable limiter (see D8). Under D2's revised orchestration model this extension is invoked _by the top-level pi session running UA's skill_, per the skill's own Phase 2 instructions — not called directly by our own code, as the original D3 framed it.

**Rationale**: It's the only available mechanism pi offers for spawning isolated, concurrent, per-agent `pi` subprocesses (confirmed by reading its `index.ts`: `spawn(...)` per invocation, `mapWithConcurrencyLimit` for the parallel case) — UA's skill assumes exactly this capability exists (its Phase 2 instructions say "dispatch a subagent... run up to 5 concurrently"). Vendoring (not depending on the user having it installed under `~/.pi/agent/extensions/`) keeps the package self-contained, consistent with D6's "full control, no discovery" approach.

**Alternatives considered**: Reimplement subprocess spawning independently — rejected, no benefit over adapting the existing, working implementation.

---

## D4 — Which parts of Understand-Anything are used, and how the skill is adapted for headless operation

**Decision (revised)**: Vendor UA's actual skill assets — not hand-ported prompt excerpts — and run them with minimal, targeted patches for headless/non-interactive operation:

**Vendored as-is**: `agents/project-scanner.md`, `agents/file-analyzer.md`, `agents/assemble-reviewer.md` (default deterministic-validation path only — see below), the batching script (`compute-batches.mjs`), the merge/normalize script (`merge-batch-graphs.py` — stays Python, see D5, and is invoked by the skill itself exactly as UA designed it, requiring no integration code on our side), the language/framework context files (`languages/*.md`, `frameworks/*.md`), and the graph schema (`packages/core/src/schema.ts`) used for ingestion-time validation (D10).

**Skipped by trimming the vendored `SKILL.md`**: Phase 4 (`architecture-analyzer` — layers) and Phase 5 (`tour-builder` — guided tour) are removed from the phase sequence entirely, along with their corresponding agent definitions. The `--review` path (LLM `graph-reviewer`) is left unused — we always take the default deterministic inline-validate path, consistent with Q3's simple retry-once-then-skip behavior.

**Three headless adaptations, patched directly into the vendored `SKILL.md`**:

1. **Phase 0.5 (`.understandignore` generation)** — the "Wait for user confirmation before proceeding" step is replaced with "generate and proceed automatically," since there is no human present in a batch/CI run.
2. **Phase 0 git-worktree redirection and Phase 7 dashboard auto-launch** — both removed; the worktree redirect assumes a Claude-Code-managed worktree lifecycle that doesn't apply here, and dashboard auto-launch assumes an interactive terminal.
3. **Output location** — UA's skill hardcodes `$UA_DIR` to `$PROJECT_ROOT/.ua/` (inside the analyzed repository itself). Rather than patching this path-resolution logic (higher drift risk against upstream), our session driver lets the skill write there as designed, then copies `knowledge-graph.json` out to our own output directory (`data-model.md`'s `RepositoryKnowledgeGraph` artifact location) and removes the `.ua/` directory from the analyzed repository afterward, treating it as disposable intermediate output.

**Explicitly not vendored**: `domain-analyzer`, the LLM `graph-reviewer` agent, locale/output-language handling.

**Rationale**: The review wizard only consumes structural nodes and connection edges (per `data-model.md`); the skipped phases exist to serve UA's own dashboard/onboarding product and would spend local-model time and tokens generating output our pipeline discards on every import. Patching only three narrow, clearly-bounded spots in `SKILL.md` (rather than rewriting its orchestration) minimizes drift risk against upstream UA releases while still reusing its actual tested logic for everything else.

**Alternatives considered**: Hand-port individual prompt excerpts into new files we author ourselves (the original D4) — superseded; this either duplicates UA's prompts with our own subtly-different wording (drift risk without upstream benefit) or requires us to keep hand-syncing them, which is _more_ maintenance than patching three spots in the real file. Port the full 7-phase skill unmodified, including tour/layers — rejected, unnecessary local-model load for output we discard.

---

## D5 — Python dependency for merge/normalize logic

**Decision**: Keep `merge-batch-graphs.py` (and `merge-subdomain-graphs.py` if needed) as vendored Python scripts, invoked as a subprocess from the TypeScript orchestrator — not ported to TypeScript.

**Rationale**: This was an explicit, already-made call in this project's design discussion ("the skill will use python internally and I don't mind about it") — a known, accepted tradeoff, not an oversight to "fix" during planning. A Python 3.x interpreter becomes a runtime prerequisite for this package; the monorepo already carries a Python toolchain dependency elsewhere, so this isn't a new category of infrastructure for the repo as a whole, only for this specific package.

**Alternatives considered**: Port the merge logic to TypeScript for a single-runtime story — available as a later simplification if the Python subprocess boundary proves operationally annoying, but not undertaken now given the explicit prior preference.

---

## D6 — pi SDK integration pattern

**Decision**: Use pi's "full control" SDK pattern — `createAgentSession` with an explicit `ResourceLoader` (implementing `getSkills`/`getExtensions`/`getSystemPrompt`/etc. directly, per `examples/sdk/12-full-control.ts`), `SessionManager.inMemory()`, and `SettingsManager.inMemory()` — rather than relying on filesystem discovery of `~/.pi/agent/...`.

**Rationale**: Confirmed via the SDK examples that this is a first-class, documented pattern, not a workaround. It makes every analysis session self-contained and deterministic regardless of what happens to be installed on the machine running the CLI, which matters for a headless batch pipeline (and for CI, where nothing should be discovered from a developer's home directory).

**Alternatives considered**: Default `DefaultResourceLoader` discovery — rejected; fragile and non-reproducible across machines/CI.

---

## D7 — Cross-repository correlation (resolves spec FR-006 / Question 1: hybrid)

**Decision**: Two-pass correlator:

1. **Deterministic pass** (always runs, no LLM call): walk every repository's knowledge graph, extract literal identifiers from `service`/`endpoint`/`config`/`domainMeta`-equivalent nodes (service names, ports, URLs, topic/queue names, env-var values) the same way the retired Python `cross_repo_correlator.py` matched Kafka producer/consumer pairs and REST call targets, and emit a cross-repository connection wherever two repositories' literal identifiers match.
2. **Agentic fallback pass** (only for repository pairs the deterministic pass could not resolve): a bounded, local-model reasoning session given condensed summaries (not full graphs) of just the unresolved repositories, asked to identify likely connections.

**Rationale**: Directly implements the user's chosen answer to Question 1. The deterministic pass is fast, free, and reproducible and should resolve the large majority of real inter-service connections (most services declare their dependencies literally somewhere — an env var, a compose file, a config value); the agentic fallback only spends local-model time on the harder residual cases.

**Alternatives considered**: Deterministic-only (simpler, but would silently regress on connections only describable in prose); agentic-only (would make every import pay a correlation LLM cost even when literal evidence is available) — both rejected in favor of the hybrid the user selected.

---

## D8 — Concurrency control (resolves spec FR-016)

**Decision**: A single shared limiter (one semaphore/pool, one user-configurable `maxConcurrency` setting) is acquired by _both_ per-repository fan-out and the vendored subagent dispatcher's internal per-batch fan-out (D3). Default `maxConcurrency` is conservative (e.g. 2) given the target is a single local model server, not a hosted API built for high concurrency.

**Rationale**: Directly resolves the two-independently-scaling-fan-out-layers risk identified during design discussion — repo-level parallelism (today's `anyio.Semaphore(concurrency)` equivalent) stacked with pi's internal per-batch parallelism could otherwise send far more simultaneous requests to a single local model endpoint than it can handle, causing timeouts or severe queuing rather than the intended speedup.

**Alternatives considered**: Two independent limits multiplied together — rejected; this is precisely the risk being eliminated.

---

## D9 — Local model configuration surface

**Decision**: Extend the existing YAML/JSON run config (FR-001) with a `localModel` section (`endpoint`, `provider`: `ollama` | `mlx` | other OpenAI-compatible, `modelId`). At startup, the tool translates this into pi's own `ModelRuntime` configuration (`ModelRuntime.create({ modelsPath })` + custom model registration, per `examples/sdk/02-custom-model.ts`) rather than requiring the user to hand-author pi's native `models.json`.

**Rationale**: Keeps one config surface consistent with the existing config-file pattern instead of introducing a second, harness-specific config file the user has to learn. The unreachable-endpoint-fails-fast requirement (US4 scenario 2) is validated against this same config at startup, before any repository analysis begins.

**Alternatives considered**: Require users to hand-write pi's native `models.json` — rejected; leaks an implementation detail of the harness into the user-facing contract.

---

## D10 — Knowledge-graph node/edge schema

**Decision**: Define a TypeScript/zod schema that is a deliberately trimmed subset of UA's `GraphNodeSchema`/`GraphEdgeSchema`, and apply it as an **ingestion-time filter** on the real `.ua/knowledge-graph.json` UA's (unmodified, per D4) file-analyzer prompts produce — not as a constraint we ask the prompts themselves to respect. Kept node types: `file`, `function`, `class`, `module`, `config`, `document`, `service`, `table`, `endpoint`, `pipeline`, `schema`, `resource`. Dropped: Figma/design types (`page`, `screen`, `component`, `componentSet`, `instance`, `token`) and knowledge-base types (`article`, `entity`, `topic`, `claim`, `source`). Kept edge types: the structural/behavioral/data-flow/infrastructure categories relevant to architecture (`imports`, `calls`, `publishes`, `subscribes`, `reads_from`, `writes_to`, `depends_on`, `serves`, `routes`, `configures`, `deploys`, `provisions`, `triggers`). Dropped: semantic (`related`, `similar_to`) and knowledge/design-only edge types.

**Rationale**: This importer only ever hands the agent a source-code repository — never a Figma file or a knowledge base — so those node/edge categories should never legitimately appear in real output, but since D2's revision keeps UA's file-analyzer prompt unmodified, filtering happens on our side of the boundary (after UA's schema validation, before our correlator sees the data) rather than by asking a possibly-weaker local model to additionally respect a second, narrower type list on top of everything else SKILL.md already asks of it.

**Alternatives considered**: Reuse UA's full schema unmodified end-to-end (no filtering at all) — rejected; our correlator (D7) and confidence mapper (D11) only need to reason about architecture-relevant relationship types, and carrying the rest through adds surface area with no consumer.

---

## D11 — Confidence bucket mapping (resolves spec FR-004)

**Decision**: `weight ≥ 0.8` → `high`, `0.5 ≤ weight < 0.8` → `medium`, `weight < 0.5` → `low`, applied to whichever connection weight the analysis or correlation stage produced. A connection corroborated by the deterministic correlator (D7 pass 1) is bumped one bucket up (capped at `high`); a connection surfaced only by the agentic fallback (D7 pass 2) is capped at `medium` regardless of its raw weight.

**Rationale**: A monotonic weight→bucket mapping matches the "reasonable default" already documented in `spec.md`'s Confidence Representation section. The corroboration bump/cap makes the bucket reflect _how_ a connection was found, not just the raw number a model happened to assign — deterministic, literal-evidence matches should read as more trustworthy than a local model's best guess, mirroring the old static pipeline's confidence philosophy (manifest declarations outranked LLM-only inferences).

**Alternatives considered**: Pass UA's raw `weight` through unmapped and let the Studio wizard bucket it — rejected; keeps bucketing logic split across backend and frontend, and the wizard already expects a precomputed bucket (mirrors the retired `propose()` step, which precomputed `confidence` before writing the review file).

---

## D12 — Testing strategy under the constitution's TDD/coverage gate

**Decision**: Deterministic stages (config parsing, the D7 correlator, D11 confidence mapping, D10's ingestion-time schema filter, CLI argument handling, the D4 headless-adaptation patches applied to the vendored `SKILL.md`, and the D4 `$UA_DIR` copy/cleanup logic) get full unit-test coverage against fixture knowledge-graph JSON, no live model required. Since D2's revision, our own code no longer contains a multi-phase orchestrator or batcher to unit-test at that level — coverage there is replaced by confirming the _session-launch wrapper_ (correct `cwd`, correct vendored resource paths, correct retry-once-then-skip behavior per FR-010a) behaves correctly against a mocked `ModelRuntime`/`createAgentSession` (pi's own test suite mocks at this boundary — confirmed present under `packages/coding-agent/test/`). A small number of integration tests run the real vendored skill against a real local Ollama model only when one is available in the environment, and are skipped otherwise — mirroring how the retired Python suite skipped its Neo4j-backed tests when Neo4j wasn't available.

**Rationale**: The constitution's ≥80%-coverage, TDD-non-negotiable gate must be satisfiable in ordinary CI, which will not have a local model server running. Splitting deterministic-logic coverage (cheap, always-on) from live-model characterization (opt-in) is the only way to keep that gate meaningful without making CI flaky or requiring GPU infrastructure just to run the test suite. D2's revision actually shrinks the amount of custom orchestration logic needing this treatment, since UA's own phase sequencing is no longer ours to test.

**Alternatives considered**: Require a real local model in CI for all agent-related tests — rejected; non-portable, slow, flaky, and blocks contributors without local model infrastructure.

---

## D13 — Known deviation from constitution's "clearly separated packages" guidance

**Note, not a decision to resolve**: The constitution's Repository Structure section says Python usage should be "kept in clearly separated packages/apps." D5 bundles two small vendored Python scripts _inside_ the TypeScript package rather than as a separate app. This is called out explicitly in the plan's Constitution Check as a deliberate, narrow, already-justified deviation (two small utility scripts invoked as a subprocess, not a standalone Python application) rather than left unaddressed.
