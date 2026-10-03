import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@archatlas/core-model';
import {
  addRelationshipToModel,
  removeRelationshipFromModel,
  saveRelationshipToModel,
} from '../src/services/relationships';

function createBaseModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: {
      title: 'Test Model',
      description: 'Relationships test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: [
      { id: 'sys-1', name: 'System A', kind: 'system', description: '' },
      { id: 'sys-2', name: 'System B', kind: 'system', description: '' },
    ],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'System Context',
        level: 'system',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [
            { elementId: 'sys-1', x: 0, y: 0, w: 120, h: 80 },
            { elementId: 'sys-2', x: 200, y: 0, w: 120, h: 80 },
          ],
          edges: [],
        },
      },
    ],
  };
}

describe('Relationship helpers', () => {
  it('adds a relationship and updates layout edges for the view', () => {
    const model = createBaseModel();

    const updated = addRelationshipToModel({
      model,
      viewId: 'view-1',
      sourceId: 'sys-1',
      targetId: 'sys-2',
      type: 'relates_to',
      id: 'rel-1',
    });

    expect(updated.relationships).toHaveLength(1);
    expect(updated.relationships[0]?.id).toBe('rel-1');
    expect(updated.relationships[0]?.sourceId).toBe('sys-1');
    expect(updated.relationships[0]?.targetId).toBe('sys-2');

    const view = updated.views.find((v) => v.id === 'view-1');
    expect(view).toBeDefined();
    expect(view?.layout.edges).toHaveLength(1);
    expect(view?.layout.edges[0]?.relationshipId).toBe('rel-1');
  });

  it('removes a relationship and its layout edge', () => {
    const model = createBaseModel();
    const withRelationship = addRelationshipToModel({
      model,
      viewId: 'view-1',
      sourceId: 'sys-1',
      targetId: 'sys-2',
      type: 'relates_to',
      id: 'rel-1',
    });

    const updated = removeRelationshipFromModel(withRelationship, 'rel-1');
    expect(updated.relationships).toHaveLength(0);

    const view = updated.views.find((v) => v.id === 'view-1');
    expect(view).toBeDefined();
    expect(view?.layout.edges).toHaveLength(0);
  });
});

describe('saveRelationshipToModel', () => {
  it('upserts a new relationship and adds layout nodes for endpoints missing from the view', () => {
    const model = createBaseModel();
    const updated = saveRelationshipToModel(model, {
      id: 'rel-new',
      sourceId: 'sys-1',
      targetId: 'sys-3',
      type: 'relates_to',
    });

    expect(updated.relationships).toHaveLength(1);
    expect(updated.relationships[0]?.id).toBe('rel-new');
    const nodeIds = updated.views[0]?.layout.nodes.map((n) => n.elementId);
    expect(nodeIds).toContain('sys-3');
    // sys-1 already had a node — shouldn't get a duplicate
    expect(nodeIds?.filter((id) => id === 'sys-1')).toHaveLength(1);
  });

  it('replaces an existing relationship by id without adding duplicate layout nodes', () => {
    const model = createBaseModel();
    const withRel = addRelationshipToModel({
      model,
      viewId: 'view-1',
      sourceId: 'sys-1',
      targetId: 'sys-2',
      id: 'rel-1',
    });

    const updated = saveRelationshipToModel(withRel, {
      id: 'rel-1',
      sourceId: 'sys-1',
      targetId: 'sys-2',
      type: 'relates_to',
      action: 'Fetches data',
    });

    expect(updated.relationships).toHaveLength(1);
    expect(updated.relationships[0]?.action).toBe('Fetches data');
    expect(updated.views[0]?.layout.nodes).toHaveLength(2);
  });

  it('with _originalId, updates the underlying relationship metadata and touches no layout', () => {
    const model = createBaseModel();
    const withRel = addRelationshipToModel({
      model,
      viewId: 'view-1',
      sourceId: 'sys-1',
      targetId: 'sys-2',
      id: 'rel-1',
      type: 'relates_to',
    });

    const updated = saveRelationshipToModel(withRel, {
      id: 'derived-rel-1',
      _originalId: 'rel-1',
      sourceId: 'sys-2',
      targetId: 'sys-1',
      type: 'relates_to',
      action: 'Sends events',
      description: 'updated description',
    });

    expect(updated.relationships).toHaveLength(1);
    const saved = updated.relationships[0];
    expect(saved?.id).toBe('rel-1');
    expect(saved?.sourceId).toBe('sys-2');
    expect(saved?.targetId).toBe('sys-1');
    expect(saved?.action).toBe('Sends events');
    expect(saved?.description).toBe('updated description');
    expect(updated.views).toBe(withRel.views);
  });
});
