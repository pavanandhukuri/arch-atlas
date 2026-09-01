# repo-analysis skill

Produces `{repo}.analysis.json` artifacts for the arch-atlas importer using Claude Code, as an
alternative to the offline `@arch-atlas/analysis-runner-local`.

## Trade-off

**This path sends the (secret-scrubbed) context bundle to a hosted model API.** To stay fully
offline, use `packages/analysis-runner-local` instead — it does the same job against a local
OpenAI-compatible endpoint.

## Walkthrough (multi-repo workspace)

1. **Build the importer once**

   ```bash
   pnpm --filter @arch-atlas/llm-importer build
   ```

2. **Gather context bundles** (deterministic, offline)

   ```bash
   node apps/llm-importer/dist/cli.js gather-context import.yaml
   # writes ./architecture-output/{repo}.context.json for every repo in import.yaml
   ```

3. **Run this skill once per repo** — point it at each `{repo}.context.json` (or at a repo path,
   in which case it runs `gather-context` for you). It writes
   `./architecture-output/{repo}.analysis.json`.

4. **Import** (deterministic, offline)

   ```bash
   node apps/llm-importer/dist/cli.js import import.yaml
   # → architecture.review.yaml + architecture.arch.json
   ```

   A repo whose `{repo}.analysis.json` is missing or malformed is named and skipped; the rest still
   produce a diagram.

## Writing your own producer

The contract is just two files and two schemas — see
`specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md`. Anything that emits a
schema-valid `{repo}.analysis.json` (a script, a CI job, a different agent, a person filling in the
template above) works with the importer unchanged.
