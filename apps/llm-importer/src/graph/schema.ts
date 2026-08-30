import { z } from 'zod';

/**
 * The in-memory graph shape the cross-repository correlator consumes
 * (`src/correlate/**`). Not a persisted artifact — `to-correlation-graph.ts`
 * builds it from a `RepoAnalysis` (008). The node/edge type sets are the
 * architecture-relevant ones the correlator and confidence mapper reason about.
 */
export const GRAPH_NODE_TYPES = [
  'file',
  'function',
  'class',
  'module',
  'config',
  'document',
  'service',
  'table',
  'endpoint',
  'pipeline',
  'schema',
  'resource',
] as const;
export type GraphNodeType = (typeof GRAPH_NODE_TYPES)[number];

export const GRAPH_EDGE_TYPES = [
  'imports',
  'calls',
  'publishes',
  'subscribes',
  'reads_from',
  'writes_to',
  'depends_on',
  'serves',
  'routes',
  'configures',
  'deploys',
  'provisions',
  'triggers',
] as const;
export type GraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number];

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(GRAPH_NODE_TYPES),
  name: z.string().min(1),
  filePath: z.string().optional(),
  summary: z.string(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(GRAPH_EDGE_TYPES),
  weight: z.number().min(0).max(1),
  description: z.string().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const RepositoryRefSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;

export const RepositoryKnowledgeGraphSchema = z.object({
  schemaVersion: z.literal('1.0'),
  analyzedAt: z.string(),
  repository: RepositoryRefSchema,
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  analysisStatus: z.enum(['complete', 'partial']),
  retryCount: z.union([z.literal(0), z.literal(1)]),
});
export type RepositoryKnowledgeGraph = z.infer<typeof RepositoryKnowledgeGraphSchema>;
