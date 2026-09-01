---
name: repo-analysis
description: Produce a {repo}.analysis.json for the arch-atlas importer from one repository (or its context bundle). Use when the user wants to run the arch-atlas repo importer with Claude instead of the local-model runner.
---

# repo-analysis — analysis producer for the arch-atlas importer

The arch-atlas importer core (`@arch-atlas/llm-importer`) is deterministic and makes **no** model
call. It consumes one `{repo}.analysis.json` per repository. This skill is one way to produce that
file — using Claude Code (a hosted model API).

**This is an opt-in hosted-API path.** It sends the repository's context bundle (READMEs, manifest
excerpts, a directory listing, a handful of relevance-ranked source excerpts — secret files are
already excluded) to a hosted model. To stay fully offline, use `packages/analysis-runner-local`
instead.

## Input

One of:

- **A repository path** — run `node apps/llm-importer/dist/cli.js gather-context <import.yaml> --repos <name>`
  (or `pnpm --filter @arch-atlas/llm-importer run import -- gather-context …`) to produce
  `{outDir}/{name}.context.json`, then proceed as below.
- **A `{repo}.context.json`** context bundle — read it directly. **Do not** open any other file in
  the repository when you were given a bundle; the bundle is the complete, already-secret-scrubbed
  view.

## Procedure

1. Read the context bundle: `descriptionHint`, `readmes`, `manifests` + `dependencySplits`,
   `listing`, ranked `sourceExcerpts`, and the deterministic `detected` route/topic hints.
2. Determine, using **only** that material:
   - `description` — 1–3 sentences on what the repository is / does.
   - `languages` — the programming languages actually present.
   - `frameworks` — the **runtime / application** frameworks the code is built on (Express, Gin,
     Spring Boot, React, Next.js, gRPC, …). **Not** test runners, linters, bundlers, type stubs,
     or CLI tooling — those come from dev dependencies and must be excluded.
   - `served` — the interfaces THIS repo exposes:
     - `httpRoutes`: `[{ method?, path (must start with "/"), filePath? }]`. Exclude operational
       endpoints (`/health*`, `/actuator/**`, `/metrics`, `/livez`, `/readyz`, `/.well-known/**`, …).
     - `grpcServices`: `["package.v1.ServiceName", …]` — as declared in `.proto` / generated code.
     - `topics`: `[{ name, direction: "publish"|"consume"|"unknown", filePath? }]`.
     - `datastores`: `[{ name, kind?: "relational"|"document"|"keyvalue"|"blob"|"search"|"other" }]`.
   - `outbound` — systems this repo calls / depends on / publishes to:
     `[{ target, verb: "calls"|"depends_on"|"publishes"|"subscribes"|"reads_from"|"writes_to", detail, confidence? }]`.
     Prefer evidence in the source and the `detected` hints over guessing. Confirm the detected hints,
     drop false positives, add anything the crude scan missed.
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

Use `"analysisStatus": "partial"` if the bundle was empty or you could not characterise the repo
with confidence.

4. Repeat per repository, then the user runs `node apps/llm-importer/dist/cli.js import <import.yaml>`.

## Validate

The file must satisfy `RepoAnalysisSchema` (`apps/llm-importer/src/analysis/repo-analysis.schema.ts`).
A quick check: `node -e "import('@arch-atlas/llm-importer').then(m => console.log(m.RepoAnalysisSchema.safeParse(require('./out/<name>.analysis.json')).success))"`.

A worked example is in `sample-analysis.json` beside this file.
