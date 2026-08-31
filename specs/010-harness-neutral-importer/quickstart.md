# Quickstart: Harness-Neutral Importer

The importer is now a **deterministic core** plus a **choice of analysis producer**. Same
`import.yaml`, same output files, same Studio flow.

## The pipeline

```
1. gather-context   →  {repo}.context.json   (deterministic, offline)   [core]
2. <a producer>     →  {repo}.analysis.json  (one per repo)             [your choice]
3. import           →  architecture.review.yaml + architecture.arch.json (deterministic, offline) [core]
```

Step 3 makes **no** model call and **no** network request.

## Step 1 — gather context (once)

```bash
pnpm --filter @arch-atlas/llm-importer build
node apps/llm-importer/dist/cli.js gather-context import.yaml
# writes ./architecture-output/{repo}.context.json for every repo in import.yaml
```

## Step 2 — produce the analysis (pick one)

### Offline: the bundled local-model runner

```bash
pnpm --filter @arch-atlas/analysis-runner-local build
node packages/analysis-runner-local/dist/cli.js analyze import.yaml --from-bundles ./architecture-output
# reads {repo}.context.json, calls the local model in import.yaml's `localModel` block,
# writes {repo}.analysis.json
```

Optional — resolve pairs the deterministic passes couldn't link:

```bash
node packages/analysis-runner-local/dist/cli.js resolve-pairs import.yaml
# writes ./architecture-output/architecture.extra-connections.json  (merged by `import`)
```

### Claude Code (hosted API — opt-in)

Run the `.claude/skills/repo-analysis` skill once per repo (see its `README.md`). It reads a
`{repo}.context.json` and writes `{repo}.analysis.json`. Sends the secret-scrubbed bundle to a hosted
model — use the offline runner if that matters.

### Bring your own

Write `{repo}.analysis.json` however you like — a script, a CI job, by hand. The only contract is
`specs/010-*/contracts/analysis-producer-contract.md` (schema `RepoAnalysisSchema`).

## Step 3 — import

```bash
node apps/llm-importer/dist/cli.js import import.yaml
# reads every {repo}.analysis.json, correlates, writes review.yaml + arch.json
```

A repo with a missing or malformed `{repo}.analysis.json` is named and skipped; the rest still
produce a diagram. `--repos a,b` limits which analyses enter correlation.

## Verify (developer)

```bash
pnpm --filter @arch-atlas/llm-importer test          # core: model-free, no network
pnpm --filter @arch-atlas/analysis-runner-local test # runner: mocked fetch
pnpm --filter @arch-atlas/llm-importer lint typecheck
```

## Proof gate (one-time, live)

```bash
cd apps/llm-importer
# 1. model-free equivalence — uses committed fixtures/analyses/*.json
pnpm test -- model-free-pipeline

# 2. runner parity vs. the old pi-produced artifacts, against a local endpoint
RUN_LIVE=1 EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1 EVAL_MODEL_API_KEY=… \
  pnpm --filter @arch-atlas/analysis-runner-local test -- live-analyze

# 3. eval baseline holds
EVAL_MODEL_ENDPOINT=… EVAL_MODEL_ID=… EVAL_MODEL_API_KEY=… pnpm eval --set fixtures --runs 3 --no-judge --check
```

Recorded in `specs/010-harness-neutral-importer/proof.md`. Pass: model-free run byte-equivalent
(modulo timestamps) to the old `--aggregate-only`; runner artifacts within tolerance of the committed
fixtures; eval connection metrics within ±0.05 of the 009 baseline; `npm ls @earendil-works/pi-coding-agent`
in `apps/llm-importer` is empty.
