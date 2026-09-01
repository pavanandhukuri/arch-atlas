# Contract: `@arch-atlas/analysis-runner-local`

Reference local-model analysis producer. **Local endpoint only — no hosted/cloud service.**

## Public API (`src/index.ts`)

```ts
export function chatComplete(opts: {
  endpoint: string;
  modelId: string;
  apiKey?: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  responseFormat?: unknown; // OpenAI `response_format` passthrough
  timeoutMs?: number; // default 120_000; aborts the request (constitution IV)
  signal?: AbortSignal; // caller signal, combined with the timeout
}): Promise<string>;
// Logging: never logs the full prompt or the full response body. A truncated
// preview (first ~200 chars) at debug level only; the apiKey is never logged.

export function analyzeRepoLocal(opts: {
  repoName: string;
  input: { repoPath: string; descriptionHint?: string } | { bundle: ContextBundle };
  endpoint: string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
  structuredOutput?: 'prompt' | 'tool';
  verifyGrounding?: boolean;
  signal?: AbortSignal;
}): Promise<
  { status: 'complete' | 'partial'; analysis: RepoAnalysis } | { status: 'failed'; error: string }
>;

export function resolveUnresolvedPairs(opts: {
  pairs: UnresolvedRepoPair[];
  graphsByName: Map<string, RepositoryKnowledgeGraph>;
  endpoint: string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
}): Promise<CrossRepositoryConnection[]>; // each foundBy: 'agentic-fallback'

export function checkLocalModelReachable(
  cfg: { endpoint: string; apiKey?: string },
  timeoutMs?: number
): Promise<void>;
export class LocalModelUnreachableError extends Error {}
```

- `analyzeRepoLocal` = the relocated `analyzeRepo`: `renderPrompt` → `chatComplete` →
  `extractJsonObject` → `coerceModelAnalysis` → sanitize; **one retry** with `RETRY_PREAMBLE` on
  invalid output; **partial salvage** via `SalvageModelAnalysisSchema`; optional `verifyGrounding`
  second pass. Behaviour parity with the pre-change `analyze-repo.ts` (FR-009).
- `resolveUnresolvedPairs` = the relocated `agentic-correlator` (same `condenseForPrompt`,
  `MIN_AGENTIC_CONFIDENCE = 0.8`, `isGenericInfraReasoning` filter), `createAgentSession` →
  `chatComplete`.

## CLI

```
analysis-runner-local analyze <config> [--out <dir>] [--repos <a,b>] [--force-refresh] [--from-bundles <dir>]
analysis-runner-local resolve-pairs <config> [--out <dir>]
```

- `analyze`: reads `RunnerConfigSchema` from `<config>` (the shared `import.yaml`); requires
  `localModel`. Fails fast via `checkLocalModelReachable` **before** processing any repo (writes
  nothing on an unreachable endpoint). For each repo (respecting `--repos`; skipping ones with a
  valid cached `.analysis.json` unless `--force-refresh`): `analyzeRepoLocal` → write
  `{out}/{name}.analysis.json` **atomically** (temp + rename). A per-repo failure is logged and the
  batch continues. `--from-bundles <dir>` reads `{name}.context.json` instead of walking the repo.
- `resolve-pairs`: runs `correlateDeterministically` on the loaded analyses to get `unresolvedPairs`,
  calls `resolveUnresolvedPairs`, writes `{out}/architecture.extra-connections.json`
  (`ExtraConnectionsSchema`). Writes nothing if there are no unresolved pairs or no connections found.

Exit codes: `0` success (incl. per-repo skips), `1` config error, `2` endpoint unreachable.

## `RunnerConfigSchema`

Superset view of the shared config: `localModel` **required**, `output.directory`, `repositories`,
and the full `analysis` block (`temperature`, `verifyGrounding`, `structuredOutput`, `maxConcurrency`,
`forceRefresh`, `maxFilesPerRepo`, `excludePatterns`).

## Guarantees

| #   | Guarantee                                                                                                  | Maps to                     |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| LR1 | Every outbound request targets `config.localModel.endpoint`; no other host is contacted, under any config. | FR-008, SC (local-only)     |
| LR2 | Every written `.analysis.json` validates against `RepoAnalysisSchema`.                                     | FR-007, AP1                 |
| LR3 | Invalid model output → one retry → salvage-or-`failed`; the batch continues.                               | FR-009, FR-010              |
| LR4 | A `.analysis.json` is never left partially written on failure.                                             | AP3                         |
| LR5 | An unreachable endpoint fails before any repo is processed; no files written.                              | Edge Cases                  |
| LR6 | `analyze --from-bundles` reads no file from the repo tree.                                                 | AP2                         |
| LR7 | Every model request has a bounded timeout; a hung endpoint aborts, does not stall the batch.               | constitution IV             |
| LR8 | No log line contains the full prompt, the full response, or the `apiKey`.                                  | constitution IV (redaction) |

## Tests

- `openai-client.test.ts` — mocked `fetch`: SSE accumulation, non-2xx → throw with status,
  `responseFormat` passthrough, `AbortSignal`.
- `parse.test.ts` / `sanitize.test.ts` / `prompt.test.ts` — the relocated tests, unchanged assertions.
- `analyze-repo.test.ts` — mocked `chatComplete`: happy path, one-retry, salvage, `verifyGrounding`,
  `--from-bundles` path.
- `agentic-fallback.test.ts` — mocked `chatComplete`: filter + `low`-confidence shaping; writes a
  schema-valid extra-connections file.
- `reachability.test.ts` — mocked `fetch`: reachable / 401 / timeout.
- `integration/live-analyze.integration.test.ts` — env-gated (`RUN_LIVE`), real endpoint, fixtures →
  `.analysis.json` parity with `apps/llm-importer/test/fixtures/analyses/*.json` within a tolerance.
