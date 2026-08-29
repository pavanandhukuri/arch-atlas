import type { ArchitectureModel, Element, Relationship, View } from '@arch-atlas/core-model';
import { computeLayout } from '@arch-atlas/layout';
import type { WizardState, Candidate, ElementConfig } from './types';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'elem'
  );
}

/** Relationship type mapping from candidate connection type */
const RELATIONSHIP_TYPE_MAP: Record<string, string> = {
  database: 'uses',
  http: 'calls',
  kafka: 'publishes',
  queue: 'publishes',
  grpc: 'calls',
};

/**
 * Build a name-to-element-id lookup from a list of elements and ElementConfigs.
 * Priority: ElementConfig.name → slug(name) fallback.
 */
function buildNameToIdMap(
  elements: Element[],
  elementConfigs: ElementConfig[]
): Map<string, string> {
  const map = new Map<string, string>();

  // First, map by ElementConfig canonical name to the config's id
  for (const config of elementConfigs) {
    map.set(config.name, config.id);
  }

  // Then, ensure every element in the final list is also mapped by its name
  for (const el of elements) {
    if (!map.has(el.name)) {
      map.set(el.name, el.id);
    }
  }

  return map;
}

export function buildModel(state: WizardState, title?: string): ArchitectureModel {
  const { systems, elements: elementConfigs, candidates, reviewFile } = state;
  const sourceRepos = reviewFile?.source_repos ?? [];

  // ---- 1. Collect all elements ----

  // Track elements by id to avoid duplicates
  const elementMap = new Map<string, Element>();

  // 1a. Create system elements for each SystemGroup
  for (const system of systems) {
    const systemEl: Element = {
      id: slug(system.name),
      kind: 'system',
      name: system.name,
    };
    elementMap.set(systemEl.id, systemEl);
  }

  // 1b. Find all repos that are assigned to at least one system
  const assignedRepos = new Set<string>(systems.flatMap((s) => s.repoNames));

  // 1c. For ungrouped repos (in source_repos but not assigned to any system), create system elements
  for (const repo of sourceRepos) {
    if (!assignedRepos.has(repo)) {
      const repoEl: Element = {
        id: slug(repo),
        kind: 'system',
        name: repo,
      };
      // Don't overwrite an existing system element with the same slug
      if (!elementMap.has(repoEl.id)) {
        elementMap.set(repoEl.id, repoEl);
      }
    }
  }

  // 1d. For each ElementConfig, create the appropriate Element
  for (const config of elementConfigs) {
    if (config.kind === 'container') {
      // Find parent system element
      let parentId: string | undefined;

      if (config.systemId !== undefined) {
        // Find the system in state.systems
        const parentSystem = systems.find((s) => s.id === config.systemId);
        if (parentSystem !== undefined) {
          parentId = slug(parentSystem.name);
        }
      }

      const containerEl: Element = {
        id: config.id,
        kind: 'container',
        name: config.displayName,
        ...(parentId !== undefined && { parentId }),
        ...(config.containerSubtype !== undefined && { containerSubtype: config.containerSubtype }),
        ...(config.technology !== undefined && { technology: config.technology }),
        ...(config.description !== undefined && { description: config.description }),
        ...(config.tags.length > 0 && { tags: config.tags }),
      };
      // Container elements always get added / overwrite placeholder
      elementMap.set(containerEl.id, containerEl);
    } else if (config.kind === 'system') {
      const existingEl = elementMap.get(config.id);
      // Only overwrite if not already set by a SystemGroup (which takes precedence for grouping)
      // We merge: use the config's display name and external flag
      const systemEl: Element = {
        id: config.id,
        kind: 'system',
        name: config.displayName,
        ...(config.isExternal && { isExternal: true }),
        ...(config.description !== undefined && { description: config.description }),
        ...(config.tags.length > 0 && { tags: config.tags }),
        // Preserve parentId if already set
        ...(existingEl?.parentId !== undefined && { parentId: existingEl.parentId }),
      };
      elementMap.set(systemEl.id, systemEl);
    } else {
      const personEl: Element = {
        id: config.id,
        kind: 'person',
        name: config.displayName,
        ...(config.description !== undefined && { description: config.description }),
        ...(config.tags.length > 0 && { tags: config.tags }),
      };
      elementMap.set(personEl.id, personEl);
    }
  }

  const allElements = Array.from(elementMap.values());

  // ---- 2. Build name→id lookup ----
  const nameToId = buildNameToIdMap(allElements, elementConfigs);

  // ---- 3. Create relationships from accepted candidates ----
  const relationships: Relationship[] = [];
  const relSet = new Set<string>(); // deduplicate by "sourceId|targetId|type"

  const acceptedCandidates: Candidate[] = candidates.filter((c) => c.status === 'accepted');

  for (const candidate of acceptedCandidates) {
    const resolvedTargetName = candidate.override_name ?? candidate.target;
    const resolvedSourceName = candidate.source;

    const sourceId = nameToId.get(resolvedSourceName) ?? slug(resolvedSourceName);
    const targetId = nameToId.get(resolvedTargetName) ?? slug(resolvedTargetName);

    // Skip self-loops and missing IDs
    if (!sourceId || !targetId || sourceId === targetId) continue;

    const relType = RELATIONSHIP_TYPE_MAP[candidate.type] ?? candidate.type;
    const dedupKey = `${sourceId}|${targetId}|${relType}`;
    if (relSet.has(dedupKey)) continue;
    relSet.add(dedupKey);

    const relationship: Relationship = {
      id: `rel-${candidate.id}`,
      sourceId,
      targetId,
      type: relType,
      ...(candidate.override_type !== null && { integrationMode: candidate.override_type }),
    };
    relationships.push(relationship);
  }

  const modelTitle = title ?? 'Imported Architecture';

  // Partial model used for layout computation
  const partialModel: ArchitectureModel = {
    schemaVersion: '1.0.0',
    metadata: { title: modelTitle, createdAt: new Date().toISOString() },
    elements: allElements,
    relationships,
    constraints: [],
    views: [],
  };

  // ---- 4. System context view (level: 'system') ----
  // Shows all system-kind elements + relationships that cross system boundaries
  // or connect to external systems.
  const systemContextView: View = {
    id: 'view-system-context',
    level: 'system',
    title: 'System Context',
    layout: { algorithm: 'grid', nodes: [], edges: [] },
  };

  const systemContextLayout = computeLayout(partialModel, systemContextView, {
    algorithm: 'grid',
    spacing: 220,
    padding: 80,
  });

  const finalViews: View[] = [{ ...systemContextView, layout: systemContextLayout }];

  // ---- 5. Container views — one per SystemGroup (level: 'container') ----
  // Each view shows the containers inside that system plus their relationships.
  const systemIdToSlug = new Map<string, string>();
  for (const system of systems) {
    systemIdToSlug.set(system.id, slug(system.name));
  }

  for (const system of systems) {
    const systemSlug = slug(system.name);

    // Containers belonging to this system
    const containerIds = new Set(
      allElements
        .filter((el) => el.kind === 'container' && el.parentId === systemSlug)
        .map((el) => el.id)
    );

    if (containerIds.size === 0) continue;

    const containerView: View = {
      id: `view-container-${systemSlug}`,
      level: 'container',
      title: `${system.name} — Containers`,
      layout: { algorithm: 'grid', nodes: [], edges: [] },
    };

    // Build a partial model scoped to just the containers + their relationships
    const scopedElements = allElements.filter(
      (el) => containerIds.has(el.id) || el.id === systemSlug
    );
    const scopedRelationships = relationships.filter(
      (r) => containerIds.has(r.sourceId) || containerIds.has(r.targetId)
    );
    const scopedModel: ArchitectureModel = {
      ...partialModel,
      elements: scopedElements,
      relationships: scopedRelationships,
    };

    const containerLayout = computeLayout(scopedModel, containerView, {
      algorithm: 'grid',
      spacing: 200,
      padding: 60,
    });

    finalViews.push({ ...containerView, layout: containerLayout });
  }

  return {
    schemaVersion: '1.0.0',
    metadata: { title: modelTitle, createdAt: new Date().toISOString() },
    elements: allElements,
    relationships,
    constraints: [],
    views: finalViews,
  };
}
