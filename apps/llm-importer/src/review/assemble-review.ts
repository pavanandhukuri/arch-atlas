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
): 'evidence-correlation' | 'deterministic-correlation' | 'agentic-correlation-fallback' {
  if (connection.foundBy === 'evidence') return 'evidence-correlation';
  return connection.foundBy === 'deterministic'
    ? 'deterministic-correlation'
    : 'agentic-correlation-fallback';
}

export function assembleReviewFile(
  graphs: RepositoryKnowledgeGraph[],
  connections: CrossRepositoryConnection[],
  repoMetaByName?: Map<string, RepoMeta>
): ReviewFile {
  const candidates: Candidate[] = connections.map((connection, index) => {
    const candidateType = EDGE_TYPE_TO_CANDIDATE_TYPE[connection.type] ?? 'http';
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
    // No a-priori system grouping — the human reviewer assigns systems in
    // Studio's Tag & Classify step (spec.md: this decision belongs to the
    // reviewer, never auto-guessed — matches the retired pipeline's design).
    systems: [],
    candidates,
    repos,
  };
}
