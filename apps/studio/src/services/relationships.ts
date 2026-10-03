import type { ArchitectureModel, Relationship } from '@archatlas/core-model';

interface AddRelationshipParams {
  model: ArchitectureModel;
  viewId: string;
  sourceId: string;
  targetId: string;
  type?: string;
  id?: string;
}

export function addRelationshipToModel(params: AddRelationshipParams): ArchitectureModel {
  const { model, viewId, sourceId, targetId, type = 'relates_to', id } = params;
  const relationshipId = id ?? `rel-${Date.now()}`;

  const relationship: Relationship = {
    id: relationshipId,
    sourceId,
    targetId,
    type,
  };

  const updatedRelationships = [...model.relationships, relationship];
  const updatedViews = model.views.map((view) => {
    if (view.id !== viewId) {
      return view;
    }

    const edges = view.layout.edges;
    return {
      ...view,
      layout: {
        ...view.layout,
        edges: [...edges, { relationshipId }],
      },
    };
  });

  return {
    ...model,
    relationships: updatedRelationships,
    views: updatedViews,
  };
}

/**
 * Saves a relationship into the model. When `_originalId` is set, the relationship is a
 * UI-only "derived" one shown for a cross-layer view — the save instead updates the metadata
 * of the real underlying relationship it was derived from, and touches no layout. Otherwise
 * it's a direct upsert by id, ensuring layout nodes exist for both endpoints in the first view
 * (new relationships can connect elements not yet placed on that view, e.g. cross-layer edges).
 */
export function saveRelationshipToModel(
  model: ArchitectureModel,
  relationship: Relationship & { _originalId?: string }
): ArchitectureModel {
  const { _originalId: originalId, ...relationshipData } = relationship;

  if (originalId) {
    const updatedRelationships = model.relationships.map((rel) =>
      rel.id === originalId
        ? {
            ...rel,
            sourceId: relationshipData.sourceId,
            targetId: relationshipData.targetId,
            action: relationshipData.action,
            integrationMode: relationshipData.integrationMode,
            description: relationshipData.description,
          }
        : rel
    );
    return { ...model, relationships: updatedRelationships };
  }

  const exists = model.relationships.some((r) => r.id === relationshipData.id);
  const updatedRelationships = exists
    ? model.relationships.map((rel) => (rel.id === relationshipData.id ? relationshipData : rel))
    : [...model.relationships, relationshipData];

  const currentView = model.views[0];
  let updatedViews = model.views;
  if (currentView) {
    const existingNodeIds = new Set(currentView.layout.nodes.map((n) => n.elementId));
    const newNodes = [...currentView.layout.nodes];
    [relationshipData.sourceId, relationshipData.targetId].forEach((eid, i) => {
      if (eid && !existingNodeIds.has(eid)) {
        newNodes.push({ elementId: eid, x: 600 + i * 250, y: 80, w: 200, h: 130 });
      }
    });
    updatedViews = [
      { ...currentView, layout: { ...currentView.layout, nodes: newNodes } },
      ...model.views.slice(1),
    ];
  }

  return { ...model, relationships: updatedRelationships, views: updatedViews };
}

export function removeRelationshipFromModel(
  model: ArchitectureModel,
  relationshipId: string
): ArchitectureModel {
  const updatedRelationships = model.relationships.filter((rel) => rel.id !== relationshipId);
  const updatedViews = model.views.map((view) => ({
    ...view,
    layout: {
      ...view.layout,
      edges: view.layout.edges.filter((edge) => edge.relationshipId !== relationshipId),
    },
  }));

  return {
    ...model,
    relationships: updatedRelationships,
    views: updatedViews,
  };
}
