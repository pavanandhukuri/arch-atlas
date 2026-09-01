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
    // Max repositories analyzed in parallel — one bounded model call each
    // (008). Default 1: a single local model serving two large-context 30B
    // requests at once was observed returning unparseable output for one of
    // them. Raise it (up to 8) for smaller models or a beefier endpoint.
    maxConcurrency: z.number().int().min(1).max(8).default(1),
    // Sampling temperature for the analysis + agentic-correlation calls
    // (research.md D14). Low by default — analysis is extraction, not
    // generation; a high temperature was the main source of run-to-run
    // variance (a repo's route list changing between runs).
    temperature: z.number().min(0).max(2).default(0.1),
    // When true, a second bounded call re-checks the analysis against the
    // gathered source and drops anything not grounded in it (research.md
    // D14.8). Doubles the per-repo model cost — opt-in.
    verifyGrounding: z.boolean().default(false),
    // 'prompt' (default) = free-form JSON text + hardened parse. 'tool' =
    // EXPERIMENTAL: one constrained-sampling `submit_analysis` tool call.
    // Only worthwhile against an endpoint with fast, well-behaved json-schema
    // guided decoding — observed pathologically slow against oMLX (research.md
    // D14.6). Leave on 'prompt' unless you have measured otherwise.
    structuredOutput: z.enum(['prompt', 'tool']).default('prompt'),
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
  // 010-harness-neutral-importer: the importer core is model-free and never reads
  // this block. It is retained (optional) so a single `import.yaml` can also
  // configure an analysis producer such as `@arch-atlas/analysis-runner-local`,
  // which requires it. Old configs that still carry a `localModel` stay valid.
  localModel: LocalModelConfigSchema.optional(),
  output: OutputConfigSchema,
  analysis: AnalysisConfigSchema,
  repositories: z.array(RepositoryEntrySchema).min(1).max(50),
});
export type ImportConfig = z.infer<typeof ImportConfigSchema>;
