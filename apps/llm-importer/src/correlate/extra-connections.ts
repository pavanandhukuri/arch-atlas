import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { GRAPH_EDGE_TYPES } from '../graph/schema.js';
import type { CrossRepositoryConnection } from './deterministic-correlator.js';

/**
 * 010-harness-neutral-importer (research D5): the model-assisted cross-repo
 * fallback no longer runs inside the importer core. A producer (e.g.
 * `@arch-atlas/analysis-runner-local resolve-pairs`) may instead write an
 * optional `architecture.extra-connections.json`; `run-import.ts` merges it into
 * the connection list before review assembly, exactly where the in-process
 * agentic pass used to sit. `assemble-review.ts` already maps
 * `foundBy: 'agentic-fallback'` to `low` confidence — no change there.
 */

export const EXTRA_CONNECTIONS_FILE = 'architecture.extra-connections.json';
export const EXTRA_CONNECTIONS_VERSION = '1.0';

export const ExtraConnectionSchema = z.object({
  sourceRepo: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetRepo: z.string().min(1),
  targetNodeId: z.string().min(1),
  type: z.enum(GRAPH_EDGE_TYPES),
  // This file only ever carries the model-assisted fallback's output.
  foundBy: z.literal('agentic-fallback'),
  evidence: z.array(z.string()),
  weight: z.number().min(0).max(1),
});

export const ExtraConnectionsSchema = z.object({
  schemaVersion: z.literal(EXTRA_CONNECTIONS_VERSION),
  generatedAt: z.string(),
  connections: z.array(ExtraConnectionSchema),
});
export type ExtraConnectionsFile = z.infer<typeof ExtraConnectionsSchema>;

/**
 * Load `{outDir}/architecture.extra-connections.json` if present. Absent file →
 * `[]` (the fallback is optional). A present-but-malformed file is a hard error:
 * it was deliberately produced, so a schema failure means the producer is broken.
 */
export function readExtraConnections(outDir: string): CrossRepositoryConnection[] {
  const path = join(outDir, EXTRA_CONNECTIONS_FILE);
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = ExtraConnectionsSchema.parse(raw);
  return parsed.connections;
}
