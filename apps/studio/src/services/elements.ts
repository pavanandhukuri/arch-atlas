import type {
  ArchitectureModel,
  ContainerSubtype,
  Element,
  ElementKind,
} from '@archatlas/core-model';
import { computeLayout } from '@archatlas/layout';
import { collectDescendantIds } from './mark-external';

const CONTAINER_SUBTYPE_LABELS: Record<ContainerSubtype, string> = {
  default: 'Container',
  database: 'Database',
  'storage-bucket': 'Storage Bucket',
  'static-content': 'Static Content',
  'user-interface': 'User Interface',
  'backend-service': 'Backend Service',
};

export interface AddElementResult {
  model: ArchitectureModel;
  newElement: Element;
}

/** Appends a default layout node for `newElement` to the model's first view (if any). */
function withDefaultLayoutNode(
  model: ArchitectureModel,
  elements: Element[],
  newElement: Element
): ArchitectureModel {
  const currentView = model.views[0];
  const updatedViews = currentView
    ? [
        {
          ...currentView,
          layout: {
            ...currentView.layout,
            nodes: [
              ...currentView.layout.nodes,
              {
                elementId: newElement.id,
                x: 100 + elements.length * 30,
                y: 100 + elements.length * 20,
                w: 200,
                h: 130,
              },
            ],
          },
        },
        ...model.views.slice(1),
      ]
    : model.views;

  return { ...model, elements, views: updatedViews };
}

/** Adds a new container element (of the given visual subtype), parented to `focusedElementId` when set. */
export function addContainerElementToModel(
  model: ArchitectureModel,
  subtype: ContainerSubtype,
  focusedElementId: string | null
): AddElementResult {
  const newElement: Element = {
    id: `elem-${Date.now()}`,
    name: CONTAINER_SUBTYPE_LABELS[subtype],
    kind: 'container',
    description: '',
    containerSubtype: subtype,
  };
  if (focusedElementId) {
    newElement.parentId = focusedElementId;
  }

  const updatedElements = [...model.elements, newElement];
  return { model: withDefaultLayoutNode(model, updatedElements, newElement), newElement };
}

/**
 * Adds a new element of `kind`. When nothing is focused and the kind is a top-level one
 * (system/person), auto-creates (or reuses) the top-level landscape element as its parent.
 */
export function addElementToModel(
  model: ArchitectureModel,
  kind: ElementKind,
  focusedElementId: string | null
): AddElementResult {
  const newElement: Element = {
    id: `elem-${Date.now()}`,
    name: `New ${kind}`,
    kind,
    description: '',
  };
  const updatedElements = [...model.elements];

  if (focusedElementId) {
    newElement.parentId = focusedElementId;
    updatedElements.push(newElement);
  } else if (kind === 'system' || kind === 'person') {
    let landscape = model.elements.find((e) => e.kind === 'landscape' && !e.parentId);
    if (!landscape) {
      landscape = {
        id: `landscape-${Date.now()}`,
        name: 'Architecture Landscape',
        kind: 'landscape' as ElementKind,
        description: 'Top-level architecture landscape',
      };
      updatedElements.push(landscape);
    }
    newElement.parentId = landscape.id;
    updatedElements.push(newElement);
  } else {
    updatedElements.push(newElement);
  }

  return { model: withDefaultLayoutNode(model, updatedElements, newElement), newElement };
}

/**
 * Saves an edited or brand-new element into the model. New elements (not already present
 * by id) get a fresh id and their view's layout recomputed so they get placed sensibly.
 */
export function saveElementToModel(model: ArchitectureModel, element: Element): ArchitectureModel {
  const isExisting = model.elements.some((e) => e.id === element.id);
  const updatedElements = isExisting
    ? model.elements.map((e) => (e.id === element.id ? element : e))
    : [...model.elements, { ...element, id: `elem-${Date.now()}` }];

  const currentView = model.views[0];
  const updatedViews =
    currentView && !isExisting
      ? [
          {
            ...currentView,
            layout: computeLayout({ ...model, elements: updatedElements }, currentView, {
              algorithm: 'deterministic-v1',
            }),
          },
          ...model.views.slice(1),
        ]
      : model.views;

  return { ...model, elements: updatedElements, views: updatedViews };
}

/** Deletes `elementId` and its entire descendant subtree, along with any relationships/layout referencing them. */
export function deleteElementCascade(
  model: ArchitectureModel,
  elementId: string
): ArchitectureModel {
  const toDelete = new Set([elementId, ...collectDescendantIds(model, elementId)]);
  const updatedElements = model.elements.filter((e) => !toDelete.has(e.id));
  const updatedRelationships = model.relationships.filter(
    (r) => !toDelete.has(r.sourceId) && !toDelete.has(r.targetId)
  );
  const updatedViews = model.views.map((v) => ({
    ...v,
    layout: {
      ...v.layout,
      nodes: v.layout.nodes.filter((n) => !toDelete.has(n.elementId)),
      edges: v.layout.edges.filter((edge) =>
        updatedRelationships.some((r) => r.id === edge.relationshipId)
      ),
    },
  }));

  return {
    ...model,
    elements: updatedElements,
    relationships: updatedRelationships,
    views: updatedViews,
  };
}
