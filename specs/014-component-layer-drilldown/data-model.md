# Phase 1 Data Model: Component-Layer Drill-Down

All shapes below are new. Nothing in `packages/core-model`, `packages/model-schema`, or the
importer's existing `RepoAnalysisSchema`/`WorkspaceGroundTruth`/`Baseline`/`CorrelationReport`
changes — these are additive siblings, following the same shape conventions as spec 008 (`RepoAnalysis`)
and spec 013 (the eval harness types), respectively.

## `ComponentAnalysis` — the `{repo}.components.json` artifact

Defined by `apps/llm-importer/src/analysis/component-analysis.schema.ts` (zod). Mirrors
`RepoAnalysisSchema`'s metadata fields exactly (Clarification Q2).

```ts
interface InternalComponent {
  name: string; // non-empty
  kind: string; // free text, e.g. "controller" | "service" | "repository" | "module"
  // — intentionally NOT a closed enum; the extraction procedure describes
  // what it sees, and scoring (FR-015) ignores kind entirely
  description: string; // short, non-empty
}

interface InternalRelationship {
  source: string; // must name a component in `components` (by `name`)
  target: string; // must name a component in `components` (by `name`)
  description: string; // short, may be empty string
}

interface ComponentAnalysis {
  schemaVersion: '1.0';
  analyzedAt: string; // ISO timestamp
  repository: {
    name: string; // MUST match the workspace config's repo name (FR-009)
    path: string;
    description?: string;
  };
  components: InternalComponent[]; // "a short list" — no hard-coded max; left to the
  // extraction procedure's judgment (deferred per
  // clarify-session Outstanding item)
  relationships: InternalRelationship[];
  analysisStatus: 'complete' | 'partial';
  retryCount: 0 | 1;
}
```

**Validation rules** (zod, enforced by both `validate-components` and the schema test):

- `components` and `relationships` MAY be empty arrays (edge case: a repo too small to have
  meaningful internal structure).
- Every `relationships[].source` and `.target` MUST reference a `name` present in `components` —
  a dangling reference fails validation (same spirit as the spec's ground-truth-consistency edge
  case, enforced here on the artifact itself too).
- `repository.name` is validated for shape only here; the FR-009 check ("not present in the
  workspace's configuration") happens in the CLI command / skill procedure, not in the schema.

## `ComponentGroundTruth` / golden-set config (eval-side only, dev tooling)

Defined by `apps/llm-importer/eval/component-schema.ts` (zod) + `component-types.ts` (plain types).
Deliberately simpler than `WorkspaceGroundTruth` (013) because a component golden "set" is one
repository, not a multi-repo workspace.

```ts
// component-types.ts
interface ComponentGroundTruth {
  components: Array<{ name: string; kind: string; description: string }>;
  relationships: Array<{ from: string; to: string }>;
}

interface ComponentEvalConfig {
  name: string; // golden-set name, e.g. "catalog-service"
  workspace: { local: string }; // path to the one repo's source tree (reference only; not re-walked
  // by scoring — see research.md #1, scoring reads the committed
  // artifact, not the source)
  artifact: string; // path to the committed {repo}.components.json for this set
  repo: { name: string; path: string };
}

type ComponentPrfLite = { precision: number; recall: number; f1: number };

// component-baseline.json shape
type ComponentBaseline = Record<
  string, // golden-set name
  { components: ComponentPrfLite; relationships: ComponentPrfLite }
>;

interface ComponentReport {
  set: string;
  generatedAt: string;
  components: PRF; // reused from eval/types.ts — {tp,fp,fn,precision,recall,f1}
  relationships: PRF;
  expected: { components: string[]; relationships: string[] };
  predicted: { components: string[]; relationships: string[] };
}
```

## No new persisted type (revised: merge happens in `apps/llm-importer`, not Studio)

`apps/llm-importer/src/arch/attach-components.ts`'s `attachComponentsToModel(model, containerName,
artifact)` consumes a validated `ComponentAnalysis` and the full `ArchitectureModel` read from the
human's `.arch.json`, and produces ordinary, already-existing `core-model` values:

```ts
// one per InternalComponent
Element = {
  id: <generated>,
  kind: 'component',
  name: component.name,
  description: component.description,
  parentId: targetContainer.id,     // the nesting mechanism — already supported today
  componentType: component.kind,    // existing free-text field, already defined on Element
};

// one per InternalRelationship
Relationship = {
  id: <generated>,
  sourceId: <id of the Element created for relationship.source>,
  targetId: <id of the Element created for relationship.target>,
};
```

Every new `Element` also gets a real layout-node entry (`{ elementId, x, y, w, h }`) in the model's
first view, computed by `@archatlas/layout`'s `computeLayout` over the whole updated element set —
not hand-placed — because an element with no layout node renders nothing and nothing flags it. No
new field is added to `Element`, `Relationship`, or the persisted `.arch.json` document shape —
merging components is indistinguishable, from `core-model`'s or `model-schema`'s point of view, from
a human manually adding the same elements and relationships by hand through the editor; the
difference is this happens via one CLI command instead, writing the same file back in place.

## Validation ownership summary

| Boundary                                                                                        | Validator                                                                  | Package             |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| `{repo}.components.json` on disk, before a developer trusts it / before the skill calls it done | `ComponentAnalysisSchema` via `validate-components <file>`                 | `apps/llm-importer` |
| `{repo}.components.json` at the moment `attach-components` reads it                             | `ComponentAnalysisSchema` again (`safeParse`), same schema                 | `apps/llm-importer` |
| Repository-name match between the artifact and `--container` (FR-012a)                          | checked inside `attachComponentsToModel`, after schema validation succeeds | `apps/llm-importer` |
| The target `.arch.json` itself (valid JSON, has `elements`/`views`)                             | a structural check in `runAttachComponentsCommand` before merging          | `apps/llm-importer` |
| Dangling `relationships[].source`/`.target` reference                                           | `ComponentAnalysisSchema`                                                  | `apps/llm-importer` |

`apps/studio` is not a party to any of this — it never reads a `{repo}.components.json`, and gains
no new code for this feature at all.
