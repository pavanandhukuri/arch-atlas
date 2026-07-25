import { z } from 'zod';

/**
 * research.md D10: a deliberately trimmed subset of Understand-Anything's
 * native GraphNodeSchema/GraphEdgeSchema (vendor/understand-anything/schema.ts).
 * Applied as an ingestion-time filter on UA's real (unmodified-prompt) output —
 * not something we ask the file-analyzer prompt to respect directly. Design/
 * knowledge-base node & edge types are dropped entirely since this importer
 * never analyzes a Figma file or a knowledge base.
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

/**
 * Filters + validates a raw parsed `.ua/knowledge-graph.json` payload (UA's
 * native shape, a superset of ours) down to our trimmed schema. Nodes/edges
 * of a type outside GRAPH_NODE_TYPES/GRAPH_EDGE_TYPES are dropped, not
 * errored on — UA's real output legitimately contains types we simply don't
 * use (`class`, `function` are common; design/knowledge-base types would be
 * unusual for a source-code repo but are dropped defensively all the same).
 * Dangling edges (referencing a node id no longer present after filtering)
 * are also dropped.
 */
export function filterToTrimmedSchema(
  rawNodes: unknown[],
  rawEdges: unknown[]
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  droppedNodeCount: number;
  droppedEdgeCount: number;
} {
  const nodes: GraphNode[] = [];
  for (const raw of rawNodes) {
    const parsed = GraphNodeSchema.safeParse(raw);
    if (parsed.success) nodes.push(parsed.data);
  }
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: GraphEdge[] = [];
  for (const raw of rawEdges) {
    const parsed = GraphEdgeSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (!nodeIds.has(parsed.data.source) || !nodeIds.has(parsed.data.target)) continue;
    edges.push(parsed.data);
  }

  return {
    nodes,
    edges,
    droppedNodeCount: rawNodes.length - nodes.length,
    droppedEdgeCount: rawEdges.length - edges.length,
  };
}
