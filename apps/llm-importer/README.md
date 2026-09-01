# @arch-atlas/llm-importer

**Deterministic, model-free** repository architecture importer. It gathers a bounded per-repo
context, reads one `{repo}.analysis.json` per repository (produced by _some_ analysis producer —
see below), correlates connections across repositories with deterministic evidence passes over the
raw source, and writes the review artifact the Studio import wizard consumes. **This package makes
no model call and no network request under any configuration.**

The one LLM step — turning a repository into its `{repo}.analysis.json` — is external and swappable
(010):

| Producer                            | Where                            | Model                                                                       |
| ----------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `@arch-atlas/analysis-runner-local` | `packages/analysis-runner-local` | **local** OpenAI-compatible endpoint, offline                               |
| `repo-analysis` skill               | `.claude/skills/repo-analysis`   | Claude Code — **hosted API, opt-in**                                        |
| your own                            | anything                         | anything — the contract is `RepoAnalysisSchema` + the context-bundle format |

See `specs/010-harness-neutral-importer/` for the producer contract. `specs/008-…` / `specs/007-…`
are the historical record of the earlier in-process agentic approaches.

## Prerequisites

- Node.js ≥ 22. **No Python. No local model server** for the importer itself (a producer may need one).

## Pipeline

```
repo → gather-context (bounded, deterministic, secret-paths excluded)  → {repo}.context.json
     → <external producer>                                             → {repo}.analysis.json
     → import:
         to-correlation-graph (adapter)
       → correlate            (deterministic evidence passes over raw source)
       → (+ optional architecture.extra-connections.json from a producer's fallback pass)
       → assemble-review      → architecture.review.yaml
       → build-diagram        → architecture.arch.json
```

`arch-atlas-import` has two subcommands: `gather-context <config>` (write the bundles) and
`import <config>` (build the diagram from `{repo}.analysis.json` artifacts). Neither contacts a
model or the network.

`src/correlate/evidence/` and `src/correlate/evidence-passes.ts` are a **port** — owned
and maintained here — of the deterministic cross-repository linker core from the author's
`understand-everything` project (MIT), adapted to this package's graph schema and
`CrossRepositoryConnection` contract, with additions developed here: gateway-prefix
route matching with a concrete-segment requirement, well-known external-system
detection from compose files, and (009) a **gRPC pass**.

### Deterministic evidence passes

| Pass       | Signal                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest` | a repo depends on a package another repo publishes (or a local path into its tree)                                                                                                           |
| `endpoint` | an HTTP URL literal in one repo matches an HTTP route another repo serves (exact, then gateway-prefixed)                                                                                     |
| `grpc`     | a gRPC client/stub construction site (`New…Client(`, `…Stub(`, `…Grpc.newBlockingStub(`, …) in one repo names a gRPC service another repo serves — directed `calls`, transport-tagged `grpc` |
| `schema`   | identical schema copies, proto-package drift, OpenAPI client coverage                                                                                                                        |
| `compose`  | compose files wiring services to repos / to well-known external systems (databases, brokers, auth)                                                                                           |
| `topic`    | cross-repo pub/sub on the same literal topic string                                                                                                                                          |

Pairs no pass resolves can optionally be linked by a producer's model-assisted fallback, written to
`architecture.extra-connections.json` and merged by `import` (e.g.
`analysis-runner-local resolve-pairs`).

## Development

```bash
pnpm --filter @arch-atlas/llm-importer typecheck
pnpm --filter @arch-atlas/llm-importer test
pnpm --filter @arch-atlas/llm-importer lint
```

See `specs/010-harness-neutral-importer/quickstart.md` for end-to-end usage (the three producer
paths + the model-free run).
