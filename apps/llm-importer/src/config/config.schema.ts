import { z } from 'zod';

/**
 * v2.0 — breaking change from the retired v1.0 Python importer's config shape
 * (no `provider` block; local-model-only per FR-017). See
 * contracts/config-schema-contract.md for the full contract.
 */
export const CONFIG_VERSION = '2.0';

export const LocalModelConfigSchema = z.object({
  provider: z.enum(['ollama', 'mlx', 'openai-compatible']),
  endpoint: z.string().url(),
  modelId: z.string().min(1),
  // Most local servers (Ollama) ignore this. Some (e.g. oMLX) require a real
  // key even for localhost-only access — omit for keyless servers.
  apiKey: z.string().min(1).optional(),
});
export type LocalModelConfig = z.infer<typeof LocalModelConfigSchema>;

export const OutputConfigSchema = z.object({
  directory: z.string().min(1),
  diagramFileName: z.string().min(1).default('architecture.arch.json'),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const AnalysisConfigSchema = z
  .object({
    maxFilesPerRepo: z.number().int().min(10).max(1000).default(200),
    excludePatterns: z.array(z.string()).default([]),
    forceRefresh: z.boolean().default(false),
    // Shared by repo-level fan-out AND the vendored subagent dispatcher's internal
    // batch fan-out (research.md D8, FR-016) — NOT the same meaning as v1.0's
    // repo-only `concurrency` field. Upper bound matches the vendored subagent
    // extension's own hard cap (vendor/pi-subagent/index.ts MAX_PARALLEL_TASKS).
    maxConcurrency: z.number().int().min(1).max(8).default(2),
  })
  .default({});
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

export const RepositoryEntrySchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type RepositoryEntry = z.infer<typeof RepositoryEntrySchema>;

export const ImportConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  localModel: LocalModelConfigSchema,
  output: OutputConfigSchema,
  analysis: AnalysisConfigSchema,
  repositories: z.array(RepositoryEntrySchema).min(1).max(50),
});
export type ImportConfig = z.infer<typeof ImportConfigSchema>;
