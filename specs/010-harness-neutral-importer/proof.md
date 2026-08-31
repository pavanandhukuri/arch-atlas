# Proof: Harness-Neutral Importer (010)

## 1. Model-free core equivalence (SC-001, SC-006, FR-001/FR-014)

`test/integration/model-free-pipeline.integration.test.ts` runs a full `import` over the committed
`test/fixtures/analyses/*.json` (the pre-change pi-produced artifacts), pointing `repository.path` at
the real fixture repos so the deterministic passes run for real.

- Cross-repo edge set is **identical** to the pre-010 `--aggregate-only` output:
  ```
  gateway -> audit-service
  gateway -> notification-service
  gateway -> user-service
  user-service -> gateway
  user-service -> notification-service
  ```
- A global `fetch` spy records **0** calls (SC-001).
- Two runs produce a byte-identical `review.yaml` apart from `generated_at` (SC-006).
- One missing + one corrupt artifact → both named and skipped, diagram still built (FR-003).
- A config with a `localModel` block produces identical output to one without (FR-001 AS-4).

## 2. Supply chain (SC-002, FR-002)

`test/unit/no-agent-sdk.test.ts`: `apps/llm-importer/package.json` lists **no** `@earendil-works/*`
and **no** `typebox`; neither pi package is `require.resolve`-able from the importer. `pnpm-lock.yaml`
shrank accordingly. `grep -rn "@earendil\|typebox\|createAgentSession\|ModelRuntime" apps/llm-importer/src`
→ empty.

## 3. Bring-your-own producer (SC-004)

`test/unit/producer-contract.test.ts`: a **hand-written** `RepoAnalysis` object (imports no
runner-package code) is accepted by `import` and yields the expected `gateway -> orders-service`
candidate. Bumped-`schemaVersion` and missing-`served` artifacts are rejected / named-and-skipped.

## 4. Context bundle is secret-safe (SC-005)

`test/unit/context-bundle.test.ts` CB1: `serializeContextBundle(gatherContext('user-service', …))`
over the fixture with its planted `.env` → no bundle `relPath` contains `.env`. `serializeContextBundle`
re-asserts `matchesSecretPattern` and throws on a leak.

## 5. Reference runner unit coverage (FR-007/FR-009/FR-010, LR1–LR8)

`packages/analysis-runner-local` — 38 unit tests, mocked `fetch` / `chatComplete`:
SSE accumulation, non-2xx throw, `response_format` passthrough, **timeout abort (LR7)**,
**no full-prompt/response/apiKey in logs (LR8)**; one-retry, partial salvage, `verifyGrounding`,
`--from-bundles` (no repo read), fail-fast on unreachable endpoint (LR5), per-repo continue (LR3),
atomic write (LR4). Coverage ≥ 80% line/statement.

## 6. Skill (FR-011/FR-012)

`test/unit/skill-sample.test.ts`: `.claude/skills/repo-analysis/sample-analysis.json` satisfies
`RepoAnalysisSchema` and flows through `toCorrelationGraph`; `SKILL.md` names the schema fields and
carries the "opt-in / hosted-API" caveat; `README.md` names the offline alternative.

## 7. Full test + build

`pnpm -r lint build test` — all green.
`apps/llm-importer`: 26 files / 248 tests. `packages/analysis-runner-local`: 8 files / 38 tests
(+1 skipped live). Studio (296) and all other packages unaffected.

## 8. Live proof gate — eval baseline (SC-003, FR-020) — PENDING

Run against local oMLX and record here:

```bash
cd apps/llm-importer
EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1 EVAL_MODEL_ID=Qwen3-Coder-30B-A3B-Instruct-MLX-4bit \
EVAL_MODEL_API_KEY=… pnpm eval --set fixtures --runs 3 --no-judge
# then --set online-boutique --runs 3 --no-judge
```

Expected: connection metrics within the harness `TOLERANCE` (0.05) of the committed 009 baseline
(the analysis logic is byte-identical to pre-010 — only the transport changed: pi → `fetch`).
`RUN_LIVE=1 … pnpm --filter @arch-atlas/analysis-runner-local test -- live-analyze` for artifact
parity.

_(to be filled)_
