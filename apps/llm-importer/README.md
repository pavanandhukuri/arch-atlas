# @arch-atlas/llm-importer

Local-model-driven repository architecture importer. For each local repository it makes a
single bounded, structured-output call to a user-supplied local model (Ollama, MLX, or any
other OpenAI-compatible local endpoint — no hosted/cloud API path exists in this package)
over a deterministically-gathered context (README(s), manifest file(s), a bounded directory
listing, a few relevance-ranked source files). It then correlates connections across
repositories — deterministic evidence passes over raw repository source, with a bounded
agentic fallback for pairs those can't resolve — and produces the same review-artifact
format the Studio import wizard already consumes.

See `specs/008-bounded-repo-analysis/` in the repo root for the current spec, plan,
research decisions, data model, and contracts. `specs/007-llm-repo-importer/` is the
historical record of the earlier agentic-skill approach this replaced.

## Prerequisites

- Node.js ≥ 22
- A running local model server (Ollama: `ollama serve` + `ollama pull <model>`, or an
  MLX / OpenAI-compatible server)

_(No Python. The 007 revision required a Python 3.11+ interpreter for a vendored
Understand-Anything merge script; this revision has no Python dependency.)_

## Pipeline

```
repo → gather-context (bounded, deterministic, secret-paths excluded)
     → analyze-repo   (ONE model call, tools:[], one turn, one retry)  → {repo}.analysis.json
     → to-correlation-graph (adapter)
     → correlate      (evidence passes over raw source; agentic fallback for the rest)
     → assemble-review → architecture.review.yaml
     → build-diagram   → architecture.arch.json
```

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

Pairs no pass resolves fall through to the bounded agentic fallback.

## Development

```bash
pnpm --filter @arch-atlas/llm-importer typecheck
pnpm --filter @arch-atlas/llm-importer test
pnpm --filter @arch-atlas/llm-importer lint
```

See `specs/008-bounded-repo-analysis/quickstart.md` for end-to-end usage.
