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

/**
 * A named grouping of repositories, declared upfront by whoever wrote
 * `import.yaml` — carried straight onto the review artifact's `systems[]`
 * (Studio's Tag & Classify step pre-fills SystemGroups from exactly this
 * field). `repositories[]` entries must match each repo's *resolved* name
 * (its `name`, or the last path segment when `name` is omitted) — `runImport`
 * warns and drops any entry that doesn't resolve, rather than failing the
 * whole import. This is still never auto-guessed from repo names/keywords —
 * it's the human declaring their own grouping once, upfront, instead of
 * repeating it in Studio on every re-import.
 */
export const SystemGroupConfigSchema = z.object({
  name: z.string().min(1),
  repositories: z.array(z.string().min(1)).min(1),
});
export type SystemGroupConfig = z.infer<typeof SystemGroupConfigSchema>;

export const ImportConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  output: OutputConfigSchema,
  repositories: z.array(RepositoryEntrySchema).min(1).max(50),
  systems: z.array(SystemGroupConfigSchema).optional(),
});
export type ImportConfig = z.infer<typeof ImportConfigSchema>;
