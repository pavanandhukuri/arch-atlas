# Quickstart: LLM Repository Importer

## Prerequisites

- Node.js ≥ 20
- pnpm 8+
- An Anthropic API key **or** a running Ollama instance with a model pulled

## 1. Build the package

```bash
pnpm --filter @arch-atlas/llm-importer build
```

## 2. Create a config file

Create `import.yaml` in your working directory:

```yaml
version: '1.0'

provider:
  type: anthropic # or "ollama" for local

output:
  directory: ./architecture-output

repositories:
  - path: /path/to/service-a
    name: Service A
  - path: /path/to/service-b
    name: Service B
```

## 3. Set your API key (cloud provider only)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 4. Run the importer

```bash
pnpm --filter @arch-atlas/llm-importer run import import.yaml
```

Or after building:

```bash
node packages/llm-importer/dist/cli.js import.yaml
```

## 5. Open the diagram

The generated file at `./architecture-output/architecture.arch.json` can be opened in the Arch Atlas Studio app.

---

## Common options

```bash
# Skip analysis, regenerate diagram from existing metadata
node packages/llm-importer/dist/cli.js import.yaml --aggregate-only

# Force re-analyze a single repo
node packages/llm-importer/dist/cli.js import.yaml --force-refresh --repos "Service A"

# Use local Ollama model
node packages/llm-importer/dist/cli.js import.yaml --provider ollama

# Skip cloud consent prompt in CI
node packages/llm-importer/dist/cli.js import.yaml --yes
```

## Troubleshooting

**"Repository path does not exist"**: Ensure the path in your config resolves to an existing, readable directory.

**"LLM provider not reachable"**: For Ollama, verify it's running (`ollama serve`) and the model is pulled (`ollama pull llama3`).

**"Metadata schema validation failed"**: The LLM produced output that doesn't match the expected schema. Try `--force-refresh` — a retry may succeed. If it persists, the repository may have an unusual structure; add a `description` hint to help the AI.

**Partial diagram generated**: One or more repos failed analysis. Check stderr output for details. The partial diagram contains all successfully analyzed repos.
