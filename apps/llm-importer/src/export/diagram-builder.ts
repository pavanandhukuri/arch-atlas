import type { ArchitectureModel, Element, Relationship, View } from '@arch-atlas/core-model';
import { computeLayout } from '@arch-atlas/layout';
import type { ReviewFile } from '../review/review-file.js';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'elem'
  );
}

const CANDIDATE_TYPE_TO_RELATIONSHIP: Record<string, string> = {
  database: 'uses',
  http: 'calls',
  kafka: 'publishes',
  queue: 'publishes',
  grpc: 'calls',
};

/**
 * Builds the final .arch.json from an accepted-candidates review file.
 * Schema unchanged from the retired revision (spec.md: explicitly out of
 * scope) — this mirrors what the retired Python build_diagram_from_review()
 * did, just in TypeScript against the real @arch-atlas/core-model types.
 */
export function buildDiagram(
  review: ReviewFile,
  title = 'Imported Architecture'
): ArchitectureModel {
  const elementMap = new Map<string, Element>();

  for (const repoName of review.source_repos) {
    const id = slug(repoName);
    if (!elementMap.has(id)) {
      elementMap.set(id, { id, kind: 'container', name: repoName });
    }
  }

  const accepted = review.candidates.filter((c) => c.status === 'accepted');
  const relationships: Relationship[] = [];
  const seen = new Set<string>();

  for (const candidate of accepted) {
    const sourceId = slug(candidate.override_name ?? candidate.source);
    const targetId = slug(candidate.target);
    if (!elementMap.has(sourceId))
      elementMap.set(sourceId, { id: sourceId, kind: 'container', name: candidate.source });
    if (!elementMap.has(targetId))
      elementMap.set(targetId, { id: targetId, kind: 'container', name: candidate.target });
    if (sourceId === targetId) continue;

    const type =
      candidate.override_type ?? CANDIDATE_TYPE_TO_RELATIONSHIP[candidate.type] ?? candidate.type;
    const dedupeKey = `${sourceId}|${targetId}|${type}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    relationships.push({
      id: `rel-${candidate.id}`,
      sourceId,
      targetId,
      type,
      description: candidate.reasoning,
    });
  }

  const elements = Array.from(elementMap.values());
  const partialModel: ArchitectureModel = {
    schemaVersion: '1.0.0',
    metadata: { title, createdAt: new Date().toISOString() },
    elements,
    relationships,
    constraints: [],
    views: [],
  };

  const rootView: View = {
    id: 'view-root',
    level: 'system',
    title: 'System Context',
    layout: { algorithm: 'grid', nodes: [], edges: [] },
  };
  const layout = computeLayout(partialModel, rootView, {
    algorithm: 'grid',
    spacing: 200,
    padding: 80,
  });

  return { ...partialModel, views: [{ ...rootView, layout }] };
}
