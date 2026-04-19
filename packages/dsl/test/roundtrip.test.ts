import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../src/index';
import type { ArchitectureModel } from '@arch-atlas/core-model';

function elementsEquivalent(a: ArchitectureModel, b: ArchitectureModel): boolean {
  if (a.elements.length !== b.elements.length) return false;
  const aIds = new Set(a.elements.map((e) => e.id));
  const bIds = new Set(b.elements.map((e) => e.id));
  for (const id of aIds) if (!bIds.has(id)) return false;
  for (const e of a.elements) {
    const be = b.elements.find((x) => x.id === e.id);
    if (!be) return false;
    if (e.name !== be.name) return false;
    if (e.kind !== be.kind) return false;
    if ((e.parentId ?? null) !== (be.parentId ?? null)) return false;
  }
  return true;
}

function relsEquivalent(a: ArchitectureModel, b: ArchitectureModel): boolean {
  if (a.relationships.length !== b.relationships.length) return false;
  for (const r of a.relationships) {
    const br = b.relationships.find(
      (x) => x.sourceId === r.sourceId && x.targetId === r.targetId && x.type === r.type
    );
    if (!br) return false;
  }
  return true;
}

const FULL_MODEL: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Round-trip Test' },
  elements: [
    { id: 'customer', kind: 'person', name: 'Customer' },
    { id: 'web-app', kind: 'system', name: 'Web App' },
    {
      id: 'web-app.frontend',
      kind: 'container',
      name: 'Frontend',
      parentId: 'web-app',
      technology: 'React',
    },
    {
      id: 'web-app.backend',
      kind: 'container',
      name: 'Backend',
      parentId: 'web-app',
      technology: 'Node.js',
    },
    { id: 'payment', kind: 'system', name: 'Payment', isExternal: true },
  ],
  relationships: [
    { id: 'r1', sourceId: 'customer', targetId: 'web-app', type: 'uses', label: 'Browses' },
    {
      id: 'r2',
      sourceId: 'web-app.frontend',
      targetId: 'web-app.backend',
      type: 'calls',
      label: 'REST API',
    },
    { id: 'r3', sourceId: 'web-app.backend', targetId: 'payment', type: 'calls' },
  ],
  constraints: [],
  views: [],
};

describe('Round-trip (US2 acceptance scenarios)', () => {
  it('AS1: serialize→parse produces a structurally equivalent model', () => {
    const dsl = serialize(FULL_MODEL);
    const result = parse(dsl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(elementsEquivalent(FULL_MODEL, result.model)).toBe(true);
      expect(relsEquivalent(FULL_MODEL, result.model)).toBe(true);
    }
  });

  it('AS2: model with all 6 element kinds round-trips without data loss', () => {
    const m: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'All kinds' },
      elements: [
        { id: 'l', kind: 'landscape', name: 'L' },
        { id: 'p', kind: 'person', name: 'P' },
        { id: 's', kind: 'system', name: 'S' },
        { id: 's.c', kind: 'container', name: 'C', parentId: 's' },
        { id: 's.c.comp', kind: 'component', name: 'Comp', parentId: 's.c' },
        { id: 's.c.comp.code', kind: 'code', name: 'Code', parentId: 's.c.comp' },
      ],
      relationships: [],
      constraints: [],
      views: [],
    };
    const dsl = serialize(m);
    const result = parse(dsl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.elements.length).toBe(6);
      const kinds = result.model.elements.map((e) => e.kind);
      expect(kinds).toContain('landscape');
      expect(kinds).toContain('person');
      expect(kinds).toContain('system');
      expect(kinds).toContain('container');
      expect(kinds).toContain('component');
      expect(kinds).toContain('code');
    }
  });

  it('AS3: editing one relationship label changes only that relationship', () => {
    const dsl = serialize(FULL_MODEL);
    const edited = dsl.replace('label="Browses"', 'label="Accesses"');
    const result = parse(edited);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rel = result.model.relationships.find(
        (r) => r.sourceId === 'customer' && r.targetId === 'web-app'
      );
      expect(rel?.label).toBe('Accesses');
      // Other relationships unchanged
      const rel2 = result.model.relationships.find(
        (r) => r.sourceId === 'web-app.frontend' && r.targetId === 'web-app.backend'
      );
      expect(rel2?.label).toBe('REST API');
    }
  });

  it('AS4: serializer output is valid DSL (parses without errors)', () => {
    const dsl = serialize(FULL_MODEL);
    const result = parse(dsl);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Print errors to help debug
      throw new Error(result.errors.map((e) => e.message).join('\n'));
    }
  });
});
