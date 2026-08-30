# Security Review — Bounded Per-Repository Analysis

Constitution Principle IV requires an explicit security review for data-import changes. This
feature changes how repository source reaches a model, so the review focuses there.

## Secret-path exclusion — enforced earlier, not later

- **007**: an excluded file (`.env`, `*.key`, `*.pem`, `*secret*`, …) was blocked at the
  agent's file-read _tool_ layer (`secret-exclusion-extension.ts`) — a deny-list applied
  before the tool executed. The agent still had general file-read tools.
- **008**: analysis performs **no arbitrary file reads**. `gather-context.ts` walks the
  repo once, applies `matchesSecretPattern` (the single-sourced `SECRET_PATH_PATTERNS`
  list, unchanged) during the walk, and an excluded path is never opened, never embedded
  in the prompt, never listed. The model receives a fixed text bundle and `tools: []`.
- **Test**: `gather-context.test.ts` plants `test/fixtures/repos/user-service/.env`
  (`FAKE_API_KEY=…`) and asserts the string, the path, and the filename appear nowhere in
  the produced `AnalysisContext` (SC-007). The live `uds-sdk` run confirmed the same at
  scale — no `.env`/secret content in any produced artifact.

Net: a strictly smaller attack surface (no general file-read capability during analysis)
and the same exclusion list, enforced before I/O rather than after.

## Untrusted model output

- The model response is treated as untrusted: it is JSON-extracted and validated against
  `RepoAnalysisSchema` (zod, not `.passthrough()`) before use. Invalid → one retry → the
  repo is reported failed and **no artifact is written** (`analyze-repo.test.ts`,
  `analysis-store` refuses to persist an invalid object).
- Extra/unexpected keys from a chatty model are stripped, not honoured.
- The adapter's output is re-validated against `RepositoryKnowledgeGraphSchema` before the
  correlator sees it; no dangling edges are emitted.

## No external egress

- FR-017 carries forward: `local-model-runtime.ts` has no code path that constructs a
  hosted-provider client. `config.schema.ts` exposes no field that could carry
  hosted-provider credentials. Verified by the existing `local-model-runtime` /
  `config-loader` tests.
- The bounded call and the agentic fallback both go through the same local-endpoint
  runtime.

## Logging

- `--verbose` prints prompt section headers and byte counts, never the model's raw
  response and never file contents. 007's tool-call event stream (which could surface
  read-tool previews of source) no longer exists in the analysis path.

## Removed code

- Deleting `vendor/understand-anything/` (+ its Python merge script) and
  `vendor/pi-subagent/` removes ~444 KB of third-party source and the standing
  "re-diff against upstream on every update" obligation, plus the Python interpreter
  as a runtime prerequisite. Net reduction in supply-chain surface (Constitution V).

## Residual risk

- Analysis is best-effort and non-deterministic (NFR-003): a repo can be reported failed
  on one run and succeed on the next (seen once in the `uds-sdk` run). FR-014
  partial-diagram handling covers this; it is a completeness, not a safety, concern.
