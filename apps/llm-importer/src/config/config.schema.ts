import { z } from 'zod';

/**
 * v2.0 — breaking change from the retired v1.0 Python importer's config shape
 * (no `provider` block). See contracts/config-schema-contract.md for the full
 * contract.
 */
export const CONFIG_VERSION = '2.0';

export const OutputConfigSchema = z.object({
  directory: z.string().min(1),
  diagramFileName: z.string().min(1).default('architecture.arch.json'),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const RepositoryEntrySchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type RepositoryEntry = z.infer<typeof RepositoryEntrySchema>;

export const ImportConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  output: OutputConfigSchema,
  repositories: z.array(RepositoryEntrySchema).min(1).max(50),
});
export type ImportConfig = z.infer<typeof ImportConfigSchema>;
