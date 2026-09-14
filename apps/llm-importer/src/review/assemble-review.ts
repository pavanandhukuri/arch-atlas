import type { RepositoryKnowledgeGraph, GraphEdgeType } from '../graph/schema.js';
import type { CrossRepositoryConnection } from '../correlate/deterministic-correlator.js';
import { mapToConfidenceBucket } from '../confidence/bucket-mapper.js';
import type { Candidate, RepoMeta, ReviewFile } from './review-file.js';

/**
 * Our trimmed GraphEdgeType (research.md D10) is a superset of the retired
 * review-artifact's CandidateType — map down to what Studio's wizard already
 * understands. Only the edge types the correlator ever actually emits
 * (research.md D7's OUTBOUND_EDGE_TYPES) need a mapping; anything else is
 * intra-repo structure, never surfaced as a cross-service candidate.
 */
const EDGE_TYPE_TO_CANDIDATE_TYPE: Partial<Record<GraphEdgeType, Candidate['type']>> = {
  calls: 'http',
  depends_on: 'http',
  serves: 'http',
  routes: 'http',
  publishes: 'kafka',
  subscribes: 'kafka',
  reads_from: 'database',
  writes_to: 'database',
  // Compose-derived deployment wiring; the wizard has no dedicated deploy
  // type, and http is its generic service-to-service bucket.
  deploys: 'http',
};

function connectionSource(
  connection: CrossRepositoryConnection
):
  | 'evidence-correlation'
  | 'deterministic-correlation'
  | 'external-outbound'
  | 'agentic-correlation-fallback' {
  switch (connection.foundBy) {
    case 'evidence':
      return 'evidence-correlation';
    case 'deterministic':
      return 'deterministic-correlation';
    case 'external-outbound':
      return 'external-outbound';
    default:
      return 'agentic-correlation-fallback';
  }
}

export function assembleReviewFile(
  graphs: RepositoryKnowledgeGraph[],
  connections: CrossRepositoryConnection[],
  repoMetaByName?: Map<string, RepoMeta>,
  systems: ReviewFile['systems'] = []
): ReviewFile {
  const candidates: Candidate[] = connections.map((connection, index) => {
    // 009: a gRPC-tagged `calls` connection surfaces as candidate type 'grpc'
    // (already a valid CandidateType). Connections from every other pass carry
    // no `transport`, so their mapping is unchanged.
    const candidateType =
      connection.type === 'calls' && connection.transport === 'grpc'
        ? 'grpc'
        : (EDGE_TYPE_TO_CANDIDATE_TYPE[connection.type] ?? 'http');
    return {
      id: `cand_${index + 1}`,
      source: connection.sourceRepo,
      target: connection.targetRepo,
      type: candidateType,
      reasoning: connection.evidence.join('; ') || `${connection.type} relationship detected`,
      confidence: mapToConfidenceBucket(connection.weight, connectionSource(connection)),
      status: 'pending',
      override_name: null,
      override_type: null,
    };
  });

  const repos: RepoMeta[] = graphs.map(
    (g) => repoMetaByName?.get(g.repository.name) ?? { name: g.repository.name }
  );

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    source_repos: graphs.map((g) => g.repository.name),
    // Grouping is still never auto-guessed from repo names/keywords — that
    // judgment call belongs to a human. It can now come from two places: the
    // human declaring it upfront in import.yaml's `systems` (resolved by
    // runImport, passed in here), or — when they didn't — left empty for the
    // human reviewer to assign in Studio's Tag & Classify step, same as before.
    systems,
    candidates,
    repos,
  };
}
