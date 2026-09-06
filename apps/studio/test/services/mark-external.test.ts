import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@archatlas/core-model';
import { collectDescendantIds, applyMarkExternal } from '../../src/services/mark-external';

function baseModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: {
      title: 'Test Model',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: [
      { id: 'land-1', name: 'Landscape', kind: 'landscape', description: '' },
      { id: 'sys-1', name: 'System A', kind: 'system', description: '', parentId: 'land-1' },
      {
        id: 'sys-2',
        name: 'System B (no children)',
        kind: 'system',
        description: '',
        parentId: 'land-1',
      },
      { id: 'cont-1', name: 'Container A', kind: 'container', description: '', parentId: 'sys-1' },
      { id: 'comp-1', name: 'Component A', kind: 'component', description: '', parentId: 'cont-1' },
      {
        id: 'other-1',
        name: 'Unrelated System',
        kind: 'system',
        description: '',
        parentId: 'land-1',
      },
    ],
    relationships: [
      { id: 'rel-1', sourceId: 'cont-1', targetId: 'other-1', type: 'calls' },
      { id: 'rel-2', sourceId: 'other-1', targetId: 'comp-1', type: 'calls' },
      { id: 'rel-3', sourceId: 'sys-1', targetId: 'other-1', type: 'calls' },
    ],
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
            { elementId: 'other-1', x: 400, y: 0, w: 120, h: 80 },
          ],
          edges: [{ relationshipId: 'rel-3' }],
        },
      },
      {
        id: 'view-2',
        title: 'System A Containers',
        level: 'container',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [
            { elementId: 'cont-1', x: 0, y: 0, w: 120, h: 80 },
            { elementId: 'other-1', x: 200, y: 0, w: 120, h: 80 },
          ],
          edges: [{ relationshipId: 'rel-1' }],
        },
      },
    ],
  };
}

describe('collectDescendantIds', () => {
  it('finds every descendant, not just direct children', () => {
    const model = baseModel();
    expect(collectDescendantIds(model, 'sys-1').sort()).toEqual(['comp-1', 'cont-1']);
  });

  it('returns empty for an element with no children', () => {
    const model = baseModel();
    expect(collectDescendantIds(model, 'sys-2')).toEqual([]);
  });

  it('returns empty for an unknown element id', () => {
    const model = baseModel();
    expect(collectDescendantIds(model, 'does-not-exist')).toEqual([]);
  });
});

describe('applyMarkExternal', () => {
  describe('marking internal (isExternal: false)', () => {
    it('clears isExternal and deletes nothing', () => {
      const model = baseModel();
      const before = model.elements.length;
      const { model: updated, deletedElementIds } = applyMarkExternal(model, 'sys-1', false);
      expect(deletedElementIds).toEqual([]);
      expect(updated.elements).toHaveLength(before);
      expect(updated.elements.find((e) => e.id === 'sys-1')?.isExternal).toBe(false);
    });
  });

  describe('marking external (isExternal: true)', () => {
    it('reports no deletions and does not mutate elements for a childless system', () => {
      const model = baseModel();
      const { model: updated, deletedElementIds } = applyMarkExternal(model, 'sys-2', true);
      expect(deletedElementIds).toEqual([]);
      expect(updated.elements).toHaveLength(model.elements.length);
      expect(updated.elements.find((e) => e.id === 'sys-2')?.isExternal).toBe(true);
    });

    it('deletes the full descendant subtree and marks the element external', () => {
      const model = baseModel();
      const { model: updated, deletedElementIds } = applyMarkExternal(model, 'sys-1', true);

      expect(deletedElementIds.sort()).toEqual(['comp-1', 'cont-1']);
      expect(updated.elements.map((e) => e.id).sort()).toEqual(
        ['land-1', 'other-1', 'sys-1', 'sys-2'].sort()
      );
      const sys1 = updated.elements.find((e) => e.id === 'sys-1');
      expect(sys1?.isExternal).toBe(true);
    });

    it('clears any formatting override on the newly-external element', () => {
      const model = baseModel();
      const sys1 = model.elements.find((e) => e.id === 'sys-1');
      if (sys1) sys1.formatting = { backgroundColor: '#ff0000' };
      const { model: updated } = applyMarkExternal(model, 'sys-1', true);
      expect(updated.elements.find((e) => e.id === 'sys-1')?.formatting).toBeUndefined();
    });

    it('removes relationships touching any deleted descendant, keeping relationships that do not', () => {
      const model = baseModel();
      const { model: updated } = applyMarkExternal(model, 'sys-1', true);
      // rel-1 (cont-1 -> other-1) and rel-2 (other-1 -> comp-1) touch deleted elements.
      expect(updated.relationships.map((r) => r.id)).toEqual(['rel-3']);
    });

    it('removes view nodes/edges referencing deleted elements, leaving unrelated ones intact', () => {
      const model = baseModel();
      const { model: updated } = applyMarkExternal(model, 'sys-1', true);

      const containerView = updated.views.find((v) => v.id === 'view-2');
      expect(containerView?.layout.nodes.map((n) => n.elementId)).toEqual(['other-1']);
      expect(containerView?.layout.edges).toEqual([]); // rel-1 was removed

      const systemView = updated.views.find((v) => v.id === 'view-1');
      expect(systemView?.layout.nodes.map((n) => n.elementId)).toEqual([
        'sys-1',
        'sys-2',
        'other-1',
      ]);
    });

    it('does not mutate the input model', () => {
      const model = baseModel();
      const snapshot = JSON.stringify(model);
      applyMarkExternal(model, 'sys-1', true);
      expect(JSON.stringify(model)).toBe(snapshot);
    });
  });
});
