import type { RepositoryKnowledgeGraph, GraphEdge, GraphEdgeType } from '../graph/schema.js';
// evidence-passes.ts and evidence/*.ts import only *types* from this module,
// so these value imports do not create a runtime cycle.
import { EVIDENCE_PASSES, type CorrelationInput } from './evidence-passes.js';
import { collectEvidence } from './evidence/collect.js';

export interface CrossRepositoryConnection {
  sourceRepo: string;
  sourceNodeId: string;
  targetRepo: string;
  targetNodeId: string;
  type: GraphEdgeType;
  /** 'evidence' = raw-source evidence pass (manifest/endpoint/schema/compose/
   * topic); 'deterministic' = graph-text name-mention match; 'agentic-fallback'
   * = local-model reasoning over condensed summaries. */
  foundBy: 'evidence' | 'deterministic' | 'agentic-fallback';
  evidence: string[];
  weight: number;
}

/** Repository pairs no pass could resolve — input to the agentic fallback (D7 pass 2). */
export interface UnresolvedRepoPair {
  repoA: string;
  repoB: string;
}

export interface DeterministicCorrelationResult {
  connections: CrossRepositoryConnection[];
  unresolvedPairs: UnresolvedRepoPair[];
  /** One line per pass, for progress reporting (FR-009). */
  passSummaries: string[];
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
 * Graph-text name-mention matching — the original correlator heuristic, kept
 * as the final pass: an outbound edge whose description/target summary
 * mentions another repository's name. Coarse, but catches relationships the
 * agent spelled out in prose that no literal evidence backs up.
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

function nameMentionConnections(graphs: RepositoryKnowledgeGraph[]): CrossRepositoryConnection[] {
  const connections: CrossRepositoryConnection[] = [];
  for (const source of graphs) {
    for (const target of graphs) {
      if (source === target) continue;
      for (const { edge, evidence } of outboundEdgesMentioningOtherRepo(
        source,
        target.repository.name
      )) {
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
  return connections;
}

export function correlateDeterministically(
  graphs: RepositoryKnowledgeGraph[]
): DeterministicCorrelationResult {
  const connections: CrossRepositoryConnection[] = [];
  const passSummaries: string[] = [];

  // Evidence-grounded passes over raw repository source (ported from
  // understand-everything's linker core).
  const evidenceResult = runEvidencePasses(graphs);
  connections.push(...evidenceResult.connections);
  passSummaries.push(...evidenceResult.passSummaries);

  const mentions = nameMentionConnections(graphs);
  connections.push(...mentions);
  passSummaries.push(`name-mention: ${mentions.length} connection(s)`);

  // A pair is unresolved only when no pass produced a connection between the
  // two repositories in either direction.
  const connected = new Set<string>();
  for (const c of connections) {
    connected.add(`${c.sourceRepo}|${c.targetRepo}`);
    connected.add(`${c.targetRepo}|${c.sourceRepo}`);
  }
  const unresolvedPairs: UnresolvedRepoPair[] = [];
  for (let i = 0; i < graphs.length; i++) {
    for (let j = i + 1; j < graphs.length; j++) {
      const a = graphs[i]?.repository.name;
      const b = graphs[j]?.repository.name;
      if (!a || !b) continue;
      if (!connected.has(`${a}|${b}`)) unresolvedPairs.push({ repoA: a, repoB: b });
    }
  }

  return { connections, unresolvedPairs, passSummaries };
}

/**
 * Runs the five evidence passes with per-pass isolation: one throwing pass
 * is reported and skipped, never blocking the others (mirrors the
 * understand-everything linker runner's failure containment).
 */
function runEvidencePasses(graphs: RepositoryKnowledgeGraph[]): {
  connections: CrossRepositoryConnection[];
  passSummaries: string[];
} {
  const connections: CrossRepositoryConnection[] = [];
  const passSummaries: string[] = [];

  let input: CorrelationInput;
  try {
    const evidence = collectEvidence(graphs);
    input = {
      repos: evidence,
      graphsByName: new Map(graphs.map((g) => [g.repository.name, g])),
    };
    const missingRoots = evidence.filter((e) => e.root === null).map((e) => e.name);
    if (missingRoots.length > 0) {
      passSummaries.push(
        `evidence: repo path unavailable for ${missingRoots.join(', ')} — graph-only correlation for those`
      );
    }
  } catch (error) {
    passSummaries.push(`evidence collection failed: ${String(error)} — falling back to graph-only`);
    return { connections, passSummaries };
  }

  for (const pass of EVIDENCE_PASSES) {
    try {
      const result = pass(input);
      connections.push(...result.connections);
      const noteSuffix = result.notes.length > 0 ? ` (${result.notes.length} note(s))` : '';
      passSummaries.push(`${result.pass}: ${result.connections.length} connection(s)${noteSuffix}`);
      for (const note of result.notes) passSummaries.push(`  note [${result.pass}]: ${note}`);
    } catch (error) {
      passSummaries.push(`pass failed (skipped): ${String(error)}`);
    }
  }
  return { connections, passSummaries };
}
