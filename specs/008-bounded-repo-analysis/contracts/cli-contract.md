# Contract: CLI — delta vs. 007

The CLI surface is **unchanged** from `specs/007-llm-repo-importer/contracts/cli-contract.md`.
Same command, same `<config-file>` argument, same flags (`--output`, `--force-refresh`,
`--repos`, `--analyze-only`, `--aggregate-only`, `--max-concurrency`, `--verbose`),
same exit codes (`0` ok, `1` config error, `2` local model unreachable).

Only the following observable details change:

## Per-repository artifact filename

| 007                                                   | 008                                            |
| ----------------------------------------------------- | ---------------------------------------------- |
| `{output.directory}/{repo-name}.knowledge-graph.json` | `{output.directory}/{repo-name}.analysis.json` |

`--aggregate-only` scans for `*.analysis.json`. If it finds only `*.knowledge-graph.json`
files it reports "no 008-format analysis artifacts found — re-run without --aggregate-only"
and exits `1`.

## Progress output wording

007 emitted phase-transition lines mirroring the vendored skill's phases
(`SCAN`, `ANALYZE`, `MERGE`, `SAVE`, ...). 008 emits:

```
Checking local model endpoint... http://localhost:11434/v1 (ollama)
✓ Model "llama3" endpoint is reachable

[analyze] notification-service: gathering context (7 files, 41 KB)
[analyze] notification-service: calling model...
[done] notification-service: TypeScript/Express · 1 route, 1 topic, 1 outbound intent

[analyze] user-service: gathering context (5 files, 22 KB)
[failed] user-service: model output failed schema validation after retry

⚠ 1 repository failed after retry:
  - user-service: model output failed schema validation after retry

Correlating across 1 repository...
  <pass summaries — unchanged from 007>

✓ Review artifact written to .../architecture.review.yaml
✓ Diagram written to .../architecture.arch.json
```

`--verbose` prints the rendered prompt's section headers and byte counts (never the
model's raw response verbatim — NFR-003 / constitution "log safely").

## Removed troubleshooting entries (Phase 7)

The 007 quickstart's "genuine-analysis markers are missing" and
"local model stalls after reading the skill" entries no longer apply and are deleted.
The Python 3.11+ prerequisite line is deleted.
