# @arch-atlas/analysis-runner-local

The **reference, offline analysis producer** for the arch-atlas repository importer.

The importer core (`@arch-atlas/llm-importer`) is deterministic and makes no model call. It consumes
one `{repo}.analysis.json` per repository, produced by _some_ producer. This package is that producer
for the local-model case: it reads a repository (or its `{repo}.context.json` context bundle), makes
one bounded structured-output call to a **local, OpenAI-compatible** model endpoint, and writes a
schema-valid `{repo}.analysis.json`.

**Local endpoint only.** There is no hosted/cloud path here. To use a hosted model, use the
`repo-analysis` Claude Code skill instead (`.claude/skills/repo-analysis/`), or write your own
producer against `specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md`.

## Usage

```bash
pnpm --filter @arch-atlas/analysis-runner-local build

# analyse every repo in import.yaml against its `localModel` block
node packages/analysis-runner-local/dist/cli.js analyze import.yaml

# or from pre-gathered context bundles (offline-repeatable):
node apps/llm-importer/dist/cli.js gather-context import.yaml
node packages/analysis-runner-local/dist/cli.js analyze import.yaml --from-bundles ./architecture-output

# optional: resolve repo pairs the deterministic passes could not link
node packages/analysis-runner-local/dist/cli.js resolve-pairs import.yaml
```

Then `node apps/llm-importer/dist/cli.js import import.yaml`.

See `specs/010-harness-neutral-importer/` for the full contract and `quickstart.md` for the
end-to-end walkthrough.
