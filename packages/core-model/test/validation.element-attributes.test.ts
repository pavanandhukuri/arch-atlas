import { describe, it, expect } from 'vitest';
import { validateModel } from '../src/validate';
import type { ArchitectureModel, Element } from '../src/types';

const baseModel = (): ArchitectureModel => ({
  schemaVersion: '1.0.0',
  metadata: { title: 'Test' },
  elements: [
    { id: 'landscape-1', kind: 'landscape', name: 'Landscape' },
    { id: 'system-1', kind: 'system', name: 'My System', parentId: 'landscape-1' },
    { id: 'container-1', kind: 'container', name: 'API', parentId: 'system-1' },
  ],
  relationships: [],
  constraints: [],
  views: [
    {
      id: 'view-1',
      level: 'landscape',
      title: 'Test View',
      layout: {
        algorithm: 'deterministic-v1',
        nodes: [
          { elementId: 'landscape-1', x: 0, y: 0 },
          { elementId: 'system-1', x: 100, y: 0 },
          { elementId: 'container-1', x: 200, y: 0 },
        ],
        edges: [],
      },
    },
  ],
});

const getElem = (model: ArchitectureModel, id: string): Element => {
  const elem = model.elements.find((e) => e.id === id);
  if (!elem) throw new Error(`Element ${id} not found`);
  return elem;
};

// ─────────────────────────────────────────────────────────────────────────────
// isExternal kind-guard
// ─────────────────────────────────────────────────────────────────────────────

describe('isExternal — kind guard', () => {
  it('accepts isExternal === true on a system element with no children', () => {
    const model = baseModel();
    model.elements.push({
      id: 'ext-1',
      kind: 'system',
      name: 'External',
      parentId: 'landscape-1',
      isExternal: true,
    });
    model.views[0]?.layout.nodes.push({ elementId: 'ext-1', x: 400, y: 0 });
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors).toHaveLength(0);
  });

  it('errors when isExternal is set on a container element', () => {
    const model = baseModel();
    Object.assign(getElem(model, 'container-1'), { isExternal: true });
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.severity).toBe('error');
    expect(errors[0]?.path).toContain('elements[2]');
  });

  it('errors when isExternal is set on a landscape element', () => {
    const model = baseModel();
    Object.assign(getElem(model, 'landscape-1'), { isExternal: true });
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// External system — no children hierarchy rule
// ─────────────────────────────────────────────────────────────────────────────

describe('isExternal — no-children hierarchy rule', () => {
  it('errors when a container is parented under an external system', () => {
    const model = baseModel();
    getElem(model, 'system-1').isExternal = true;
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.severity).toBe('error');
  });

  it('no error when external system has no children', () => {
    const model = baseModel();
    model.elements.push({
      id: 'ext-system-1',
      kind: 'system',
      name: 'Ext',
      parentId: 'landscape-1',
      isExternal: true,
    });
    model.views[0]?.layout.nodes.push({ elementId: 'ext-system-1', x: 300, y: 0 });
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// containerSubtype — kind guard
// ─────────────────────────────────────────────────────────────────────────────

describe('containerSubtype — kind guard', () => {
  it('accepts containerSubtype on a container element', () => {
    const model = baseModel();
    getElem(model, 'container-1').containerSubtype = 'database';
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors).toHaveLength(0);
  });

  it('errors when containerSubtype is set on a system element', () => {
    const model = baseModel();
    Object.assign(getElem(model, 'system-1'), { containerSubtype: 'database' });
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatting — color hex validation
// ─────────────────────────────────────────────────────────────────────────────

describe('formatting — color hex validation', () => {
  it('accepts valid 6-digit hex colors', () => {
    const model = baseModel();
    getElem(model, 'container-1').formatting = {
      backgroundColor: '#1168bd',
      borderColor: '#ffffff',
      fontColor: '#000000',
    };
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors).toHaveLength(0);
  });

  it('errors on short hex color (3-digit)', () => {
    const model = baseModel();
    getElem(model, 'container-1').formatting = { backgroundColor: '#fff' };
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors on named color string', () => {
    const model = baseModel();
    getElem(model, 'container-1').formatting = { borderColor: 'red' };
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors on invalid hex characters', () => {
    const model = baseModel();
    getElem(model, 'container-1').formatting = { fontColor: '#gggggg' };
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('warns (not errors) when formatting is set on an external system', () => {
    const model = baseModel();
    const system = getElem(model, 'system-1');
    system.isExternal = true;
    // Remove container-1 so no children-of-external error fires
    model.elements = model.elements.filter((e) => e.id !== 'container-1');
    model.views[0]?.layout.nodes.splice(
      model.views[0].layout.nodes.findIndex((n) => n.elementId === 'container-1'),
      1
    );
    system.formatting = { backgroundColor: '#ffffff' };
    const errors = validateModel(model).filter((e) => e.code === 'INVALID_ATTRIBUTE');
    const attrErrors = errors.filter((e) => e.severity === 'error');
    const attrWarnings = errors.filter((e) => e.severity === 'warning');
    expect(attrErrors).toHaveLength(0);
    expect(attrWarnings.length).toBeGreaterThan(0);
  });
});
