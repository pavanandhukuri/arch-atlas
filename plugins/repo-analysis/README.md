# arch-atlas-repo-analysis (Claude Code plugin)

Produces `{repo}.analysis.json` artifacts for the [arch-atlas](https://github.com/pavanandhukuri/arch-atlas)
repo importer using Claude Code, as an alternative to the offline
`@arch-atlas/analysis-runner-local` runner. This is one of the two producers arch-atlas ships —
the other is a local-model plugin (`packages/analysis-runner-local` in the arch-atlas repo); both
implement the same contract, so you can mix and match per repository.

## Trade-off

**This path sends the (secret-scrubbed) context bundle of each repository you analyze to a
hosted model API** (Claude, via your own Claude Code session). To stay fully offline, use
`@arch-atlas/analysis-runner-local` instead — it does the same job against a local
OpenAI-compatible endpoint.

## What this plugin does — and doesn't — require

This plugin (the skill under `skills/repo-analysis/`) is portable: install it once and it works
against any collection of repositories you point it at, anywhere on disk. What it does **not**
provide is the arch-atlas importer CLI itself — `@arch-atlas/llm-importer` isn't published to a
package registry yet, so you need a checkout of the arch-atlas repo somewhere to get it. That
checkout does not need to contain (or be anywhere near) the repositories you're actually
analyzing; it's only the source of the `arch-atlas-import` CLI the skill drives.

```bash
git clone https://github.com/pavanandhukuri/arch-atlas.git
pnpm --filter @arch-atlas/llm-importer install
pnpm --filter @arch-atlas/llm-importer build
```

## Install

Test locally without any marketplace setup:

```bash
claude --plugin-dir /path/to/arch-atlas/plugins/repo-analysis
```

(or clone/copy just this `plugins/repo-analysis/` directory anywhere and point `--plugin-dir` at
that copy — the plugin itself doesn't need to live inside an arch-atlas checkout, only the CLI
does, per above).

Once loaded, invoke the skill explicitly with `/arch-atlas-repo-analysis:repo-analysis`, or let
Claude pick it up automatically when you ask it to analyze a repository for arch-atlas import —
its `SKILL.md` description is written for model-invocation.

## Walkthrough (multi-repo workspace)

1. **Gather context bundles** (deterministic, offline)

   ```bash
   node $ARCH_ATLAS_HOME/apps/llm-importer/dist/cli.js gather-context import.yaml
   # writes ./architecture-output/{repo}.context.json for every repo in import.yaml
   ```

2. **Run this skill once per repo** — point it at each `{repo}.context.json` (or at a repo path,
   in which case it runs `gather-context` for you). It writes
   `./architecture-output/{repo}.analysis.json`.

3. **Import** (deterministic, offline)

   ```bash
   node $ARCH_ATLAS_HOME/apps/llm-importer/dist/cli.js import import.yaml
   # → architecture.review.yaml + architecture.arch.json
   ```

   A repo whose `{repo}.analysis.json` is missing or malformed is named and skipped; the rest
   still produce a diagram. Import the resulting `architecture.review.yaml` into arch-atlas
   Studio's import wizard to finish.

## Writing your own producer

The contract is just two files and two schemas — see
[`specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md`](https://github.com/pavanandhukuri/arch-atlas/blob/main/specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md)
in the arch-atlas repo. Anything that emits a schema-valid `{repo}.analysis.json` (a script, a CI
job, a different agent, a person filling in the template above) works with the importer
unchanged.
