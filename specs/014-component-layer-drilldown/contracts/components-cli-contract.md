# CLI Contract: component-layer commands

Three commands. All deterministic, no network, no model call — same guarantee the existing
`import`/`gather-context`/`eval` commands already make.

## `archatlas validate-components <file>`

Validates one `{repo}.components.json` file against `ComponentAnalysisSchema`.

| Input                                                                                                 | Behavior                                                 | Exit code |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| A file that parses and satisfies the schema, including no dangling `relationships[].source`/`.target` | Prints `valid: <file>`                                   | 0         |
| A file that fails schema validation (missing field, wrong type, dangling reference)                   | Prints the zod error, naming the offending field/path    | 1         |
| A file that does not exist or is not valid JSON                                                       | Prints a clear "file not found" / "invalid JSON" message | 1         |

No `--repos`, no config file argument — this command only ever looks at the one file it's given. It
never reads `import.yaml` and never touches any other artifact, satisfying FR-010/FR-013 by
construction (there is no code path by which this command can affect `import`'s output).

## `archatlas attach-components <arch-file> <components-file> --container <name>`

Merges a validated `{repo}.components.json` directly into one named container of an existing
`.arch.json`. The only command in this feature that writes to the human's diagram file — no
separate Studio action exists for this.

| Input                                                                                 | Behavior                                                                                                                                                                         | Exit code |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Valid arch file + valid components file + `--container` matches exactly one container | Merges, computes layout positions for every new element, writes `<arch-file>` in place (or `--output <file>` instead); prints a one-line summary (component/relationship counts) | 0         |
| `<components-file>` fails `ComponentAnalysisSchema` validation                        | Prints the zod error; writes nothing                                                                                                                                             | 1         |
| `<arch-file>` is not valid JSON, or lacks `elements`/`views`                          | Prints a clear error; writes nothing                                                                                                                                             | 1         |
| `--container` matches zero or more than one container                                 | Prints a clear error naming the problem; writes nothing                                                                                                                          | 1         |
| The components file's `repository.name` doesn't match `--container`                   | Prints a clear mismatch error; writes nothing                                                                                                                                    | 1         |

`--container` is required. `--output <file>` writes to a different path instead of overwriting
`<arch-file>`, useful for a dry run. Every failure path leaves `<arch-file>` byte-for-byte
unchanged — there is no partial-write state.

## `pnpm --filter @archatlas/llm-importer run eval:components [-- <flags>]`

Scores both committed golden-components datasets. Mirrors the existing `eval` command's contract
exactly (`apps/llm-importer/eval/run.ts`), with its own baseline file.

| Flag                | Behavior                                                                                                                        | Exit code                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| _(none)_            | Print a per-set report: components P/R/F1, relationships P/R/F1                                                                 | 0                                                                                         |
| `--set <name>`      | Restrict to one golden-components set                                                                                           | 0                                                                                         |
| `--check`           | Compare every metric to `component-baseline.json`; fail if any metric drops by more than the same tolerance `eval --check` uses | 0 (pass) / 1 (regression) / 2 (setup error — missing baseline, inconsistent ground truth) |
| `--update-baseline` | Rewrite `component-baseline.json` from the current run                                                                          | 0                                                                                         |

`--check` with no `component-baseline.json` present is a hard failure (exit 2) with a message
pointing at `--update-baseline`, same as the existing `eval --check`.

This command is independent of `eval`/`eval:extract` — it has its own golden-set directory
(`eval/golden-components/`), its own baseline file, and running it never reads or writes anything
under `eval/golden/` (the correlation golden sets).
