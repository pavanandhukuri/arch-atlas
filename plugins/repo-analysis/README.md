# repo-analysis

Produces `{repo}.analysis.json` artifacts for the [arch-atlas](https://github.com/pavanandhukuri/arch-atlas)
repo importer. This is the (currently only) analysis producer arch-atlas ships — but it's not
tied to one product or one model.

## Works with any coding agent

The procedure lives in [`AGENTS.md`](./AGENTS.md), following the open
[agents.md](https://agents.md) convention adopted by 20+ coding agents — Claude Code, Cursor,
GitHub Copilot, OpenAI Codex, Windsurf, Gemini CLI, Aider, Jules, Zed, Devin, and more. Point any
AGENTS.md-aware agent at your workspace's `import.yaml` and it runs the whole pipeline itself —
`gather-context`, analyze every listed repository, then `import` — ending with
`architecture.review.yaml` ready to upload into Studio's import wizard. No separate deterministic
steps for you to run by hand. (It'll follow the same analysis
steps for a single repo path or a `{repo}.context.json` bundle too, if that's all you hand it —
`import` needs the whole workspace, so that step only runs when you point it at `import.yaml`.)

The procedure is also packaged as a skill (`skills/import/SKILL.md`, the canonical copy —
`AGENTS.md` is generated from it), and `archatlas init` installs it into your workspace in
whatever shape your agent reads. See [Install for your agent](#install-for-your-agent).

**Local model or hosted model — your choice.** The arch-atlas importer core
(`@archatlas/llm-importer`) is deterministic and makes no model call itself; it only ever
reads the `{repo}.analysis.json` files this procedure produces. Whichever model does the
actual analysis is entirely a property of how you've configured your coding agent (a local
Ollama/vLLM/MLX endpoint, or a hosted API) — arch-atlas has no opinion on it and no code path
that talks to a model directly.

## What this needs

Just **Node ≥ 22**. The procedure runs the importer CLI straight from npm with `npx`:

```bash
npx --yes @archatlas/llm-importer@latest gather-context import.yaml
npx --yes @archatlas/llm-importer@latest import import.yaml
```

No arch-atlas checkout, no build step. `npx` downloads and caches
[`@archatlas/llm-importer`](https://www.npmjs.com/package/@archatlas/llm-importer) on first
use. Run it against any collection of repositories, anywhere on disk.

## Install for your agent

From your workspace (the folder that holds `import.yaml`), no checkout needed:

```bash
npx --yes @archatlas/llm-importer@latest init --agent cursor      # or claude, copilot, codex, generic
npx --yes @archatlas/llm-importer@latest init --agent claude,cursor   # several at once
npx --yes @archatlas/llm-importer@latest init                     # asks, at a terminal
```

| Agent                                                        | `--agent`           | What it writes                                                                                                                          | Run it                                             |
| ------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Claude Code                                                  | `claude`            | `.claude/skills/arch-atlas-import/`                                                                                                     | `/arch-atlas-import import.yaml`                   |
| Cursor                                                       | `cursor`            | `.cursor/skills/arch-atlas-import/`                                                                                                     | `/arch-atlas-import` in Agent chat                 |
| GitHub Copilot                                               | `copilot`           | `.github/skills/arch-atlas-import/` and `.github/prompts/arch-atlas-import.prompt.md`                                                   | `/arch-atlas-import` (asks for the config path)    |
| Codex, Windsurf, Gemini CLI, anything that reads `AGENTS.md` | `codex` / `generic` | a marked block in `AGENTS.md` (created if missing, the rest of the file untouched) plus `.archatlas/repo-analysis/sample-analysis.json` | ask it to import this workspace from `import.yaml` |

`init` is idempotent — run it again after upgrading to refresh the files it owns; `--dry-run`
shows what would be written and `--dir <path>` targets another workspace. In Claude Code and
Cursor a skill is also its own slash command, which is why no separate command file is written.

## Install from the Claude Code marketplace

Claude Code users can instead install the plugin from this repo's marketplace (it also gives you the `/repo-analysis:import` command):

```
/plugin marketplace add pavanandhukuri/arch-atlas
/plugin install repo-analysis@archatlas
```

Or for a one-off / local development session, skip the marketplace:

```bash
claude --plugin-dir /path/to/arch-atlas/plugins/repo-analysis
```

(clone/copy just this `plugins/repo-analysis/` directory anywhere and point `--plugin-dir` at
that copy — nothing here depends on an arch-atlas checkout).

Once loaded, invoke the skill explicitly with `/repo-analysis:import`, or let Claude pick it up
automatically when you ask it to import a workspace for arch-atlas.

For any other AGENTS.md-aware agent, no install step is needed — just point it at this
directory (or copy `AGENTS.md` alongside the repositories you're analyzing) and ask it to
follow the procedure.

## Walkthrough (multi-repo workspace)

1. **Write `import.yaml`** listing the repositories and an output directory.

2. **Run the procedure against it** — point your agent at `import.yaml` and ask it to import the
   workspace. It runs the whole pipeline itself (via `npx @archatlas/llm-importer@latest`), in
   order:
   - `gather-context import.yaml` (deterministic, offline) — writes `{repo}.context.json` for
     every repo in one pass.
   - Analyzes each bundle, producing `./architecture-output/{repo}.analysis.json`.
   - `import import.yaml` (deterministic, offline) — correlates the analyses and writes
     `./architecture-output/architecture.review.yaml`.

   One request, and the workspace ends up with a review file ready to upload into Studio's
   import wizard. A repo whose `{repo}.analysis.json` turned out missing or malformed is named
   and skipped by the `import` step — the rest still make it into the review.

   (You can still hand it a single repo path or one `{repo}.context.json` bundle directly if
   you only want to (re-)analyze one repository — `import` only runs for a whole-workspace
   request, since it needs every repo's analysis to correlate across them.)

## Writing your own producer

The contract is just two files and two schemas — see
[`specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md`](https://github.com/pavanandhukuri/arch-atlas/blob/main/specs/010-harness-neutral-importer/contracts/analysis-producer-contract.md)
in the arch-atlas repo. Anything that emits a schema-valid `{repo}.analysis.json` (a script, a
CI job, a different agent, a person filling in the template above) works with the importer
unchanged.

## Maintaining this plugin

- `skills/import/SKILL.md` is the single source of truth. After editing it, run
  `pnpm --filter @archatlas/llm-importer sync:agent-kit` to regenerate `AGENTS.md` (a test fails
  if they drift). The npm build copies the skill folder into the published package, which is
  what `archatlas init` installs from.
- Bump `version` in **both** `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
  whenever the procedure changes (a test keeps them equal). Claude Code caches an installed
  plugin by that version, so without a bump existing users never receive the change.
- Cursor: submit this folder at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)
  (manually reviewed). Claude Code: the repo-root `.claude-plugin/marketplace.json` is the listing.
