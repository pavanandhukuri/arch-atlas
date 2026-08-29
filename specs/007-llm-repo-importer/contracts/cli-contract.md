# CLI Contract: arch-atlas-import (TypeScript rewrite)

## Command

```
arch-atlas-import [options] <config-file>
```

Or via the monorepo's workspace script:

```
pnpm --filter @arch-atlas/llm-importer run import <config-file>
```

## Arguments

| Argument        | Type | Required | Description                                                        |
| --------------- | ---- | -------- | ------------------------------------------------------------------ |
| `<config-file>` | path | Yes      | Path to import config v2.0 (`.json` or `.yaml`/`.yml`) — unchanged |

## Options

| Flag                    | Default     | Description                                                                                                                                                                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--output <dir>`        | from config | Override output directory from config — unchanged                                                                                                                                                                        |
| `--force-refresh`       | `false`     | Re-analyze all repos even if a knowledge-graph artifact exists — unchanged in behavior, changed target artifact                                                                                                          |
| `--repos <names>`       | all         | Comma-separated repo names to analyze (subset of config) — unchanged                                                                                                                                                     |
| `--analyze-only`        | `false`     | Run per-repo agent analysis but skip correlation/review-assembly — unchanged in behavior                                                                                                                                 |
| `--aggregate-only`      | `false`     | Skip analysis, run correlation + review-assembly from existing knowledge graphs — unchanged in behavior                                                                                                                  |
| `--max-concurrency <n>` | from config | Override `analysis.maxConcurrency` (shared repo + internal-batch limiter, FR-016) — **replaces** v1.0's `--provider` flag's cousin; there is no `--provider` flag in this revision since only local models are supported |
| `--verbose`             | `false`     | Print detailed progress, including per-phase agent-session status — unchanged in spirit                                                                                                                                  |

**Removed from v1.0**: `--provider <type>` (no provider selection — config's `localModel.provider` is the only place this is set, and it never means "hosted API") and `--yes` (the cloud-provider consent prompt below no longer exists, since there is no cloud provider path — FR-017).

## Exit Codes

| Code | Meaning                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------- |
| `0`  | Success — diagram written                                                                       |
| `1`  | Config validation error                                                                         |
| `2`  | Local model endpoint unreachable (fails before any repository analysis begins — US4 scenario 2) |
| `3`  | All repository analyses failed (after their one retry each — FR-010a)                           |
| `4`  | Correlation/review-assembly failed                                                              |
| `5`  | Output write error                                                                              |

**Removed from v1.0**: exit code `5` ("user declined cloud provider consent") is repurposed above since there is no consent prompt in this revision; the old exit code `2` ("all repository analyses failed") is now `3` to make room for the new unreachable-endpoint fast-fail at `2`.

## Progress Output (stdout)

Per-repo agent analysis is expected to take substantially longer than the retired static extraction (spec NFR-001), so progress reporting is more granular — it surfaces phase transitions within a single repo's analysis, not just repo-level start/done:

```
[1/3] user-service: scanning project files...
[1/3] user-service: analyzing batch 1/4...
[1/3] user-service: analyzing batch 2/4...
[1/3] user-service: merging batches...
[1/3] user-service ✓ (14 nodes, 9 edges)
[2/3] order-service ✓ (11 nodes, 7 edges)
[3/3] payment-service: analyzing batch 1/2...
[3/3] payment-service ✗ (attempt 1 failed: invalid output, retrying)
[3/3] payment-service: analyzing batch 1/2 (retry)...
[3/3] payment-service ✗ (retry failed: invalid output — skipping)

⚠ 1 repository failed after retry. Generating partial diagram from 2 repositories.

Correlating across repositories...
  Deterministic pass: 5 connections found, 1 pair unresolved
  Agentic fallback: analyzing 1 unresolved pair...
  Agentic pass: 1 connection found

✓ Diagram written to ./output/architecture.arch.json
```

## Error Output (stderr)

All errors go to stderr. Config validation errors include the specific field and reason — unchanged.

## Local Model Reachability Check (replaces the v1.0 cloud-provider consent prompt)

Before any repository analysis begins, the tool validates that `localModel.endpoint` is reachable and that `localModel.modelId` is available on it:

```
Checking local model endpoint... http://localhost:11434 (ollama)
✓ Model "llama3" is available

Starting analysis of 3 repositories (max concurrency: 2)...
```

If unreachable:

```
✗ Local model endpoint unreachable: http://localhost:11434
  Ensure your local model server is running (e.g. `ollama serve`) and reachable
  from this machine, then re-run.

Exit code 2.
```

There is no interactive consent prompt in this revision — since no source code ever leaves the machine (FR-017), the consent flow that existed for the hosted-provider path in v1.0 has no equivalent here.
