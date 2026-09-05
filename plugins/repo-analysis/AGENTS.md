# repo-analysis — analysis producer for the arch-atlas importer

This is the canonical, tool-neutral procedure for producing one `{repo}.analysis.json`
artifact per repository for the [arch-atlas](https://github.com/pavanandhukuri/arch-atlas)
importer (`@arch-atlas/llm-importer`). It follows the [AGENTS.md](https://agents.md)
convention, so any coding agent that reads AGENTS.md (Claude Code, Cursor, GitHub Copilot,
OpenAI Codex, Windsurf, Gemini CLI, Aider, Jules, Zed, Devin, and others) can run it directly,
against whichever model you've configured that agent to use — local or hosted, your choice.
The arch-atlas importer core makes no model call itself and has no opinion on this.

## What this does

The importer core is deterministic and model-free: it reads `{repo}.analysis.json` files
already sitting on disk and correlates them into a cross-repository diagram. It never talks
to a model. Producing those `{repo}.analysis.json` files — reading a repository and
characterizing what it is, what it exposes, and what it depends on — is the one step in the
pipeline that benefits from a model, and this file is the procedure for doing that step with
whatever agent you're running. For a whole workspace, this procedure also runs the
surrounding deterministic steps (`gather-context` before, `import` after) itself, so a
developer's only manual steps are writing `import.yaml` and, at the end, reviewing the result
in Studio — everything in between is one request to your agent.

## Locating the arch-atlas importer

This procedure runs the `arch-atlas-import` CLI (built from `@arch-atlas/llm-importer`) to
gather context and, afterward, to correlate. That package isn't published to a registry yet,
so you need a checkout of the arch-atlas repo somewhere on disk — it does **not** need to be
the repository you're analyzing. If you don't already have one, clone it and build once:

```bash
git clone https://github.com/pavanandhukuri/arch-atlas.git
pnpm --filter @arch-atlas/llm-importer install
pnpm --filter @arch-atlas/llm-importer build
```

Below, `$ARCH_ATLAS_HOME` stands for that checkout's path — substitute the real path (ask the
user if it isn't obvious from context; check a project-level `ARCH_ATLAS_HOME` env var or an
AGENTS.md/README note first).

## Input

One of:

- **An `import.yaml` (the common case — a whole workspace)** — run
  `node $ARCH_ATLAS_HOME/apps/llm-importer/dist/cli.js gather-context <import.yaml>` once. This
  is deterministic and makes no model call; it writes `{outDir}/{name}.context.json` for
  **every** repository listed in the config in one pass. Then work through the Procedure below
  once per bundle it produced, writing every `{repoName}.analysis.json`, and finish by running
  `import <import.yaml>` yourself (Procedure step 4) — a single request to run this procedure
  against a workspace should end with `architecture.review.yaml` and `architecture.arch.json`
  sitting in `output.directory`, ready to upload into Studio's import wizard. No separate
  developer step in between.
- **A single repository path** — run the same command with `--repos <name>` to produce just
  `{outDir}/{name}.context.json`, then proceed as below for that one bundle.
- **A `{repo}.context.json`** context bundle — read it directly. **Do not** open any other
  file in the repository when you were given a bundle; the bundle is the complete,
  already-secret-scrubbed view.

## Procedure

1. Read the context bundle: `descriptionHint`, `readmes`, `manifests` + `dependencySplits`,
   `listing`, ranked `sourceExcerpts`, and the deterministic `detected` route/topic hints.
2. Determine, using **only** that material:
   - `description` — 1–3 sentences on what the repository is / does.
   - `languages` — the programming languages actually present.
   - `frameworks` — the **runtime / application** frameworks the code is built on (Express,
     Gin, Spring Boot, React, Next.js, gRPC, …). **Not** test runners, linters, bundlers, type
     stubs, or CLI tooling — those come from dev dependencies and must be excluded.
   - `served` — the interfaces THIS repo exposes:
     - `httpRoutes`: `[{ method?, path (must start with "/"), filePath? }]`. Exclude
       operational endpoints (`/health*`, `/actuator/**`, `/metrics`, `/livez`, `/readyz`,
       `/.well-known/**`, …).
     - `grpcServices`: `["package.v1.ServiceName", …]` — as declared in `.proto` / generated
       code.
     - `topics`: `[{ name, direction: "publish"|"consume"|"unknown", filePath? }]`.
     - `datastores`: `[{ name, kind?: "relational"|"document"|"keyvalue"|"blob"|"search"|"other" }]`.
   - `outbound` — systems this repo calls / depends on / publishes to:
     `[{ target, verb: "calls"|"depends_on"|"publishes"|"subscribes"|"reads_from"|"writes_to", detail, confidence? }]`.
     Prefer evidence in the source and the `detected` hints over guessing. Confirm the detected
     hints, drop false positives, add anything the crude scan missed.
3. Write `{outDir}/{repoName}.analysis.json` with this exact shape:

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "<ISO timestamp>",
  "repository": {
    "name": "<repoName from the bundle/config>",
    "path": "<repoPath>",
    "description": "<optional>"
  },
  "description": "…",
  "languages": ["…"],
  "frameworks": ["…"],
  "served": { "httpRoutes": [], "grpcServices": [], "topics": [], "datastores": [] },
  "outbound": [],
  "analysisStatus": "complete",
  "retryCount": 0
}
```

Use `"analysisStatus": "partial"` if the bundle was empty or you could not characterise the
repo with confidence.

4. If you were handed a whole workspace (`import.yaml`), repeat steps 1-3 for every context
   bundle `gather-context` wrote — don't stop after the first repository. Once every repository
   has a `{repoName}.analysis.json`, run
   `node $ARCH_ATLAS_HOME/apps/llm-importer/dist/cli.js import <import.yaml>` **yourself** (still
   deterministic, no model call — six evidence passes over the raw source plus a name-mention
   fallback). It's safe to always run this last: a repository with no or a malformed analysis
   artifact is named and skipped, the rest still produce a diagram. Report back the
   `architecture.review.yaml` / `architecture.arch.json` paths it wrote — that's the deliverable
   for a workspace request, not just the analysis artifacts.

## Validate

The file must satisfy `RepoAnalysisSchema`
(`$ARCH_ATLAS_HOME/apps/llm-importer/src/analysis/repo-analysis.schema.ts`). A quick check:
`node -e "import('$ARCH_ATLAS_HOME/apps/llm-importer/dist/index.js').then(m => console.log(m.RepoAnalysisSchema.safeParse(require('./out/<name>.analysis.json')).success))"`.

A worked example is in `skills/repo-analysis/sample-analysis.json` beside this file.
