import { describe, it, expect } from 'vitest';
import { mergeModels } from '../../../src/lib/import/merge-model';
import type { ArchitectureModel } from '@archatlas/core-model';
import type { ElementConfig } from '../../../src/lib/import/types';

function baseModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  return {
    schemaVersion: '1.0.0',
    metadata: { title: 'Base' },
    elements: [{ id: 'base-svc', kind: 'system', name: 'Base Service' }],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        level: 'system',
        title: 'System Context',
        layout: { algorithm: 'grid', nodes: [], edges: [] },
      },
    ],
    ...overrides,
  };
}

function importedModel(overrides: Partial<ArchitectureModel> = {}): ArchitectureModel {
  return {
    schemaVersion: '1.0.0',
    metadata: { title: 'Imported' },
    elements: [{ id: 'new-svc', kind: 'system', name: 'New Service' }],
    relationships: [],
    constraints: [],
    views: [],
    ...overrides,
  };
}

describe('mergeModels', () => {
  it('adds an imported element that has no explicit baseElementId mapping', () => {
    const base = baseModel();
    const imported = importedModel();
    const configs: ElementConfig[] = [
      {
        id: 'new-svc',
        name: 'New Service',
        displayName: 'New Service',
        kind: 'system',
        isExternal: false,
        tags: [],
      },
    ];

    const merged = mergeModels(base, imported, configs);

    expect(merged.elements.map((e) => e.id)).toEqual(['base-svc', 'new-svc']);
  });

  it('does not add an imported element explicitly mapped to an existing base element', () => {
    const base = baseModel();
    const imported = importedModel();
    const configs: ElementConfig[] = [
      {
        id: 'new-svc',
        name: 'New Service',
        displayName: 'New Service',
        kind: 'system',
        isExternal: false,
        tags: [],
        baseElementId: 'base-svc',
      },
    ];

    const merged = mergeModels(base, imported, configs);

    expect(merged.elements).toHaveLength(1);
    expect(merged.elements[0]?.id).toBe('base-svc');
  });

  it('treats an unresolved (undefined) baseElementId conservatively as a new element', () => {
    const base = baseModel();
    const imported = importedModel();
    const configs: ElementConfig[] = [
      {
        id: 'new-svc',
        name: 'New Service',
        displayName: 'New Service',
        kind: 'system',
        isExternal: false,
        tags: [],
      },
    ];

    const merged = mergeModels(base, imported, configs);

    expect(merged.elements.some((e) => e.id === 'new-svc')).toBe(true);
  });

  it('prefixes a new element id with "imp-" when it collides with an existing base id', () => {
    const base = baseModel({ elements: [{ id: 'svc', kind: 'system', name: 'Base Svc' }] });
    const imported = importedModel({
      elements: [{ id: 'svc', kind: 'system', name: 'Imported Svc' }],
    });
    const configs: ElementConfig[] = [
      {
        id: 'svc',
        name: 'Imported Svc',
        displayName: 'Imported Svc',
        kind: 'system',
        isExternal: false,
        tags: [],
      },
    ];

    const merged = mergeModels(base, imported, configs);

    expect(merged.elements.map((e) => e.id)).toEqual(['svc', 'imp-svc']);
  });

  it('remaps a relationship endpoint to the mapped base element id', () => {
    const base = baseModel();
    const imported = importedModel({
      elements: [
        { id: 'new-svc', kind: 'system', name: 'New Service' },
        { id: 'other', kind: 'system', name: 'Other' },
      ],
      relationships: [{ id: 'r1', sourceId: 'new-svc', targetId: 'other', type: 'calls' }],
    });
    const configs: ElementConfig[] = [
      {
        id: 'new-svc',
        name: 'New Service',
        displayName: 'New Service',
        kind: 'system',
        isExternal: false,
        tags: [],
        baseElementId: 'base-svc',
      },
      {
        id: 'other',
        name: 'Other',
        displayName: 'Other',
        kind: 'system',
        isExternal: false,
        tags: [],
      },
    ];

    const merged = mergeModels(base, imported, configs);

    const rel = merged.relationships.find((r) => r.id === 'imp-r1');
    expect(rel).toMatchObject({ sourceId: 'base-svc', targetId: 'other' });
  });

  it('skips an imported relationship that duplicates an existing base relationship', () => {
    const base = baseModel({
      elements: [
        { id: 'a', kind: 'system', name: 'A' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      relationships: [{ id: 'existing', sourceId: 'a', targetId: 'b', type: 'calls' }],
    });
    const imported = importedModel({
      elements: [],
      relationships: [{ id: 'dup', sourceId: 'a', targetId: 'b', type: 'calls' }],
    });

    const merged = mergeModels(base, imported, []);

    expect(merged.relationships).toHaveLength(1);
  });

  it('recomputes the layout of the first base view to include the new elements', () => {
    const base = baseModel();
    const imported = importedModel();
    const configs: ElementConfig[] = [
      {
        id: 'new-svc',
        name: 'New Service',
        displayName: 'New Service',
        kind: 'system',
        isExternal: false,
        tags: [],
      },
    ];

    const merged = mergeModels(base, imported, configs);

    const nodeIds = merged.views[0]?.layout.nodes.map((n) => n.elementId) ?? [];
    expect(nodeIds).toEqual(expect.arrayContaining(['base-svc', 'new-svc']));
  });

  it('leaves views untouched when the base model has no views', () => {
    const base = baseModel({ views: [] });
    const imported = importedModel({ views: [] });

    const merged = mergeModels(base, imported, []);

    expect(merged.views).toEqual([]);
  });

  it('stamps metadata.updatedAt on the merged model', () => {
    const merged = mergeModels(baseModel(), importedModel(), []);
    expect(typeof merged.metadata.updatedAt).toBe('string');
  });
});
