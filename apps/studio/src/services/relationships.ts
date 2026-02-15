import type { ArchitectureModel, Relationship } from '@arch-atlas/core-model';

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
  const updatedViews = model.views.map(view => {
    if (view.id !== viewId) {
      return view;
    }

    const edges = view.layout.edges ?? [];
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

export function removeRelationshipFromModel(
  model: ArchitectureModel,
  relationshipId: string
): ArchitectureModel {
  const updatedRelationships = model.relationships.filter(rel => rel.id !== relationshipId);
  const updatedViews = model.views.map(view => ({
    ...view,
    layout: {
      ...view.layout,
      edges: view.layout.edges.filter(edge => edge.relationshipId !== relationshipId),
    },
  }));

  return {
    ...model,
    relationships: updatedRelationships,
    views: updatedViews,
  };
}
