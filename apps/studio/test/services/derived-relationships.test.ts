import { describe, it, expect } from 'vitest';
import {
  deriveViewRelationships,
  getElementPath,
  buildElementOptions,
} from '../../src/services/derived-relationships';
import type { ArchitectureModel, Element } from '@arch-atlas/core-model';

const makeModel = (overrides: Partial<ArchitectureModel> = {}): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'Test', description: '', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
  ...overrides,
});

describe('deriveViewRelationships', () => {
  it('returns direct relationships when both endpoints are visible', () => {
    const model = makeModel({
      elements: [
        { id: 'a', kind: 'system', name: 'A' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      relationships: [{ id: 'r1', sourceId: 'a', targetId: 'b', kind: 'sync' }],
    });

    const result = deriveViewRelationships(model, new Set(['a', 'b']));
    expect(result.directRelationships).toHaveLength(1);
    expect(result.directRelationships[0]!.id).toBe('r1');
    expect(result.derivedRelationships).toHaveLength(0);
    expect(result.externalElements).toHaveLength(0);
  });

  it('derives a collapsed relationship when one endpoint is a child of a visible ancestor', () => {
    // system-a contains container-a1; system-b is visible
    // relationship is container-a1 → system-b
    // visible set is {system-a, system-b}
    // should derive system-a → system-b
    const model = makeModel({
      elements: [
        { id: 'sys-a', kind: 'system', name: 'System A' },
        { id: 'ctr-a1', kind: 'container', name: 'Container A1', parentId: 'sys-a' },
        { id: 'sys-b', kind: 'system', name: 'System B' },
      ],
      relationships: [{ id: 'r1', sourceId: 'ctr-a1', targetId: 'sys-b', kind: 'sync' }],
    });

    const result = deriveViewRelationships(model, new Set(['sys-a', 'sys-b']));
    expect(result.directRelationships).toHaveLength(0);
    expect(result.derivedRelationships).toHaveLength(1);
    expect(result.derivedRelationships[0]!.sourceId).toBe('sys-a');
    expect(result.derivedRelationships[0]!.targetId).toBe('sys-b');
  });

  it('identifies external elements when a relationship crosses system boundaries', () => {
    // visible set: {sys-a}; sys-b is NOT visible but connected
    const model = makeModel({
      elements: [
        { id: 'sys-a', kind: 'system', name: 'System A' },
        { id: 'sys-b', kind: 'system', name: 'System B' },
      ],
      relationships: [{ id: 'r1', sourceId: 'sys-a', targetId: 'sys-b', kind: 'sync' }],
    });

    const result = deriveViewRelationships(model, new Set(['sys-a']));
    expect(result.externalElements).toHaveLength(1);
    expect(result.externalElements[0]!.id).toBe('sys-b');
  });

  it('deduplicates derived relationships (multiple component-level rels collapse to one)', () => {
    const model = makeModel({
      elements: [
        { id: 'sys-a', kind: 'system', name: 'A' },
        { id: 'ctr-1', kind: 'container', name: 'C1', parentId: 'sys-a' },
        { id: 'ctr-2', kind: 'container', name: 'C2', parentId: 'sys-a' },
        { id: 'sys-b', kind: 'system', name: 'B' },
      ],
      relationships: [
        { id: 'r1', sourceId: 'ctr-1', targetId: 'sys-b', kind: 'sync' },
        { id: 'r2', sourceId: 'ctr-2', targetId: 'sys-b', kind: 'sync' },
      ],
    });

    const result = deriveViewRelationships(model, new Set(['sys-a', 'sys-b']));
    // Both collapse to sys-a → sys-b, should deduplicate
    expect(result.derivedRelationships).toHaveLength(1);
  });

  it('ignores relationships where neither endpoint is in the view', () => {
    const model = makeModel({
      elements: [
        { id: 'sys-a', kind: 'system', name: 'A' },
        { id: 'sys-b', kind: 'system', name: 'B' },
        { id: 'sys-c', kind: 'system', name: 'C' },
      ],
      relationships: [{ id: 'r1', sourceId: 'sys-b', targetId: 'sys-c', kind: 'sync' }],
    });

    const result = deriveViewRelationships(model, new Set(['sys-a']));
    expect(result.directRelationships).toHaveLength(0);
    expect(result.derivedRelationships).toHaveLength(0);
    expect(result.externalElements).toHaveLength(0);
  });
});

describe('getElementPath', () => {
  it('returns just the element name when it has no parent', () => {
    const map = new Map<string, Element>([
      ['sys-1', { id: 'sys-1', kind: 'system', name: 'System A' }],
    ]);
    expect(getElementPath('sys-1', map)).toBe('System A');
  });

  it('builds a breadcrumb path through the hierarchy', () => {
    const map = new Map<string, Element>([
      ['sys-1', { id: 'sys-1', kind: 'system', name: 'System A' }],
      ['ctr-1', { id: 'ctr-1', kind: 'container', name: 'API', parentId: 'sys-1' }],
      ['cmp-1', { id: 'cmp-1', kind: 'component', name: 'Auth Service', parentId: 'ctr-1' }],
    ]);
    expect(getElementPath('cmp-1', map)).toBe('System A > API > Auth Service');
  });

  it('returns empty string for unknown element', () => {
    const map = new Map<string, Element>();
    expect(getElementPath('nonexistent', map)).toBe('');
  });
});

describe('buildElementOptions', () => {
  it('includes systems, persons, containers, and components', () => {
    const model = makeModel({
      elements: [
        { id: 'sys-1', kind: 'system', name: 'System A' },
        { id: 'p-1', kind: 'person', name: 'Alice' },
        { id: 'ctr-1', kind: 'container', name: 'API', parentId: 'sys-1' },
        { id: 'cmp-1', kind: 'component', name: 'Service', parentId: 'ctr-1' },
      ],
    });

    const options = buildElementOptions(model);
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.value)).toContain('sys-1');
    expect(options.map((o) => o.value)).toContain('p-1');
    expect(options.map((o) => o.value)).toContain('ctr-1');
    expect(options.map((o) => o.value)).toContain('cmp-1');
  });

  it('excludes landscape and code elements', () => {
    const model = makeModel({
      elements: [
        { id: 'land-1', kind: 'landscape', name: 'Root' },
        { id: 'code-1', kind: 'code', name: 'Class Foo' },
      ],
    });

    const options = buildElementOptions(model);
    expect(options).toHaveLength(0);
  });

  it('adds sublabel with parent path for nested elements', () => {
    const model = makeModel({
      elements: [
        { id: 'sys-1', kind: 'system', name: 'System A' },
        { id: 'ctr-1', kind: 'container', name: 'API', parentId: 'sys-1' },
      ],
    });

    const options = buildElementOptions(model);
    const containerOption = options.find((o) => o.value === 'ctr-1');
    expect(containerOption?.sublabel).toBe('System A');
  });
});
