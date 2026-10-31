/**
 * Runtime validation for a golden-components set's `eval.config.yaml` and
 * `ground-truth.json`. Dev-only — nothing here ships (`files: ["dist"]`).
 */
import { z } from 'zod';
import type {
  ComponentBaseline,
  ComponentEvalConfig,
  ComponentGroundTruth,
  ComponentPrfLite,
} from './component-types.js';

const ComponentPrfLiteSchema: z.ZodType<ComponentPrfLite> = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
});

// --- eval.config.yaml -------------------------------------------------------

export const ComponentEvalConfigSchema: z.ZodType<ComponentEvalConfig> = z.object({
  name: z.string().min(1),
  workspace: z.object({ local: z.string().min(1) }),
  artifact: z.string().min(1),
  repo: z.object({ name: z.string().min(1), path: z.string().min(1) }),
});

// --- ground-truth.json ---------------------------------------------------

export const ComponentGroundTruthSchema = z
  .object({
    components: z.array(
      z.object({
        name: z.string().min(1),
        kind: z.string().min(1),
        description: z.string().min(1),
      })
    ),
    relationships: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      })
    ),
  })
  .superRefine((gt, ctx) => {
    // Same consistency rule as the component-analysis schema itself: a
    // ground-truth relationship naming a component not in the ground-truth
    // components list is an authoring mistake in the golden dataset, not a
    // miss to silently score.
    const known = new Set(gt.components.map((c) => c.name));
    gt.relationships.forEach((r, i) => {
      for (const end of [r.from, r.to] as const) {
        if (!known.has(end)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['relationships', i],
            message: `ground-truth relationship references "${end}", which is not a name in components`,
          });
        }
      }
    });
  }) satisfies z.ZodType<ComponentGroundTruth>;

// --- component-baseline.json -----------------------------------------------

export const ComponentBaselineSchema: z.ZodType<ComponentBaseline> = z.record(
  z.object({
    components: ComponentPrfLiteSchema,
    relationships: ComponentPrfLiteSchema,
  })
);
