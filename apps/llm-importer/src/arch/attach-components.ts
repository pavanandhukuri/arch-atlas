/**
 * 014-component-layer-drilldown: merge a {repo}.components.json artifact directly
 * into one container of an existing .arch.json, in place — no separate,
 * persisted component artifact; `.arch.json` remains the one file that holds
 * the diagram, start to finish. Pure, no I/O — `cli.ts`'s
 * `runAttachComponentsCommand` reads/writes the files and reports.
 *
 * Builds ordinary `component`-kind Elements (parentId = the container) and
 * Relationships using core-model's existing shapes — no schema change there.
 * Recomputes layout via `@archatlas/layout`'s `computeLayout` over every
 * element (not just the new ones), which fills in a position for any element
 * missing one — the deterministic fix for the silent-invisibility risk a
 * hand-spliced layout entry would otherwise carry.
 */
import type { ArchitectureModel, Element, Relationship } from '@archatlas/core-model';
import { computeLayout } from '@archatlas/layout';
import type { ComponentAnalysis } from '../analysis/component-analysis.schema.js';

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function attachComponentsToModel(
  model: ArchitectureModel,
  containerName: string,
  artifact: ComponentAnalysis
): ArchitectureModel {
  const matches = model.elements.filter(
    (e) => e.kind === 'container' && normalize(e.name) === normalize(containerName)
  );
  if (matches.length === 0) {
    throw new Error(`no container named "${containerName}" found in this model`);
  }
  if (matches.length > 1) {
    throw new Error(
      `ambiguous: ${matches.length} containers are named "${containerName}" — rename one and retry`
    );
  }
  const container = matches[0];
  if (!container) {
    throw new Error(`no container named "${containerName}" found in this model`);
  }

  if (normalize(artifact.repository.name) !== normalize(containerName)) {
    throw new Error(
      `components file's repository "${artifact.repository.name}" does not match --container "${containerName}" — mismatch`
    );
  }

  const now = Date.now();
  const nameToId = new Map<string, string>();
  const newElements: Element[] = artifact.components.map((c, i) => {
    const id = `component-${now}-${i}`;
    nameToId.set(c.name, id);
    return {
      id,
      kind: 'component',
      name: c.name,
      description: c.description,
      parentId: container.id,
      componentType: c.kind,
    };
  });

  const newRelationships: Relationship[] = artifact.relationships.map((r, i) => {
    const sourceId = nameToId.get(r.source);
    const targetId = nameToId.get(r.target);
    if (!sourceId || !targetId) {
      // ComponentAnalysisSchema already guarantees every source/target names a
      // component in the same artifact — this would only fire on a caller
      // bypassing that validator.
      throw new Error(`relationship ${i} references a component not in this artifact`);
    }
    return {
      id: `rel-${now}-${i}`,
      sourceId,
      targetId,
      type: 'relates_to',
      ...(r.description && { description: r.description }),
    };
  });

  const updatedElements = [...model.elements, ...newElements];
  const updatedRelationships = [...model.relationships, ...newRelationships];

  const currentView = model.views[0];
  const updatedViews = currentView
    ? [
        {
          ...currentView,
          layout: computeLayout(
            { ...model, elements: updatedElements, relationships: updatedRelationships },
            currentView,
            { algorithm: 'deterministic-v1' }
          ),
        },
        ...model.views.slice(1),
      ]
    : model.views;

  return {
    ...model,
    elements: updatedElements,
    relationships: updatedRelationships,
    views: updatedViews,
  };
}
