import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@archatlas/core-model';
import {
  addContainerElementToModel,
  addElementToModel,
  saveElementToModel,
  deleteElementCascade,
} from '../../src/services/elements';

function baseModel(overrides?: Partial<ArchitectureModel>): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: {
      title: 'Test Model',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: [],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'View',
        level: 'system',
        layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] },
      },
    ],
    ...overrides,
  };
}

describe('addElementToModel', () => {
  it('adds a top-level element directly when a parent is focused', () => {
    const model = baseModel();
    const { model: updated, newElement } = addElementToModel(model, 'container', 'sys-1');

    expect(newElement.parentId).toBe('sys-1');
    expect(updated.elements).toContainEqual(newElement);
    expect(updated.views[0]?.layout.nodes).toContainEqual(
      expect.objectContaining({ elementId: newElement.id })
    );
  });

  it('auto-creates a landscape element for a system added with nothing focused', () => {
    const model = baseModel();
    const { model: updated, newElement } = addElementToModel(model, 'system', null);

    const landscape = updated.elements.find((e) => e.kind === 'landscape');
    expect(landscape).toBeDefined();
    expect(newElement.parentId).toBe(landscape?.id);
  });

  it('reuses an existing top-level landscape instead of creating a second one', () => {
    const model = baseModel({
      elements: [
        { id: 'land-1', name: 'Architecture Landscape', kind: 'landscape', description: '' },
      ],
    });
    const { model: updated, newElement } = addElementToModel(model, 'person', null);

    expect(updated.elements.filter((e) => e.kind === 'landscape')).toHaveLength(1);
    expect(newElement.parentId).toBe('land-1');
  });

  it('adds a non-top-level kind with no parent when nothing is focused', () => {
    const model = baseModel();
    const { newElement } = addElementToModel(model, 'container', null);
    expect(newElement.parentId).toBeUndefined();
  });
});

describe('addContainerElementToModel', () => {
  it('labels the element after its subtype and parents it to the focused element', () => {
    const model = baseModel();
    const { model: updated, newElement } = addContainerElementToModel(model, 'database', 'sys-1');

    expect(newElement.name).toBe('Database');
    expect(newElement.containerSubtype).toBe('database');
    expect(newElement.parentId).toBe('sys-1');
    expect(updated.elements).toContainEqual(newElement);
  });

  it('leaves parentId unset when nothing is focused', () => {
    const model = baseModel();
    const { newElement } = addContainerElementToModel(model, 'default', null);
    expect(newElement.parentId).toBeUndefined();
  });
});

describe('saveElementToModel', () => {
  it('replaces an existing element by id without touching layout', () => {
    const model = baseModel({
      elements: [{ id: 'elem-1', name: 'Old Name', kind: 'container', description: '' }],
    });
    const updated = saveElementToModel(model, {
      id: 'elem-1',
      name: 'New Name',
      kind: 'container',
      description: 'updated',
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.elements[0]?.name).toBe('New Name');
    expect(updated.views).toBe(model.views);
  });

  it('assigns a fresh id and computes layout for a brand-new element', () => {
    const model = baseModel();
    const updated = saveElementToModel(model, {
      id: 'draft-id',
      name: 'Brand New',
      kind: 'system',
      description: '',
    });

    expect(updated.elements).toHaveLength(1);
    expect(updated.elements[0]?.id).not.toBe('draft-id');
    expect(updated.elements[0]?.name).toBe('Brand New');
    expect(
      updated.views[0]?.layout.nodes.some((n) => n.elementId === updated.elements[0]?.id)
    ).toBe(true);
  });
});

describe('deleteElementCascade', () => {
  function modelWithHierarchy(): ArchitectureModel {
    return baseModel({
      elements: [
        { id: 'sys-1', name: 'System', kind: 'system', description: '' },
        { id: 'cont-1', name: 'Container', kind: 'container', description: '', parentId: 'sys-1' },
        { id: 'comp-1', name: 'Component', kind: 'component', description: '', parentId: 'cont-1' },
        { id: 'sys-2', name: 'Unrelated', kind: 'system', description: '' },
      ],
      relationships: [
        { id: 'rel-1', sourceId: 'comp-1', targetId: 'sys-2', type: 'calls' },
        { id: 'rel-2', sourceId: 'sys-2', targetId: 'sys-2', type: 'calls' },
      ],
      views: [
        {
          id: 'view-1',
          title: 'View',
          level: 'system',
          layout: {
            algorithm: 'deterministic-v1',
            nodes: [
              { elementId: 'sys-1', x: 0, y: 0 },
              { elementId: 'cont-1', x: 10, y: 10 },
              { elementId: 'comp-1', x: 20, y: 20 },
              { elementId: 'sys-2', x: 30, y: 30 },
            ],
            edges: [{ relationshipId: 'rel-1' }, { relationshipId: 'rel-2' }],
          },
        },
      ],
    });
  }

  it('deletes the element, its entire descendant subtree, and any referencing relationships/layout', () => {
    const updated = deleteElementCascade(modelWithHierarchy(), 'sys-1');

    expect(updated.elements.map((e) => e.id)).toEqual(['sys-2']);
    expect(updated.relationships.map((r) => r.id)).toEqual(['rel-2']);
    expect(updated.views[0]?.layout.nodes.map((n) => n.elementId)).toEqual(['sys-2']);
    expect(updated.views[0]?.layout.edges.map((e) => e.relationshipId)).toEqual(['rel-2']);
  });

  it('deleting a leaf element with no descendants only removes that element and relationships touching it', () => {
    const updated = deleteElementCascade(modelWithHierarchy(), 'comp-1');
    expect(updated.elements.map((e) => e.id)).toEqual(['sys-1', 'cont-1', 'sys-2']);
    // rel-1 (comp-1 -> sys-2) is gone; rel-2 (sys-2 -> sys-2) is untouched
    expect(updated.relationships.map((r) => r.id)).toEqual(['rel-2']);
  });
});
