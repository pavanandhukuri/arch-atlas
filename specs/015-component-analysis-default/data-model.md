# Phase 1 Data Model: Component Analysis by Default

> Rewritten 2026-11-08 — see `spec.md`'s Clarifications and `research.md`'s note for why. No new
> wizard state, no `ComponentMergeOutcome`/`mergeComponentArtifacts` service; the data model below
> is entirely an extension of the existing `RepoMeta`, mirrored field-for-field across the two
> packages that each independently define it (Constitution Principle I: no cross-package import).

## `ComponentAnalysis` (unchanged from 014)

Byte-for-byte the same shape 014 defined (`apps/llm-importer/src/analysis/component-analysis.schema.ts`):

```ts
interface ComponentAnalysis {
  schemaVersion: '1.0';
  analyzedAt: string;
  repository: { name: string; path: string; description?: string };
  components: Array<{ name: string; kind: string; description: string }>;
  relationships: Array<{ source: string; target: string; description: string }>;
  analysisStatus: 'complete' | 'partial';
  retryCount: 0 | 1;
}
```

Written to `{outDir}/{repoName}.components.json` by the agent (SKILL.md Pass 2), for every
repository, unconditionally. What's new in this feature is entirely downstream of this file —
nothing about producing or validating it changes.

## `RepoMeta` — extended on both sides of the pipeline

`apps/llm-importer/src/review/review-file.ts` (the producing side) and
`apps/studio/src/lib/import/types.ts` (the consuming side) each independently define `RepoMeta` —
a deliberate field-for-field port, not a shared import, per this project's monorepo-boundary
convention. Both gain the same two new optional fields:

```ts
interface RepoComponent {
  name: string;
  kind: string;
  description: string;
}

interface RepoComponentRelationship {
  source: string;
  target: string;
  description: string;
}

interface RepoMeta {
  name: string;
  description?: string; // unchanged, from 008
  technology?: string; // unchanged, from 008
  components?: RepoComponent[]; // NEW
  componentRelationships?: RepoComponentRelationship[]; // NEW
}
```

`RepoComponent`/`RepoComponentRelationship` are themselves field-for-field copies of
`ComponentAnalysis`'s own `components[]`/`relationships[]` entry shapes — the data crosses from one
package's artifact into the other package's review-file type unchanged, just relocated.

## `runImport`'s new read step (`apps/llm-importer`)

`src/analysis/analysis-store.ts` gains a read/write pair mirroring the existing
`tryReadAnalysis`/`writeAnalysis`:

```ts
type TryReadComponentsResult =
  | { ok: true; components: ComponentAnalysis }
  | { ok: false; reason: 'missing' | 'invalid'; detail?: string };

function tryReadComponents(outputDir: string, repoName: string): Promise<TryReadComponentsResult>;
function writeComponents(outputDir: string, components: ComponentAnalysis): Promise<string>;
```

`src/analysis/run-import.ts`'s `runImport` calls `tryReadComponents(outputDir, name)` for every
selected repository, right after its existing `tryReadAnalysis` call. `toRepoMeta` (renamed
signature: `toRepoMeta(analysis, components?: ComponentAnalysis)`) folds a found artifact's
`components`/`relationships` onto the `RepoMeta` it returns as `components`/`componentRelationships`
respectively. `assembleReviewFile` needed **no change** — it already copies whatever `RepoMeta`
object `repoMetaByName` hands it straight onto `repos[]`.

Missing is silent (the normal case for a repo analyzed before this feature, or mid-import);
malformed logs `[warn] {name}: invalid components artifact — {detail}` and proceeds without that
repository's internal structure — neither ever skips the repository's external-interface data or
fails the import.

## `buildModel`'s new fold-in step (`apps/studio`)

No new entity — `buildModel` (`src/lib/import/build-model.ts`) reads `state.reviewFile?.repos`,
keyed by `RepoMeta.name`, inside its existing per-`ElementConfig` loop (where container `Element`s
are already being built) and, for a container whose matching `RepoMeta` has `components`, creates:

- one `component`-kind `Element` per entry in `components` (`parentId` = that container's id,
  `componentType` = the component's `kind`, id = `slug(`${containerId}-${componentName}`)`)
- one `Relationship` per entry in `componentRelationships` whose `source`/`target` both resolve to
  a component built in the step above (a non-resolving entry is skipped, never thrown — see
  research.md #4)

Both are pushed into the same `allElements`/`relationships` arrays `buildModel` already assembles,
before its one `computeLayout` call — so every component element gets a real layout position in the
same single pass every other element already gets one in. No `ComponentMergeOutcome` type, no
merge-outcome UI: a repository with no `components` on its `RepoMeta` entry simply has no nested
elements, which is visible by looking at the diagram itself, the same way any other empty/partial
state already is.

## `parseReviewYaml`'s new parsing (`apps/studio`)

`src/lib/import/parse-review.ts`'s existing best-effort `repos[]` parsing loop gains two more
optional best-effort fields, read the same way `description`/`technology` already are — a malformed
`components[]`/`componentRelationships[]` entry (missing a required string field) is dropped, not a
parse failure for the whole file.
