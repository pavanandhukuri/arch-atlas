import { z } from 'zod';

/**
 * 014-component-layer-drilldown: the per-repository "internal structure"
 * artifact, written to `{output.directory}/{repo-name}.components.json`.
 * Mirrors `RepoAnalysisSchema`'s completeness/status metadata exactly
 * (schemaVersion, analyzedAt, analysisStatus, retryCount) per the feature's
 * Clarification Q2.
 *
 * 015-component-analysis-default: this is now written for every repository by
 * default, and `import` reads and validates it (folding it into
 * `architecture.review.yaml`) exactly like it already does for
 * `{repo}.analysis.json` — superseding this comment's original "never read by
 * the bulk import command" framing.
 *
 * `components[].kind` is intentionally free text, not a closed enum — scoring
 * (FR-015) matches components by normalized `name` alone and ignores `kind`.
 */

export const RepositoryRefSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});

export const InternalComponentSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().min(1),
});
export type InternalComponent = z.infer<typeof InternalComponentSchema>;

export const InternalRelationshipSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  description: z.string(),
});
export type InternalRelationship = z.infer<typeof InternalRelationshipSchema>;

export const ComponentAnalysisSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    analyzedAt: z.string(),
    repository: RepositoryRefSchema,
    components: z.array(InternalComponentSchema),
    relationships: z.array(InternalRelationshipSchema),
    analysisStatus: z.enum(['complete', 'partial']),
    retryCount: z.union([z.literal(0), z.literal(1)]),
  })
  .superRefine((artifact, ctx) => {
    // A relationship referencing a component name not in `components` is a
    // dangling reference — reject it here rather than let it silently fail to
    // match anything downstream (same spirit as the eval's ground-truth
    // consistency check).
    const known = new Set(artifact.components.map((c) => c.name));
    artifact.relationships.forEach((r, i) => {
      for (const end of [r.source, r.target] as const) {
        if (!known.has(end)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['relationships', i],
            message: `relationship references "${end}", which is not a name in components`,
          });
        }
      }
    });
  });

export type ComponentAnalysis = z.infer<typeof ComponentAnalysisSchema>;
