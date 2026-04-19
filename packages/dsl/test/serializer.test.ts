import { describe, it, expect } from 'vitest';
import { serialize } from '../src/index';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const EMPTY_MODEL: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Test' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
};

function model(overrides: Partial<ArchitectureModel>): ArchitectureModel {
  return { ...EMPTY_MODEL, ...overrides };
}

describe('serialize()', () => {
  it('always emits version "1" header first', () => {
    const dsl = serialize(model({}));
    expect(dsl.startsWith('version "1"')).toBe(true);
  });

  it('serializes a person element', () => {
    const dsl = serialize(model({ elements: [{ id: 'alice', kind: 'person', name: 'Alice' }] }));
    expect(dsl).toContain('person "Alice"');
  });

  it('serializes all 6 element kinds with correct keywords', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 'l', kind: 'landscape', name: 'L' },
      { id: 'p', kind: 'person', name: 'P' },
      { id: 's', kind: 'system', name: 'S' },
      { id: 'c', kind: 'container', name: 'C', parentId: 's' },
      { id: 'comp', kind: 'component', name: 'Comp', parentId: 'c' },
      { id: 'code', kind: 'code', name: 'Code', parentId: 'comp' },
    ];
    const dsl = serialize(model({ elements }));
    expect(dsl).toContain('landscape "L"');
    expect(dsl).toContain('person "P"');
    expect(dsl).toContain('system "S"');
    expect(dsl).toContain('container "C"');
    expect(dsl).toContain('component "Comp"');
    expect(dsl).toContain('code "Code"');
  });

  it('nests child elements inside parent blocks', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 's', kind: 'system', name: 'App' },
      { id: 's.fe', kind: 'container', name: 'Frontend', parentId: 's' },
    ];
    const dsl = serialize(model({ elements }));
    const lines = dsl.split('\n');
    const sysIdx = lines.findIndex((l) => l.includes('system "App"'));
    const feIdx = lines.findIndex((l) => l.includes('container "Frontend"'));
    expect(feIdx).toBeGreaterThan(sysIdx);
    // child is indented
    expect(lines[feIdx]?.startsWith('  ')).toBe(true);
  });

  it('emits relationships after the element tree', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 'a', kind: 'person', name: 'Alice' },
      { id: 'b', kind: 'system', name: 'App' },
    ];
    const relationships: ArchitectureModel['relationships'] = [
      { id: 'r1', sourceId: 'a', targetId: 'b', type: 'uses' },
    ];
    const dsl = serialize(model({ elements, relationships }));
    const lines = dsl.split('\n');
    const findLast = (pred: (l: string) => boolean): number =>
      lines.reduce((acc, l, i) => (pred(l) ? i : acc), -1);
    const lastEl = Math.max(
      findLast((l) => l.includes('person')),
      findLast((l) => l.includes('system'))
    );
    const relIdx = lines.findIndex((l) => l.includes('->'));
    expect(relIdx).toBeGreaterThan(lastEl);
  });

  it('serializes inline attrs [key="value"]', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 'c', kind: 'container', name: 'DB', technology: 'PostgreSQL' },
    ];
    const dsl = serialize(model({ elements }));
    expect(dsl).toContain('[technology="PostgreSQL"');
  });

  it('serializes isExternal=true as [external="true"]', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 'ext', kind: 'system', name: 'Payment', isExternal: true },
    ];
    const dsl = serialize(model({ elements }));
    expect(dsl).toContain('external="true"');
  });

  it('serializes color formatting attrs using bg/border/font keys', () => {
    const elements: ArchitectureModel['elements'] = [
      {
        id: 's',
        kind: 'system',
        name: 'App',
        formatting: { backgroundColor: '#ff0000', borderColor: '#00ff00', fontColor: '#0000ff' },
      },
    ];
    const dsl = serialize(model({ elements }));
    expect(dsl).toContain('bg="#ff0000"');
    expect(dsl).toContain('border="#00ff00"');
    expect(dsl).toContain('font="#0000ff"');
  });

  it('serializes model with no relationships without errors', () => {
    const elements: ArchitectureModel['elements'] = [{ id: 'p', kind: 'person', name: 'User' }];
    const dsl = serialize(model({ elements }));
    expect(dsl).not.toContain('->');
    expect(dsl).toContain('person "User"');
  });

  it('serializes relationship with type and label', () => {
    const elements: ArchitectureModel['elements'] = [
      { id: 'a', kind: 'person', name: 'Alice' },
      { id: 'b', kind: 'system', name: 'App' },
    ];
    const relationships: ArchitectureModel['relationships'] = [
      { id: 'r1', sourceId: 'a', targetId: 'b', type: 'uses', label: 'Browses' },
    ];
    const dsl = serialize(model({ elements, relationships }));
    expect(dsl).toContain('"Alice" -> "App"');
    expect(dsl).toContain('type="uses"');
    expect(dsl).toContain('label="Browses"');
  });
});
