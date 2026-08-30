import {
  RepositoryKnowledgeGraphSchema,
  type GraphEdge,
  type GraphNode,
  type RepositoryKnowledgeGraph,
} from '../graph/schema.js';
import type { RepoAnalysis } from './repo-analysis.schema.js';

/**
 * 008 research.md D4 / `contracts/correlation-adapter-contract.md`: the single
 * seam that lets every module under `src/correlate/**` stay byte-for-byte
 * unchanged. The persisted artifact is the honest `RepoAnalysis` shape; the
 * correlator still consumes the 007 `RepositoryKnowledgeGraph` type, which this
 * function constructs in memory (never persisted).
 *
 * Node/edge shapes are chosen so the unchanged consumers keep working:
 * - `evidence/collect.ts` reads `nodes.filter(n => n.type === 'endpoint')`
 * - `evidence-passes.ts` `parseEndpointRoute(node)` recovers method+path from
 *   `node.name` (format "METHOD /path" or "/path")
 * - `evidence-passes.ts` `moduleNodeId()` finds the single `module` node
 * - `deterministic-correlator.ts` name-mention pass reads `edge.description`
 *   and the target node's `name`/`summary`
 */

function endpointLabel(method: string | undefined, path: string): string {
  return method ? `${method.toUpperCase()} ${path}` : path;
}

export function toCorrelationGraph(analysis: RepoAnalysis): RepositoryKnowledgeGraph {
  const nodesById = new Map<string, GraphNode>();
  const add = (node: GraphNode): void => {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  };

  const moduleId = `module:${analysis.repository.name}`;
  add({
    id: moduleId,
    type: 'module',
    name: analysis.repository.name,
    summary: analysis.description,
  });

  for (const route of analysis.served.httpRoutes) {
    const label = endpointLabel(route.method, route.path);
    add({
      id: `endpoint:${label}`,
      type: 'endpoint',
      name: label,
      summary: '',
      ...(route.filePath !== undefined ? { filePath: route.filePath } : {}),
    });
  }

  for (const svc of analysis.served.grpcServices) {
    add({ id: `endpoint:grpc:${svc}`, type: 'endpoint', name: svc, summary: 'gRPC service' });
  }

  for (const store of analysis.served.datastores) {
    add({ id: `table:${store.name}`, type: 'table', name: store.name, summary: store.kind ?? '' });
  }

  for (const topic of analysis.served.topics) {
    add({
      id: `resource:${topic.name}`,
      type: 'resource',
      name: topic.name,
      summary: topic.direction,
    });
  }

  const edges: GraphEdge[] = [];
  for (const intent of analysis.outbound) {
    const targetId = `service:${intent.target}`;
    add({ id: targetId, type: 'service', name: intent.target, summary: '' });
    edges.push({
      source: moduleId,
      target: targetId,
      type: intent.verb,
      weight: intent.confidence ?? 0.5,
      description: intent.detail,
    });
  }

  const graph: RepositoryKnowledgeGraph = {
    schemaVersion: '1.0',
    analyzedAt: analysis.analyzedAt,
    repository: analysis.repository,
    nodes: [...nodesById.values()],
    edges,
    analysisStatus: analysis.analysisStatus,
    retryCount: analysis.retryCount,
  };

  return RepositoryKnowledgeGraphSchema.parse(graph);
}
