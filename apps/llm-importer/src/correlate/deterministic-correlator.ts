import type { RepositoryKnowledgeGraph, GraphEdge, GraphEdgeType } from '../graph/schema.js';

export interface CrossRepositoryConnection {
  sourceRepo: string;
  sourceNodeId: string;
  targetRepo: string;
  targetNodeId: string;
  type: GraphEdgeType;
  foundBy: 'deterministic' | 'agentic-fallback';
  evidence: string[];
  weight: number;
}

/** Repository pairs the deterministic pass could not resolve — input to the agentic fallback (D7 pass 2). */
export interface UnresolvedRepoPair {
  repoA: string;
  repoB: string;
}

const OUTBOUND_EDGE_TYPES: ReadonlySet<GraphEdgeType> = new Set([
  'calls',
  'depends_on',
  'publishes',
  'subscribes',
  'reads_from',
  'writes_to',
]);

/**
 * research.md D7 pass 1: literal-identifier matching. This importer's
 * trimmed knowledge-graph schema (research.md D10) carries free-text
 * `summary`/`description` fields, not structured port/env-var fields — so
 * "literal identifier" evidence is extracted from that text, mirroring how
 * the retired static pipeline read connection strings out of source code,
 * just at a coarser (repo-name-substring) granularity since the agent's
 * summary is already a step removed from raw source.
 */
function graphMentionsRepoName(text: string | undefined, repoName: string): boolean {
  if (!text) return false;
  const needle = repoName.toLowerCase().replace(/[-_]/g, ' ');
  const haystack = text.toLowerCase().replace(/[-_]/g, ' ');
  return haystack.includes(needle);
}

function outboundEdgesMentioningOtherRepo(
  graph: RepositoryKnowledgeGraph,
  otherRepoName: string
): Array<{ edge: GraphEdge; evidence: string }> {
  const results: Array<{ edge: GraphEdge; evidence: string }> = [];
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const edge of graph.edges) {
    if (!OUTBOUND_EDGE_TYPES.has(edge.type)) continue;
    const targetNode = nodesById.get(edge.target);
    const candidates = [edge.description, targetNode?.summary, targetNode?.name];
    const match = candidates.find((c) => graphMentionsRepoName(c, otherRepoName));
    if (match) results.push({ edge, evidence: match });
  }
  return results;
}

export function correlateDeterministically(graphs: RepositoryKnowledgeGraph[]): {
  connections: CrossRepositoryConnection[];
  unresolvedPairs: UnresolvedRepoPair[];
} {
  const connections: CrossRepositoryConnection[] = [];
  const unresolvedPairs: UnresolvedRepoPair[] = [];

  for (let i = 0; i < graphs.length; i++) {
    for (let j = 0; j < graphs.length; j++) {
      if (i === j) continue;
      const source = graphs[i];
      const target = graphs[j];
      if (!source || !target) continue;

      const matches = outboundEdgesMentioningOtherRepo(source, target.repository.name);
      if (matches.length === 0) {
        if (i < j)
          unresolvedPairs.push({ repoA: source.repository.name, repoB: target.repository.name });
        continue;
      }
      for (const { edge, evidence } of matches) {
        connections.push({
          sourceRepo: source.repository.name,
          sourceNodeId: edge.source,
          targetRepo: target.repository.name,
          targetNodeId: edge.target,
          type: edge.type,
          foundBy: 'deterministic',
          evidence: [evidence],
          weight: edge.weight,
        });
      }
    }
  }

  return { connections, unresolvedPairs };
}
