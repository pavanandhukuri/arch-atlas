import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import { addRelationshipToModel, removeRelationshipFromModel } from '../src/services/relationships';

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

    const view = updated.views.find(v => v.id === 'view-1');
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

    const view = updated.views.find(v => v.id === 'view-1');
    expect(view).toBeDefined();
    expect(view?.layout.edges).toHaveLength(0);
  });
});
