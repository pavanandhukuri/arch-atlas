# Quickstart: Repository Architecture Importer (Agentic Local-Model Rewrite)

## Prerequisites

- Node.js ≥ 22 (matches `pi`'s own minimum)
- pnpm 8+
- **A running local model server** — Ollama (`ollama serve`, with a model pulled: `ollama pull llama3`) or an MLX-style / other OpenAI-compatible local server. There is no cloud/hosted-API path in this revision (FR-017) — a local model is not optional.
- Python 3.11+ on `PATH` (used only to run two small vendored merge/normalize scripts as a subprocess step, research.md D5 — not needed for anything else)

## 1. Build the package

```bash
pnpm --filter @arch-atlas/llm-importer build
```

## 2. Create a config file

Create `import.yaml` in your working directory (v2.0 shape — see `contracts/config-schema-contract.md`; this is **not** compatible with the old `provider:` block):

```yaml
version: '2.0'

localModel:
  provider: ollama
  endpoint: http://localhost:11434/v1 # must be the OpenAI-compatible base URL, including /v1
  modelId: llama3
  # apiKey: '1234'  # optional — omit for keyless servers; some local servers (e.g. oMLX) require one

output:
  directory: ./architecture-output

analysis:
  maxConcurrency: 2 # shared across repos AND each repo's internal analysis batches

repositories:
  - path: /path/to/service-a
    name: Service A
  - path: /path/to/service-b
    name: Service B
```

## 3. Run the importer

```bash
pnpm --filter @arch-atlas/llm-importer run import import.yaml
```

Or after building:

```bash
node apps/llm-importer/dist/cli.js import.yaml
```

The tool first checks that `localModel.endpoint` is reachable and that `modelId` is available — this fails fast (exit code `2`) before any repository is touched if the local model isn't ready.

## 4. Open the diagram

The generated file at `./architecture-output/architecture.arch.json` can be opened in the Arch Atlas Studio app — the output format itself hasn't changed.

---

## Common options

```bash
# Skip analysis, regenerate diagram from existing knowledge-graph artifacts
node apps/llm-importer/dist/cli.js import.yaml --aggregate-only

# Force re-analyze a single repo
node apps/llm-importer/dist/cli.js import.yaml --force-refresh --repos "Service A"

# Override the shared concurrency limit
node apps/llm-importer/dist/cli.js import.yaml --max-concurrency 1

# Print per-tool-call agent progress (useful for watching a slow local model work)
node apps/llm-importer/dist/cli.js import.yaml --verbose
```

## Troubleshooting

**"Repository path does not exist"**: Ensure the path in your config resolves to an existing, readable directory.

**"Local model endpoint unreachable" (exit code 2)**: Verify your local model server is running and reachable at the configured `endpoint` (for Ollama: `ollama serve`, and confirm the model is pulled: `ollama pull llama3`).

**Endpoint check passes but analysis fails with 401/authentication errors**: The reachability check only confirms the server answers HTTP requests — it does not validate credentials. Some local servers (e.g. oMLX) require an API key even for localhost-only access; set `localModel.apiKey` in your config to the key shown in that server's settings.

**A repository's analysis fails after a retry**: The tool retries a repo's agent session exactly once (FR-010a) before skipping it and continuing with the rest. Check stderr for the failure reason — commonly the local model produced output that didn't parse as a valid knowledge graph. Smaller/weaker local models are more prone to this on large or unusual repositories; try a stronger local model, or add a `description` hint on that repo entry to help the agent orient itself.

**Results differ slightly between runs on the same repo**: Expected (spec NFR-003) — agent-driven analysis is best-effort consistent, not strictly deterministic, unlike the retired static-analysis pipeline. This is a known, accepted tradeoff of this revision, not a bug.

**Partial diagram generated**: One or more repos failed analysis (after their retry). Check stderr output for details. The partial diagram contains all successfully analyzed repos.

**A connection I expected is missing**: Check whether it would only be findable by the agentic correlation fallback (research.md D7) — the deterministic pass only matches literal identifiers (service names, ports, topics, env vars) shared across repos' knowledge graphs; if neither repo's analysis captured that literal identifier, the agentic fallback is the only path that could still find it, and it isn't guaranteed to.
