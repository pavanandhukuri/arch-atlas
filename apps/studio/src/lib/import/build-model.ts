import type { ArchitectureModel, Element, Relationship, View } from '@archatlas/core-model';
import { computeLayout } from '@archatlas/layout';
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
 * Arrow label shown on the diagram (Relationship.action). The renderer only
 * draws a label when `action` or `integrationMode` is set — candidates never
 * populate either by default, so connections rendered with no text at all.
 */
const RELATIONSHIP_ACTION_MAP: Record<string, string> = {
  database: 'Queries',
  http: 'Calls',
  kafka: 'Publishes to',
  queue: 'Publishes to',
  grpc: 'Calls',
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
      // config.kind === 'person' — the only remaining option after the checks above.
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
      action: RELATIONSHIP_ACTION_MAP[candidate.type] ?? relType,
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

  // ---- 4. Single view laying out every element ----
  // Studio (and DiagramViewer) work off one view per diagram: node positions
  // for ALL elements live in views[0].layout.nodes, and the viewer derives
  // which nodes are visible at a given drill level dynamically via parentId
  // (see diagram-navigation.ts's getVisibleElements). A view laid out with
  // only system-kind elements — or split into separate per-level views — left
  // containers with no computed position, so drilling into a system rendered
  // nothing. Mirrors studio-page.tsx's computeLayout(model, currentView, ...).
  const rootView: View = {
    id: 'view-root',
    level: 'system',
    title: 'System Context',
    layout: { algorithm: 'grid', nodes: [], edges: [] },
  };

  const rootLayout = computeLayout(partialModel, rootView, {
    algorithm: 'grid',
    spacing: 200,
    padding: 80,
  });

  return {
    schemaVersion: '1.0.0',
    metadata: { title: modelTitle, createdAt: new Date().toISOString() },
    elements: allElements,
    relationships,
    constraints: [],
    views: [{ ...rootView, layout: rootLayout }],
  };
}
