# `test/fixtures/analyses/`

Pre-canned `RepoAnalysis` artifacts (008-bounded-repo-analysis, schema
`src/analysis/repo-analysis.schema.ts` / `contracts/repo-analysis-schema.md`).

Each file corresponds to a repository under `test/fixtures/repos/` and accurately
describes that fixture's served interfaces and outbound intents, so unit and
integration tests can exercise the correlator, review assembly, and export
without invoking a model.
