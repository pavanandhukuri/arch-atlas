# repo-analysis — analysis producer for the arch-atlas importer

This is the canonical, tool-neutral procedure for producing one `{repo}.analysis.json`
artifact per repository for the [arch-atlas](https://github.com/pavanandhukuri/arch-atlas)
importer (`@archatlas/llm-importer`). It follows the [AGENTS.md](https://agents.md)
convention, so any coding agent that reads AGENTS.md (Claude Code, Cursor, GitHub Copilot,
OpenAI Codex, Windsurf, Gemini CLI, Aider, Jules, Zed, Devin, and others) can run it directly,
against whichever model you've configured that agent to use — local or hosted, your choice.
The arch-atlas importer core makes no model call itself and has no opinion on this.

## What this does

The importer core is deterministic and model-free: it reads `{repo}.analysis.json` files
already sitting on disk and correlates them into a review artifact of candidate cross-repository
connections, for a human to confirm in Studio. It never talks
to a model. Producing those `{repo}.analysis.json` files — reading a repository and
characterizing what it is, what it exposes, and what it depends on — is the one step in the
pipeline that benefits from a model, and this file is the procedure for doing that step with
whatever agent you're running. For a whole workspace, this procedure also runs the
surrounding deterministic steps (`gather-context` before, `import` after) itself, so a
developer's only manual steps are writing `import.yaml` and, at the end, reviewing the result
in Studio — everything in between is one request to your agent.

## The CLI

This procedure runs the `archatlas` CLI (from the published
[`@archatlas/llm-importer`](https://www.npmjs.com/package/@archatlas/llm-importer) package)
to gather context and, afterward, to correlate. Run it with `npx` — no checkout, no build:

```bash
npx --yes @archatlas/llm-importer@latest <command> …
```

Requires Node ≥ 22. `npx` downloads and caches the package on first use. Pin a version instead
of `@latest` if you need reproducibility (e.g. `@archatlas/llm-importer@0.1.0`).

## Input

One of:

- **An `import.yaml` (the common case — a whole workspace)** — run
  `npx --yes @archatlas/llm-importer@latest gather-context <import.yaml>` once. This is
  deterministic and makes no model call; it writes `{outDir}/{name}.context.json` for **every**
  repository listed in the config in one pass. Then work through the Procedure below once per
  bundle it produced, writing every `{repoName}.analysis.json`, and finish by running
  `import <import.yaml>` yourself (Procedure step 6) — a single request to run this procedure
  against a workspace should end with `architecture.review.yaml` sitting in `output.directory`,
  ready to upload into Studio's import wizard. No separate developer step in between.
- **A single repository path** — run the same command with `--repos <name>` to produce just
  `{outDir}/{name}.context.json`, then proceed as below for that one bundle.
- **A `{repo}.context.json`** context bundle — read it directly. **Do not** open any other
  file in the repository when you were given a bundle; the bundle is the complete,
  already-secret-scrubbed view.

## Procedure

Each repository gets **two** passes, every time: first its external interface, then its internal
structure. Report them as two distinguishable steps per repository (e.g. "external interface for
catalog-service — done; internal structure for catalog-service — done") rather than one
undifferentiated "analyzed catalog-service" — the second pass roughly doubles the work per
repository, and that cost should be visible as it happens, not just inferable afterward from the
files it wrote.

1. Read the context bundle: `descriptionHint`, `readmes`, `manifests` + `dependencySplits`,
   `listing`, ranked `sourceExcerpts`, and the deterministic `detected` route/topic hints.

### Pass 1 — external interface

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

### Pass 2 — internal structure

This pass is **unconditional**: it runs for every repository, every time, as part of the same
request — never a separate ask, never skipped because a repository looks small or because you're
not sure anyone wants this level of detail. A near-empty result is a valid outcome for a trivial
repository; skipping the pass is not.

4. Using the same bundle, determine the repository's major internal components — its
   controllers, services, repositories/data-access layers, and other significant internal
   modules. Not every class or file: only the pieces that matter at an architectural glance. For
   each, give it a short `name`, a `kind` (free text — "controller", "service", "repository",
   "module", whatever fits), and a one-sentence `description`. Then determine the relationships
   between those components: which one calls, delegates to, or depends on which other one. Every
   `source`/`target` in a relationship must be the exact `name` of a component from this step —
   no dangling references.
5. Write `{outDir}/{repoName}.components.json` with this exact shape:

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "<ISO timestamp>",
  "repository": {
    "name": "<repoName from the bundle/config>",
    "path": "<repoPath>",
    "description": "<optional>"
  },
  "components": [{ "name": "…", "kind": "…", "description": "…" }],
  "relationships": [{ "source": "…", "target": "…", "description": "…" }],
  "analysisStatus": "complete",
  "retryCount": 0
}
```

Use `"analysisStatus": "partial"` if the bundle was empty or you could not characterize the
repository's internals with confidence — never an error, never a reason to skip the repository.
`components: []` and `relationships: []` are both valid for a repository too small or uniform to
have meaningful internal structure — don't invent components to fill the list.

### Every repository, then hand off to Studio

6. If you were handed a whole workspace (`import.yaml`), repeat steps 1-5 for every context
   bundle `gather-context` wrote — don't stop after the first repository, and don't skip a
   repository because `{outDir}/{repoName}.analysis.json` or `{outDir}/{repoName}.components.json`
   already exists there. Write fresh ones for every bundle regardless: prior files being present
   and schema-valid (e.g. a sample workspace's committed analyses) is not evidence the repo has
   already been analyzed **by you, now** — it means nothing, since you have no way to tell whether
   they're current. Once every repository has both artifacts, run
   `npx --yes @archatlas/llm-importer@latest import <import.yaml>` **yourself** (still
   deterministic, no model call — six evidence passes over the raw source plus a name-mention
   fallback). This same command now also reads every `{repoName}.components.json` it finds and
   folds each one straight into that repository's entry in the review artifact — so what you wrote
   in Pass 2 ends up embedded in the one file, not left as a second artifact. It's safe to always
   run this last: a repository with no or a malformed analysis artifact is named and skipped, a
   repository with no or a malformed components artifact simply keeps whatever external-interface
   data it has — neither ever fails the rest of the import.
7. Report back the single `architecture.review.yaml` path `import` wrote — that's the whole
   deliverable for a workspace request. It already carries every repository's external interface
   **and** internal structure; tell the human to upload just that one file into Studio's import
   wizard. There is nothing else to hand off, and no CLI call left for you to make.

## Validate

Each `{repo}.analysis.json` must satisfy the importer's `RepoAnalysisSchema`, and each
`{repo}.components.json` must satisfy its `ComponentAnalysisSchema`. You don't need a separate
validation step for either — the `import` run in Procedure step 6 parses every analysis **and**
components artifact it finds and names-and-skips (analysis) or simply omits (components) whichever
one fails its schema, so a malformed file shows up in that output. Match the shapes in the JSON
blocks above, and follow `skills/import/sample-analysis.json` / `sample-components.json` (worked examples beside
this file), and they will pass. If you want to check a components artifact yourself before running
`import` — e.g. while re-running Pass 2 alone for one repository, below — run
`npx --yes @archatlas/llm-importer@latest validate-components {outDir}/{repoName}.components.json`;
a non-zero exit names the schema problem.

## Re-running internal structure for one repository

The default procedure above covers a whole workspace every time. Occasionally one repository
still needs its internal-structure pass run (or re-run) on its own — its Pass 2 failed partway
through the main loop, or a human wants a fresher `{repoName}.components.json` for a repository
that's changed since the last full import. Run Procedure steps 1, 4, and 5 for just that one
repository's bundle (`gather-context <import.yaml> --repos <name>` first if you don't already have
its `{repoName}.context.json`), validate it as above, then:

- If the human hasn't yet uploaded a review file into Studio (the common case — this is usually
  faster than it sounds since `import` is fully deterministic): just re-run
  `npx --yes @archatlas/llm-importer@latest import <import.yaml>` **yourself**. It re-reads every
  repository's `.analysis.json`/`.components.json` from disk and rewrites `architecture.review.yaml`
  with the refreshed data folded in — no duplication, no second file, same as the default flow.
- If they've already uploaded a review file and built/saved a `.arch.json` from it, merge the
  refreshed components directly into that diagram file yourself with the `attach-components` CLI
  instead — it stays in the codebase exactly for this case, now that `import` itself handles the
  normal path:

  ```bash
  npx --yes @archatlas/llm-importer@latest attach-components \
    <path-to-their-diagram.arch.json> {outDir}/{repoName}.components.json \
    --container <repoName>
  ```

  `--container` must match the exact name of that repository's container element in the diagram.
  This command does the risky part itself — generating ids, computing a sensible on-canvas position
  for each new component, and splicing everything into the file — rather than you hand-editing the
  JSON, because a component added without a correct layout position would sit in the file but never
  actually render, with nothing telling anyone why. A non-zero exit means nothing was written; the
  original `.arch.json` is untouched. On success, report that the diagram file was updated and how
  many components/relationships were added — the human only needs to reopen it.
