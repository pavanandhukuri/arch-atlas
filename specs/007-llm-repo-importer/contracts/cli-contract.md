# CLI Contract: arch-atlas-import

## Command

```
arch-atlas-import [options] <config-file>
```

Or via npx/workspace script:

```
pnpm --filter @arch-atlas/llm-importer run import <config-file>
```

## Arguments

| Argument        | Type | Required | Description                                       |
| --------------- | ---- | -------- | ------------------------------------------------- |
| `<config-file>` | path | Yes      | Path to import config (`.json` or `.yaml`/`.yml`) |

## Options

| Flag                | Default     | Description                                              |
| ------------------- | ----------- | -------------------------------------------------------- |
| `--output <dir>`    | from config | Override output directory from config                    |
| `--force-refresh`   | `false`     | Re-analyze all repos even if metadata exists             |
| `--repos <names>`   | all         | Comma-separated repo names to analyze (subset of config) |
| `--analyze-only`    | `false`     | Run per-repo analysis but skip aggregation               |
| `--aggregate-only`  | `false`     | Skip analysis, run aggregation from existing metadata    |
| `--yes`             | `false`     | Skip interactive consent prompt for cloud providers      |
| `--provider <type>` | from config | Override provider type (`anthropic` or `ollama`)         |
| `--verbose`         | `false`     | Print detailed progress and file sampling info           |

## Exit Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| `0`  | Success — diagram written            |
| `1`  | Config validation error              |
| `2`  | All repository analyses failed       |
| `3`  | Aggregation failed                   |
| `4`  | Output write error                   |
| `5`  | User declined cloud provider consent |

## Progress Output (stdout)

```
[1/3] Analyzing user-service... ✓ (12 connections detected)
[2/3] Analyzing order-service... ✓ (8 connections detected)
[3/3] Analyzing payment-service... ✗ (failed: LLM timeout)

⚠ 1 repository failed. Generating partial diagram from 2 repositories.

✓ Diagram written to ./output/architecture.arch.json
```

## Error Output (stderr)

All errors go to stderr. Config validation errors include the specific field and reason.

## Cloud Provider Consent Prompt

When `provider.type = "anthropic"` and `--yes` is not passed:

```
⚠  Cloud provider selected: Anthropic (Claude)
   Source code from the following repositories will be sent to Anthropic's API:
   - /path/to/user-service
   - /path/to/order-service

   Security exclusions applied: .env, *.key, *.pem, node_modules/, ...

   Type "yes" to continue or press Ctrl+C to abort: _
```
