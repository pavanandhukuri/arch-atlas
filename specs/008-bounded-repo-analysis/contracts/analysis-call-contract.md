# Contract: the bounded analysis call

**Applies to**: `src/analysis/gather-context.ts` + `src/analysis/analyze-repo.ts`.

## Guarantees

| #   | Guarantee                                     | How it's enforced                                                                                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Exactly one model turn per attempt            | `createAgentSession({ tools: [] })` + a single `session.prompt(...)`; no follow-up prompts                                            |
| G2  | No tool use / no file browsing by the model   | `tools: []` passed to `createAgentSession`                                                                                            |
| G3  | At most 2 model calls per repository          | outer loop over attempts `[0, 1]`; return on first success, `failed` after second failure                                             |
| G4  | No "keep going" / "continue" prompt ever sent | only one prompt string exists in `analyze-repo.ts`; asserted by test                                                                  |
| G5  | No hosted/cloud API call                      | model + runtime come from `local-model-runtime.ts`, which has no hosted-provider path (007 FR-017)                                    |
| G6  | No Python invoked                             | nothing in this path spawns a subprocess                                                                                              |
| G7  | Secret-excluded files never enter the prompt  | `gather-context.ts` applies `matchesSecretPattern` during the walk, before any file is read                                           |
| G8  | Context is bounded                            | fixed caps: `MAX_DEPTH`, `MAX_LISTING_ENTRIES`, `MAX_README_BYTES`, `MAX_SOURCE_FILES`, `MAX_SOURCE_BYTES`, `MAX_TOTAL_CONTEXT_BYTES` |

## Input: `AnalysisContext` → prompt

`analyze-repo.ts` renders the `AnalysisContext` (see `data-model.md`) into a single
prompt with clearly delimited sections:

```
You are analyzing ONE repository. Use ONLY the material below. Do not ask questions.
Respond with a SINGLE JSON object and nothing else, matching this shape: <shape>

## Repository
name: {repoName}
{descriptionHint ? "hint: " + descriptionHint : ""}

## READMEs
<each: "### {relPath}\n{text}">

## Manifests
<each: "### {relPath}\n{text}">

## Directory listing
<newline-joined listing>

## Selected source files
<each: "### {relPath}{truncated ? " (truncated)" : ""}\n{text}">
```

The `<shape>` block is the "Model-facing sub-shape" from
`contracts/repo-analysis-schema.md`.

## Output handling

1. Accumulate assistant `text_delta` deltas from `session.subscribe` (same event
   shape as `agentic-correlator.ts`).
2. `extractJsonObject`: scan from the first `{`, tracking `{}`/`[]` nesting and
   strings. Tolerant of code fences / surrounding prose, trailing commas, `//` and
   block comments, and a **truncated (unclosed) response** — the missing `}`/`]`
   closers are synthesised before parsing (research.md D13.3). No object found ⇒
   throw ⇒ retry/fail per G3.
3. `coerceModelAnalysis`: strict `ModelAnalysisSchema` first; on failure, salvage
   via `SalvageModelAnalysisSchema` when real signal remains (→ `analysisStatus:
"partial"`), else throw ⇒ retry/fail per G3. Then merge the tool-set fields
   (`schemaVersion`, `analyzedAt`, `repository`, `analysisStatus`, `retryCount`)
   and validate the whole against `RepoAnalysisSchema`.
4. On success, `analysis-store.ts` writes `{repo-name}.analysis.json`.

**Retry (attempt 1)** re-issues the call with a stricter preamble prepended —
"a previous attempt produced output that could not be parsed; respond with ONLY
the JSON object, no markdown/prose/comments/trailing commas" (research.md D13.4).
It is a fresh call (FR-007), not a same-session nudge, so G4 still holds.

## Return type

```ts
type AnalyzeRepoResult =
  | { status: 'complete'; analysis: RepoAnalysis; retryCount: 0 | 1 }
  | { status: 'failed'; error: string; retryCount: 1 };
```

Runs inside `limiter.run(...)` (shared concurrency, FR-011). `run-import.ts`'s
existing `failures[]` / `reportFailures` / partial-diagram handling consumes
`status: 'failed'` unchanged.

## Contract tests (mocked `createAgentSession`)

- Happy path: one `prompt` call, valid object streamed back ⇒ `status: 'complete'`,
  `retryCount: 0`, artifact written.
- Invalid-then-valid: first response prose-only, second valid ⇒ `status: 'complete'`,
  `retryCount: 1`.
- Invalid-twice ⇒ `status: 'failed'`, `retryCount: 1`, **no** artifact written.
- `prompt` is called at most twice across the whole call; no prompt string contains
  "continue" / "keep going" / "not complete". The attempt-1 prompt does contain the
  stricter "previous attempt … ONLY the JSON object" preamble; the attempt-0 prompt
  does not.
- Trailing-comma / `//`-comment / truncated-object responses are recovered without a
  retry.
- A response with a valid `description` but missing/malformed `served` ⇒
  `status: 'complete'`, `analysisStatus: 'partial'`.
- `createAgentSession` is called with `tools: []`.
