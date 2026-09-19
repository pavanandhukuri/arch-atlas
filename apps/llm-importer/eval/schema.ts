/**
 * Runtime validation for the three files a golden set is made of. Dev-only —
 * nothing here ships (`files: ["dist"]`). The inferred types are structurally
 * the hand-written ones in `types.ts`; `schema.test`-free because `load.ts`'s
 * integration test exercises every branch that matters.
 */
import { z } from 'zod';
import type {
  Baseline,
  EvalConfig,
  PrfLite,
  RepoGroundTruth,
  WorkspaceGroundTruth,
} from './types.js';

const PrfLiteSchema: z.ZodType<PrfLite> = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
});

// --- eval.config.yaml -------------------------------------------------------

export const EvalConfigSchema: z.ZodType<EvalConfig> = z.object({
  name: z.string().min(1),
  workspace: z.object({
    /** Path, relative to the config file, to a directory of repo trees. */
    local: z.string().min(1),
  }),
  analyses: z.string().min(1).optional(),
  repos: z
    .array(
      z.object({
        name: z.string().min(1),
        path: z.string().min(1),
      })
    )
    .min(1),
});

// --- ground-truth.json ---------------------------------------------------

const RepoGroundTruthSchema: z.ZodType<RepoGroundTruth> = z.object({
  role: z.string().min(1),
  languages: z.array(z.string().min(1)),
  frameworks: z.array(z.string().min(1)),
  served: z.object({
    httpRoutes: z.array(z.string().min(1)).optional(),
    grpcServices: z.array(z.string().min(1)).optional(),
    topics: z.array(z.string().min(1)).optional(),
    datastores: z.array(z.string().min(1)).optional(),
  }),
  outbound: z.array(z.string().min(1)).optional(),
});

export const WorkspaceGroundTruthSchema = z
  .object({
    repos: z.record(RepoGroundTruthSchema),
    connections: z.array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        kind: z.string().min(1).optional(),
      })
    ),
    externalSystems: z.array(z.string().min(1)),
  })
  .superRefine((gt, ctx) => {
    // FR-006: every connection endpoint must be a declared repo or a declared
    // external system — a typo'd name would otherwise silently score as a miss.
    const known = new Set([...Object.keys(gt.repos), ...gt.externalSystems]);
    gt.connections.forEach((c, i) => {
      for (const end of [c.from, c.to]) {
        if (!known.has(end)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['connections', i],
            message: `connection endpoint "${end}" is neither a repo key nor an externalSystems entry`,
          });
        }
      }
    });
  }) satisfies z.ZodType<WorkspaceGroundTruth>;

// --- baseline.json -----------------------------------------------------

export const BaselineSchema: z.ZodType<Baseline> = z.record(
  z.object({
    connections: PrfLiteSchema,
    externalSystems: PrfLiteSchema,
  })
);
