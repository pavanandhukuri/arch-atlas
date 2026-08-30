# Quickstart: Repository Architecture Importer (Bounded-Analysis Revision)

## Prerequisites

- Node.js ≥ 22
- pnpm 8+
- **A running local model server** — Ollama (`ollama serve`, model pulled) or an MLX-style /
  other OpenAI-compatible local server. There is no cloud/hosted-API path (007 FR-017 carries
  forward) — a local model is required for the per-repository analysis call.
- _(No Python.)_ The 007 revision required a Python 3.11+ interpreter for a vendored merge
  script; this revision has no Python dependency at all.

## 1. Build

```bash
pnpm --filter @arch-atlas/llm-importer build
```

## 2. Config file

`import.yaml` — **the config shape is unchanged from 007** (v2.0):

```yaml
version: '2.0'

localModel:
  provider: ollama
  endpoint: http://localhost:11434/v1 # OpenAI-compatible base URL, including /v1
  modelId: llama3
  # apiKey: '1234'   # optional — some local servers (e.g. oMLX) require one

output:
  directory: ./architecture-output

analysis:
  # maxConcurrency: 1      # repos analyzed in parallel (default 1 — raise for small models / a beefy endpoint)
  # temperature: 0.1       # sampling temperature for the analysis call (default 0.1 — keep low; extraction, not generation)
  # verifyGrounding: false # opt-in second pass that drops findings not supported by the source (doubles per-repo cost)
  # maxFilesPerRepo: 200   # ceiling on files the context walk examines per repo

repositories:
  - path: /path/to/service-a
    name: Service A
  - path: /path/to/service-b
    name: Service B
```

## 3. Run

```bash
pnpm --filter @arch-atlas/llm-importer run import import.yaml
# or, after build:
node apps/llm-importer/dist/cli.js import.yaml
```

Per repository the tool gathers a bounded context (READMEs, manifests, a directory listing,
a few relevance-ranked source files — secret files are never read) and makes **one**
structured-output model call (plus at most one retry on invalid output). It writes
`{repo-name}.analysis.json` per repo, then runs the unchanged cross-repository correlation,
review-artifact assembly, and diagram export.

## 4. Open the diagram

`./architecture-output/architecture.arch.json` opens in Arch Atlas Studio. Each analyzed
repository's container now carries a short description and a technology label.

## Common options (unchanged from 007)

```bash
node apps/llm-importer/dist/cli.js import.yaml --aggregate-only      # skip analysis, rebuild from *.analysis.json
node apps/llm-importer/dist/cli.js import.yaml --force-refresh --repos "Service A"
node apps/llm-importer/dist/cli.js import.yaml --max-concurrency 1
node apps/llm-importer/dist/cli.js import.yaml --verbose
```

## Troubleshooting

**"Local model endpoint unreachable" (exit 2)** — the local server isn't answering at
`localModel.endpoint`. Start it (`ollama serve`) and confirm the model is available.

**Endpoint check passes but analysis fails with 401** — the reachability check doesn't
validate credentials; set `localModel.apiKey` if your server requires one (e.g. oMLX).

**A repository fails after a retry** — the model returned output that didn't parse or
didn't match the analysis schema twice in a row. The repo is skipped and the rest of the
run continues (partial diagram). Try a stronger local model, or add a `description` hint
on that repo entry.

**Every repo is re-analyzed after upgrading from 007** — expected: 007's
`*.knowledge-graph.json` artifacts are a different format and are ignored. New runs write
`*.analysis.json`.

**Results differ slightly between runs on the same repo** — expected (007 NFR-003 carries
forward): the analysis call is best-effort consistent, not byte-deterministic. The
cross-repository correlation stage that follows _is_ deterministic given fixed analysis
artifacts.

**A connection I expected is missing** — cross-repository correlation is unchanged from
007: the deterministic passes read repository source directly (manifests, URL literals,
compose, schemas, topics); the agentic fallback only runs for pairs nothing else resolved.
