import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@archatlas/core-model';
import { attachComponentsToModel } from '../../src/arch/attach-components.js';
import type { ComponentAnalysis } from '../../src/analysis/component-analysis.schema.js';

function baseModel(overrides?: Partial<ArchitectureModel>): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title: 'Test Model', createdAt: '', updatedAt: '' },
    elements: [
      { id: 'container-1', kind: 'container', name: 'catalog-service', description: '' },
      { id: 'container-2', kind: 'container', name: 'order-service', description: '' },
    ],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'View',
        level: 'container',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [
            { elementId: 'container-1', x: 0, y: 0 },
            { elementId: 'container-2', x: 300, y: 0 },
          ],
          edges: [],
        },
      },
    ],
    ...overrides,
  };
}

const ARTIFACT: ComponentAnalysis = {
  schemaVersion: '1.0',
  analyzedAt: '2026-10-03T12:00:00.000Z',
  repository: { name: 'catalog-service', path: 'repos/catalog-service' },
  components: [
    { name: 'BookController', kind: 'controller', description: 'Serves /books' },
    { name: 'BookRepository', kind: 'repository', description: 'JPA repository' },
  ],
  relationships: [
    { source: 'BookController', target: 'BookRepository', description: 'reads book rows' },
  ],
  analysisStatus: 'complete',
  retryCount: 0,
};

describe('attachComponentsToModel', () => {
  it('creates one component Element per entry, parented to the named container', () => {
    const updated = attachComponentsToModel(baseModel(), 'catalog-service', ARTIFACT);
    const created = updated.elements.filter((e) => e.kind === 'component');

    expect(created).toHaveLength(2);
    const controller = created.find((e) => e.name === 'BookController');
    expect(controller).toMatchObject({
      kind: 'component',
      name: 'BookController',
      description: 'Serves /books',
      parentId: 'container-1',
      componentType: 'controller',
    });
  });

  it('matches the container name case/whitespace-insensitively', () => {
    const updated = attachComponentsToModel(baseModel(), '  Catalog-Service  ', ARTIFACT);
    expect(updated.elements.filter((e) => e.kind === 'component')).toHaveLength(2);
  });

  it('creates one Relationship per entry, pointing at the new component Elements', () => {
    const updated = attachComponentsToModel(baseModel(), 'catalog-service', ARTIFACT);
    const created = updated.elements.filter((e) => e.kind === 'component');
    const controller = created.find((e) => e.name === 'BookController');
    const repository = created.find((e) => e.name === 'BookRepository');
    expect(controller).toBeDefined();
    expect(repository).toBeDefined();

    expect(updated.relationships).toHaveLength(1);
    expect(updated.relationships[0]).toMatchObject({
      sourceId: controller?.id,
      targetId: repository?.id,
    });
  });

  it('gives every new component a layout node (no silent-invisibility risk)', () => {
    const updated = attachComponentsToModel(baseModel(), 'catalog-service', ARTIFACT);
    const created = updated.elements.filter((e) => e.kind === 'component');
    const nodeIds = new Set(updated.views[0]?.layout.nodes.map((n) => n.elementId) ?? []);
    for (const c of created) expect(nodeIds.has(c.id)).toBe(true);
  });

  it('rejects when the artifact repository name does not match --container (FR-012a)', () => {
    const mismatched: ComponentAnalysis = {
      ...ARTIFACT,
      repository: { name: 'order-service', path: 'repos/order-service' },
    };
    expect(() => attachComponentsToModel(baseModel(), 'catalog-service', mismatched)).toThrow(
      /does not match|mismatch/i
    );
  });

  it('does not modify any other element or relationship in the model', () => {
    const model = baseModel();
    const updated = attachComponentsToModel(model, 'catalog-service', ARTIFACT);

    expect(updated.elements).toContainEqual(model.elements[0]);
    expect(updated.elements).toContainEqual(model.elements[1]);
    expect(updated.elements.filter((e) => e.parentId === 'container-2')).toHaveLength(0);
  });

  it('throws for a container name that does not exist', () => {
    expect(() => attachComponentsToModel(baseModel(), 'nope', ARTIFACT)).toThrow(/no container/i);
  });

  it('throws when two containers share the target name (ambiguous)', () => {
    const model = baseModel({
      elements: [
        { id: 'container-1', kind: 'container', name: 'catalog-service', description: '' },
        { id: 'container-3', kind: 'container', name: 'catalog-service', description: '' },
      ],
    });
    expect(() => attachComponentsToModel(model, 'catalog-service', ARTIFACT)).toThrow(/ambiguous/i);
  });

  it('throws when the matching element is not a container', () => {
    const model = baseModel({
      elements: [{ id: 'sys-1', kind: 'system', name: 'catalog-service', description: '' }],
    });
    expect(() => attachComponentsToModel(model, 'catalog-service', ARTIFACT)).toThrow(
      /no container/i
    );
  });
});
