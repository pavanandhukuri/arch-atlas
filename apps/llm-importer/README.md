# arch-atlas-import

Scans a folder of Git repositories using static analysis and generates an architecture diagram JSON in the [Arch Atlas](https://github.com/pavanandhukuri/arch-atlas) schema.

**How it works**: manifest files (docker-compose, package.json, pom.xml) and code patterns (HTTP client calls, DB connections, Kafka usage) are extracted with confidence scores into an in-memory graph. A single LLM call at the end enriches the graph with canonical names and groupings. No code is sent to the LLM — only the extracted connection metadata.

## Install

```bash
# Recommended: pipx keeps the tool isolated
pipx install arch-atlas-import

# Or plain pip
pip install arch-atlas-import
```

Requires Python 3.11+.

## Quick start

```bash
# Run from the folder that contains all your repos
cd /workspace/projects
arch-atlas-import run .

# Or pass the path explicitly
arch-atlas-import run /workspace/projects
```

The output lands in `PROJECTS_DIR/.arch-atlas/architecture.arch.json`.

## Providers

### Ollama (local — default)

```bash
# Pull a model once
ollama pull qwen2.5-coder:7b

arch-atlas-import run . --provider ollama --model qwen2.5-coder:7b
# endpoint defaults to http://localhost:11434
```

### MLX (local — Apple Silicon)

Works with any local MLX server that exposes an OpenAI-compatible API — e.g. the
`omlx` macOS app, or `mlx_lm.server` from the `mlx-lm` PyPI package. Start your
server, load a model (defaults assume `Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`),
then point the CLI at it:

```bash
# omlx (and similar apps) require an API key even for local requests —
# set it to whatever the app is configured with.
export MLX_API_KEY=1234
arch-atlas-import run . --provider mlx --api-key-env MLX_API_KEY
# endpoint defaults to http://localhost:8000/v1
```

If your server runs on a different port, or doesn't require a key (e.g. plain
`mlx_lm.server`), add `--endpoint http://localhost:PORT/v1` and drop `--api-key-env`.

Any OpenAI-compatible local server works the same way via `--provider openai --endpoint <url>` — the `mlx` provider is just `openai` with MLX-friendly defaults baked in.

### Anthropic (cloud)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
arch-atlas-import run . --provider anthropic --model claude-opus-4-8
```

The CLI will list the repos whose metadata will be sent and prompt for confirmation unless `--yes` is passed.

## Configuration

Options can be set three ways (highest priority first):

1. **CLI flags** — `--provider ollama --model llama3`
2. **Environment variables** — `ARCH_ATLAS_PROVIDER=ollama ARCH_ATLAS_MODEL=llama3`
3. **Config file** — `~/.arch-atlas.yaml` (or `.arch-atlas.yaml` in the current directory)

### Config file format (`~/.arch-atlas.yaml`)

```yaml
provider: ollama # ollama | anthropic | openai | mlx
model: qwen2.5-coder:7b
endpoint: http://localhost:11434 # ollama, openai, mlx only
apiKeyEnv: ANTHROPIC_API_KEY # anthropic (and optionally openai/mlx) only
minConfidence: 0.5
concurrency: 3
```

## CLI reference

```
arch-atlas-import run [PROJECTS_DIR] [OPTIONS]

Arguments:
  PROJECTS_DIR    Parent folder containing repositories as subdirectories.
                  Defaults to the current directory.

Options:
  --config FILE           Path to YAML config file.
  --output DIR            Override output directory.
  --provider TYPE         LLM provider: anthropic | ollama | openai | mlx  [default: ollama]
  --model TEXT            Model name override.
  --endpoint URL          Provider endpoint (ollama/openai/mlx only).
                          [default: ollama http://localhost:11434, mlx http://localhost:8000/v1]
  --api-key-env NAME      Env var holding the Anthropic API key.
  --repos NAME,...        Process only a subset of repos (comma-separated).
  --force-refresh         Re-extract all repos, ignoring cached .metadata.json.
  --analyze-only          Extraction only — skip LLM enrichment.
  --aggregate-only        Skip extraction — re-run enrichment from cached metadata.
  --min-confidence FLOAT  Discard signals below this threshold.  [default: 0.5]
  --concurrency INT       Parallel repo extractions.  [default: 3]
  --verbose               Detailed per-repo progress.
  --yes                   Skip the Anthropic consent prompt.
  --help                  Show this message and exit.
```

## Output

```
PROJECTS_DIR/
└── .arch-atlas/
    ├── <repo-name>.metadata.json    # per-repo extracted connections
    └── architecture.arch.json       # final diagram (Arch Atlas format)
```

`architecture.arch.json` conforms to `@arch-atlas/model-schema`.

## Incremental mode

Re-running skips repos that already have valid `.metadata.json` files. Use `--force-refresh` to re-extract everything. Use `--aggregate-only` to re-run just the LLM enrichment step against existing metadata (fast, no re-scanning).

## Security

The following are **always excluded** from static analysis and never appear in LLM prompts:

- `.env`, `.env.*` — environment files
- `*.key`, `*.pem`, `*.p12` — certificates and private keys
- Files matching `*secret*`, `*credential*`, `*password*`
- `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.venv/`

## Development

```bash
git clone https://github.com/pavanandhukuri/arch-atlas
cd apps/llm-importer
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest               # runs all tests (80% coverage required)
mypy llm_importer/
```
