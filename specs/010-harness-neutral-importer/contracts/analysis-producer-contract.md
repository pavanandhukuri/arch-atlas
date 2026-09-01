# Contract: Analysis Producer

Anything that turns a repository (or its context bundle) into a `{repo}.analysis.json`. Not part of
the importer core. The bundled local runner, the Claude Code skill, and any third-party producer all
satisfy exactly this.

## Input

Either:

- a repository path (the producer runs its own context gathering — for the bundled tools, by calling
  `gatherContext` from `@arch-atlas/llm-importer`), **or**
- a `{repo}.context.json` (`ContextBundle`, see context-bundle-contract.md), which the producer MUST
  treat as the complete, already-secret-scrubbed view of the repository — it MUST NOT read
  additional files from the repo tree when given a bundle.

## Output

One file per repository at `{outDir}/{repoName}.analysis.json` whose content satisfies
`RepoAnalysisSchema` (unchanged from 008):

- `schemaVersion` MUST be `'1.0'`.
- `repository.name` MUST equal the repo name the importer knows it by (the `name` from the config
  entry, else the bundle's `repoName`).
- `analysisStatus` is `'complete'` or `'partial'`; `retryCount` is `0` or `1`.
- `served.grpcServices` entries SHOULD be the gRPC service names as declared (package-qualified is
  fine) — 009's `grpcPass` normalises them.
- Unknown extra keys are allowed; the importer strips them.

## Importer acceptance rules (core side, `analysis-store` + `run-import`)

| Rule                                               | Behaviour                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| File absent for a configured repo                  | repo named + skipped (`[skip] <name>: no analysis artifact`), run continues                          |
| File present, `RepoAnalysisSchema.safeParse` fails | repo named + skipped (`[skip] <name>: invalid analysis artifact — <first zod issue>`), run continues |
| File present, `schemaVersion` ≠ `'1.0'`            | treated as invalid (same as above) — never silently used                                             |
| Zero valid artifacts across the workspace          | clear message, no diagram written, exit `0`                                                          |
| Valid artifact, `--repos` filter excludes it       | not loaded (FR-016)                                                                                  |

## Guarantees a producer MUST uphold

- **AP1**: Output validates against `RepoAnalysisSchema`.
- **AP2**: Given only a `ContextBundle`, the producer reads no other file from the repo.
- **AP3**: A per-repo failure does not corrupt or partially write that repo's `.analysis.json`
  (write atomically: temp file + rename, or write only on success).
- **AP4**: The producer is free to be non-deterministic (it's a model); the importer's downstream
  correlation is deterministic given whatever artifacts result (007 NFR-003).

## Tests

- `test/integration/model-free-pipeline.integration.test.ts` (core) — uses the committed
  `test/fixtures/analyses/*.json` as if a producer made them; asserts the review + diagram.
- `test/unit/producer-contract.test.ts` (core) — a **hand-written** `RepoAnalysis` object (no runner
  code imported) is accepted; a version-bumped one is rejected; a missing-`served` one is rejected.
- Runner + skill each have their own producer tests (see their contracts).
