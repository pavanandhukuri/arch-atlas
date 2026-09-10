# Contract: Eval CLI

Two `tsx` scripts under `apps/llm-importer/eval/`, wired as package scripts. Neither ships in the
npm tarball.

```jsonc
// apps/llm-importer/package.json  (scripts, additive)
"eval": "tsx eval/run.ts",
"eval:extract": "tsx eval/extract.ts"
```

Invoke via the workspace filter: `pnpm --filter @archatlas/llm-importer eval -- <args>`.

---

## `eval` — correlation eval (deterministic, CI-gating)

Scores every golden set under `eval/golden/*/` (currently one: `fixtures`). For each set:
load config → read committed `<name>.analysis.json` (patch `repository.path`) → `toCorrelationGraph`
→ `correlateDeterministically` → `assembleReviewFile` → `scoreConnections` + `scoreExternalSystems`.

### Modes

| invocation                  | behaviour                                                                                                                                                                          | exit                                                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval` (no args)            | Print a per-set table: expected vs predicted connections and external systems, and precision / recall / F1 for each. If `baseline.json` exists, append a `✓/✗ vs baseline` column. | `0` always                                                                                                                                                                                                                                                 |
| `eval -- --check`           | Compute scores; compare every metric in `baseline.json`.                                                                                                                           | `0` if every `current ≥ baseline − 0.02`; `1` if any metric regressed (prints each offending `set.metric: baseline X → current Y (Δ −Z)`); `2` if `baseline.json` is missing or fails schema validation, or a ground-truth file is internally inconsistent |
| `eval -- --update-baseline` | Recompute scores and overwrite `baseline.json` (pretty-printed, fixed key order, trailing newline). Print the new values.                                                          | `0` on success; `2` on a load/parse failure                                                                                                                                                                                                                |
| `eval -- --set <name>`      | Restrict any of the above to one golden set.                                                                                                                                       | as above                                                                                                                                                                                                                                                   |

### Rules

- **Improvements never fail `--check`.** A metric above baseline prints `✓ (ahead +Z — consider --update-baseline)`.
- **Deterministic.** No model, no network, no clone. Two runs → byte-identical stdout (modulo a
  timestamp line that `--check` / `--update-baseline` do not emit).
- **Partial workspace.** A missing or schema-invalid `<name>.analysis.json` is reported
  (`[skip] <name>: <reason>`) and scoring proceeds over the rest — never a crash. (Matches the
  importer's own behaviour.)
- **< 10 s** for the shipped golden set (SC-001).

---

## `eval:extract` — extraction eval (model-dependent, local-only, never gates)

Scores **on-disk** `{repo}.analysis.json` (produced by a coding agent) against a golden set's
`ground-truth.repos` for `languages` / `frameworks` / served interfaces / `outbound`.

| invocation                                   | behaviour                                                                                                                                                                                                                                               | exit                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `eval:extract -- --set <name> [--out <dir>]` | For each repo in the set's ground truth, read `<out>/<name>.analysis.json` (default `<out>` = the set's `workspace`-adjacent `architecture-output/`, overridable), run `scoreRepoRun`, print a per-repo per-field P/R/F1 table + a per-field aggregate. | `0` **always** — it is a report, not a gate |
| `eval:extract` with no analyses found        | Print `no analysis artifacts found under <dir> — produce them first (see plugins/repo-analysis/AGENTS.md)`.                                                                                                                                             | `0`                                         |

- **Never invoked by CI.** `.github/workflows/ci.yml` runs `eval -- --check` only.
- No baseline, no `--check` mode. Its output is advisory tuning signal for the analysis procedure.

---

## CI contract

`.github/workflows/ci.yml`, `test` job, one added step after the coverage step:

```yaml
- name: Correlation eval (regression gate)
  run: pnpm --filter @archatlas/llm-importer eval -- --check
```

A regression (`exit 1`) or a broken/missing baseline (`exit 2`) fails the job and blocks merge.
