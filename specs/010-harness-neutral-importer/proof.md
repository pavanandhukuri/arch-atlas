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

`test/unit/skill-sample.test.ts`: `plugins/repo-analysis/skills/repo-analysis/sample-analysis.json` satisfies
`RepoAnalysisSchema` and flows through `toCorrelationGraph`; `SKILL.md` names the schema fields and
carries the "opt-in / hosted-API" caveat; `README.md` names the offline alternative.

## 7. Full test + build

`turbo run lint build test` — **27/27 tasks green**.
`apps/llm-importer`: 234 tests. `packages/analysis-runner-local`: 52 tests + 1 skipped live
(the eval's `score.test.ts` moved here with the eval). Studio (296) and every other package
unaffected. No `turbo` dependency-graph cycle (the eval lives in the runner package, which legitimately
depends on the importer — research D10).

## 8. Live proof gate — eval baseline (SC-003, FR-020)

Ran the **rewired eval** (analyses via `@arch-atlas/analysis-runner-local` → `chatComplete` →
`fetch`/SSE) against local oMLX (`Qwen3-Coder-30B-A3B-Instruct-MLX-4bit`, temp 0.1).

| set               | metric                         | 009 baseline | 010 (new runner path) | verdict              |
| ----------------- | ------------------------------ | ------------ | --------------------- | -------------------- |
| `fixtures`        | `connectionsRecall`            | 0.8–0.93     | **0.8**               | within tolerance     |
| `fixtures`        | `connectionsPrecision`         | 0.67–0.82    | **0.8**               | within tolerance (↑) |
| `online-boutique` | `connectionsRecall`            | 1.0          | **1.0** (stddev 0)    | identical            |
| `online-boutique` | `connectionsPrecision`         | 0.667        | **0.667**             | identical            |
| `online-boutique` | `grpcServicesF1`               | 0.733        | **0.833**             | within tolerance (↑) |
| `online-boutique` | `languagesF1` / `frameworksF1` | 0.97 / 0.88  | 1.0 / 0.87            | within tolerance     |

The transport swap (pi `session.prompt` → `chatComplete`) is a **no-op for output quality** — the
prompt / tolerant-parse / retry / salvage / sanitize logic is a verbatim relocation. Per-repo
analysis F1s wobble run-to-run on oMLX (a documented 009 property; one `fixtures` run rolled a weak
`languages`/`frameworks` — the artifacts still parsed and correlated). `eval/baseline.json`
regenerated for `online-boutique`; `fixtures` left at the committed 009 values (its connection
metrics held).

`RUN_LIVE=1 pnpm --filter @arch-atlas/analysis-runner-local test -- live-analyze` — env-gated
artifact-parity check against the committed pi-produced fixtures (skipped in CI).

## Conclusion

The importer core is deterministic and model-free, the pi SDK + `typebox` are gone, the three
producer paths work, and correlation quality is unchanged. All SCs met; SC-003 confirmed against a
live local model.
