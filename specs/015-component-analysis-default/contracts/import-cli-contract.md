# Contract: `import`'s Fold-In of `{repo}.components.json`

> Replaces `import-wizard-contract.md` (2026-11-08) — the wizard gains no new upload slot; the
> deterministic `import` command folds components in before the review file is ever written, so
> there's nothing left for the wizard's upload step to accept differently. See `spec.md`'s
> Clarifications for why.

## Per-repository, inside `runImport`

| Input                                                                                             | `repos[]` entry in `architecture.review.yaml`                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{repoName}.components.json` absent                                                               | `components`/`componentRelationships` both absent — same as before this feature                                                                                                                                             |
| `{repoName}.components.json` present and valid                                                    | `components` = the artifact's `components[]` verbatim; `componentRelationships` = the artifact's `relationships[]` verbatim                                                                                                 |
| `{repoName}.components.json` present but malformed (bad JSON, or fails `ComponentAnalysisSchema`) | `components`/`componentRelationships` both absent; `[warn] {name}: invalid components artifact — {detail}` logged to stderr; the repository's external-interface analysis and candidate connections are entirely unaffected |

A repository whose `{repoName}.analysis.json` is itself missing/invalid is already skipped entirely
(pre-existing behavior, FR-002/FR-003's "unaffected" guarantee) — its components are never read
either, since there's no `repos[]` entry to attach them to.

Re-running `import` on an unchanged workspace produces byte-identical `repos[].components`/
`componentRelationships` for every repository (SC-004) — this is just `tryReadComponents` reading
the same file and `toRepoMeta` building the same object, same as the rest of `runImport` is already
deterministic.

## Studio's `parseReviewYaml` + `buildModel`, given that file

| Input                                                                                                                    | Behavior                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `repos[]` entry with no `components`                                                                                   | That container renders exactly as before this feature — no nested elements                                                                              |
| A `repos[]` entry with `components` (and optionally `componentRelationships`)                                            | `buildModel` creates nested `component`-kind elements under the matching container, laid out in the same single `computeLayout` pass as everything else |
| A `componentRelationships` entry whose `source`/`target` doesn't resolve to a component in that same repo's `components` | Skipped silently — never thrown, since `buildModel`'s only caller is a render-time `useMemo`                                                            |

No wizard-visible "merge outcome" — a repository's components are either on the file or they
aren't, visible by reading the file or looking at the rendered diagram, same as any other optional
field on `repos[]` already is.
