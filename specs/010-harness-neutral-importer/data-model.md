# Phase 1 Data Model: Harness-Neutral Importer

Two new persisted artifacts, one unchanged, and a small config delta. All schemas are `zod`.

---

## Unchanged: `RepoAnalysis` (`apps/llm-importer/src/analysis/repo-analysis.schema.ts`)

No change. Restated here only because it is now the **producer output contract**:

```
RepoAnalysis = {
  schemaVersion: '1.0'
  analyzedAt: string
  repository: { name, path, description? }
  description: string
  languages: string[]
  frameworks: string[]
  served: { httpRoutes[], grpcServices: string[], topics[], datastores[] }
  outbound: { target, verb, detail, confidence? }[]
  analysisStatus: 'complete' | 'partial'
  retryCount: 0 | 1
}
```

Not `.strict()` — a producer's extra keys are stripped, not rejected (spec Assumptions, Edge Cases).

---

## New: `ContextBundle` (`apps/llm-importer/src/analysis/context-bundle.ts`)

The serialised form of `gatherContext()`'s `AnalysisContext`, plus a version tag.

```ts
export const ContextBundleSchema = z.object({
  schemaVersion: z.literal('1.0'),
  generatedAt: z.string(), // ISO
  repoName: z.string().min(1),
  repoPath: z.string().min(1),
  descriptionHint: z.string().optional(),
  readmes: z.array(ContextFileSchema), // { relPath, text }
  manifests: z.array(ContextFileSchema),
  dependencySplits: z.array(DependencySplitSchema), // { relPath, dependencies, devDependencies, peerDependencies }
  listing: z.array(z.string()), // bounded directory listing
  sourceExcerpts: z.array(SourceExcerptSchema), // { relPath, text, rank }
  detected: DetectedInterfacesSchema, // { urlLiterals, topicRefs } — deterministic hints
  totalBytes: z.number().int().nonnegative(),
});
export type ContextBundle = z.infer<typeof ContextBundleSchema>;
```

`ContextFileSchema`, `DependencySplitSchema`, `SourceExcerptSchema`, `DetectedInterfacesSchema` are
`zod` mirrors of the existing `gather-context.ts` interfaces (which stay the source of truth for the
TS types; the schemas validate the on-disk form).

**Functions**:

- `serializeContextBundle(ctx: AnalysisContext): ContextBundle` — adds `schemaVersion`/`generatedAt`, otherwise a structural copy.
- `readContextBundle(path: string): ContextBundle` — read + `ContextBundleSchema.parse`; on `schemaVersion` mismatch throw `ContextBundleVersionError` ("regenerate with `gather-context`").

**Validation rules**: `totalBytes` must equal the sum of excerpt/readme/manifest byte lengths
(a cheap integrity check); every `relPath` is repo-relative and `/`-separated; no `relPath` matches
the secret-path exclusion set (enforced by `gatherContext`, re-asserted in the serializer).

**Written to**: `{outDir}/{repoName}.context.json` by the `gather-context` CLI subcommand.

---

## New: `ExtraConnections` (`apps/llm-importer/src/correlate/extra-connections.ts`)

An optional file carrying model-derived cross-repo connections the deterministic passes could not
produce (the relocated agentic fallback's output).

```ts
export const ExtraConnectionSchema = z.object({
  sourceRepo: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetRepo: z.string().min(1),
  targetNodeId: z.string().min(1),
  type: z.enum(GRAPH_EDGE_TYPES),
  foundBy: z.literal('agentic-fallback'), // narrowed — this file is only ever the fallback
  evidence: z.array(z.string()),
  weight: z.number().min(0).max(1),
});
export const ExtraConnectionsSchema = z.object({
  schemaVersion: z.literal('1.0'),
  generatedAt: z.string(),
  connections: z.array(ExtraConnectionSchema),
});
```

**Function**: `readExtraConnections(outDir: string): CrossRepositoryConnection[]` —
returns `[]` if `{outDir}/architecture.extra-connections.json` is absent; parses + validates
otherwise; a malformed file is a hard error (it was deliberately produced).

**Consumed by**: `run-import.ts`, merged into the connection list before `assembleReviewFile` exactly
where `agenticConnections` is merged today.

**Written by**: `packages/analysis-runner-local` (`resolve-pairs`). Never written by the core.

---

## Config delta (`apps/llm-importer/src/config/config.schema.ts`)

| Field                       | Before                  | After               | Read by                   |
| --------------------------- | ----------------------- | ------------------- | ------------------------- |
| `localModel`                | required                | **`.optional()`**   | runner only; core ignores |
| `analysis.maxFilesPerRepo`  | used by gather-context  | unchanged           | core                      |
| `analysis.excludePatterns`  | used by gather-context  | unchanged           | core                      |
| `analysis.forceRefresh`     | analyze-path cache      | unchanged in schema | runner                    |
| `analysis.temperature`      | analyze + agentic calls | unchanged in schema | runner                    |
| `analysis.verifyGrounding`  | analyze second pass     | unchanged in schema | runner                    |
| `analysis.structuredOutput` | analyze mode            | unchanged in schema | runner                    |
| `analysis.maxConcurrency`   | parallel analyze        | unchanged in schema | runner                    |

The schema keeps every field (old `import.yaml` files stay valid). The **core** simply never reads
the runner-only ones. `packages/analysis-runner-local/src/config.ts` defines `RunnerConfigSchema`
that reads the same file and requires `localModel`.

---

## Entity flow

```text
repo tree ──gatherContext (unchanged)──▶ AnalysisContext
                                          │ serializeContextBundle
                                          ▼
                         {repo}.context.json  (ContextBundle)   ← core `gather-context` subcommand
                                          │
              ┌───────────────────────────┼────────────────────────────┐
   packages/analysis-runner-local   .claude/skills/repo-analysis   any other producer
   (local model, offline)           (Claude Code, hosted, opt-in)  (script / CI / human)
              └───────────────────────────┼────────────────────────────┘
                                          ▼
                         {repo}.analysis.json  (RepoAnalysis, schema unchanged)
                                          │  analysis-store.readAnalysis
                                          ▼
   importer core:  toCorrelationGraph ▶ correlateDeterministically ▶ (+ readExtraConnections)
                   ▶ assembleReviewFile ▶ buildDiagram
                                          ▼
              architecture.review.yaml + architecture.arch.json   (schemas unchanged; Studio unchanged)
```
