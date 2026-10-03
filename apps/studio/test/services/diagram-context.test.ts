import { describe, it, expect } from 'vitest';
import type { ArchitectureModel } from '@archatlas/core-model';
import {
  getDiagramTitle,
  getElementKindForLevel,
  canDrillDown,
  canDrillUp,
  getParentLevel,
  getChildLevel,
  getLevelIcon,
  getVisibleElements,
  buildBreadcrumbs,
  getBoundaryLabel,
} from '../../src/services/diagram-context';

function modelWithHierarchy(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title: 'Test', createdAt: '', updatedAt: '' },
    elements: [
      { id: 'land-1', name: 'Landscape', kind: 'landscape', description: '' },
      { id: 'sys-1', name: 'Checkout', kind: 'system', description: '', parentId: 'land-1' },
      { id: 'sys-2', name: 'Payments', kind: 'person', description: '', parentId: 'land-1' },
      { id: 'cont-1', name: 'API', kind: 'container', description: '', parentId: 'sys-1' },
      { id: 'comp-1', name: 'Handler', kind: 'component', description: '', parentId: 'cont-1' },
    ],
    relationships: [],
    constraints: [],
    views: [],
  };
}

describe('getDiagramTitle', () => {
  it('returns base title when no element name provided', () => {
    expect(getDiagramTitle('landscape')).toBe('System Landscape');
    expect(getDiagramTitle('system')).toBe('System Context');
    expect(getDiagramTitle('container')).toBe('Container Diagram');
    expect(getDiagramTitle('component')).toBe('Component Diagram');
    expect(getDiagramTitle('code')).toBe('Code Diagram');
  });

  it('appends element name when provided', () => {
    expect(getDiagramTitle('system', 'Payment Service')).toBe('System Context: Payment Service');
    expect(getDiagramTitle('container', 'API')).toBe('Container Diagram: API');
  });
});

describe('getElementKindForLevel', () => {
  it('maps each level to the correct addable element kind', () => {
    expect(getElementKindForLevel('landscape')).toBe('system');
    expect(getElementKindForLevel('system')).toBe('container');
    expect(getElementKindForLevel('container')).toBe('component');
    expect(getElementKindForLevel('component')).toBe('code');
    expect(getElementKindForLevel('code')).toBe('code');
  });
});

describe('canDrillDown / canDrillUp', () => {
  it('canDrillDown returns false only at code level', () => {
    expect(canDrillDown('landscape')).toBe(true);
    expect(canDrillDown('system')).toBe(true);
    expect(canDrillDown('container')).toBe(true);
    expect(canDrillDown('component')).toBe(true);
    expect(canDrillDown('code')).toBe(false);
  });

  it('canDrillUp returns false only at landscape level', () => {
    expect(canDrillUp('landscape')).toBe(false);
    expect(canDrillUp('system')).toBe(true);
    expect(canDrillUp('container')).toBe(true);
    expect(canDrillUp('component')).toBe(true);
    expect(canDrillUp('code')).toBe(true);
  });
});

describe('getParentLevel', () => {
  it('returns the level above', () => {
    expect(getParentLevel('system')).toBe('landscape');
    expect(getParentLevel('container')).toBe('system');
    expect(getParentLevel('component')).toBe('container');
    expect(getParentLevel('code')).toBe('component');
  });

  it('returns null at the top level', () => {
    expect(getParentLevel('landscape')).toBeNull();
  });
});

describe('getChildLevel', () => {
  it('returns the level below', () => {
    expect(getChildLevel('landscape')).toBe('system');
    expect(getChildLevel('system')).toBe('container');
    expect(getChildLevel('container')).toBe('component');
    expect(getChildLevel('component')).toBe('code');
  });

  it('returns null at the bottom level', () => {
    expect(getChildLevel('code')).toBeNull();
  });
});

describe('getLevelIcon', () => {
  it('returns a non-empty string for every level', () => {
    const levels = ['landscape', 'system', 'container', 'component', 'code'] as const;
    for (const level of levels) {
      expect(getLevelIcon(level).length).toBeGreaterThan(0);
    }
  });
});

describe('getVisibleElements', () => {
  it('returns an empty array when there is no model', () => {
    expect(getVisibleElements(null, 'landscape', null)).toEqual([]);
  });

  it('returns direct children of the focused element, regardless of level', () => {
    const model = modelWithHierarchy();
    const visible = getVisibleElements(model, 'container', 'sys-1');
    expect(visible.map((e) => e.id)).toEqual(['cont-1']);
  });

  it('at landscape with nothing focused, returns top-level systems and people', () => {
    const model = modelWithHierarchy();
    const visible = getVisibleElements(model, 'landscape', null);
    expect(visible.map((e) => e.id).sort()).toEqual(['sys-1', 'sys-2']);
  });

  it('at a non-landscape level with nothing focused, returns parent-less elements of the target kind', () => {
    const model = modelWithHierarchy();
    expect(getVisibleElements(model, 'system', null).map((e) => e.id)).toEqual([]);
  });
});

describe('buildBreadcrumbs', () => {
  it('returns just the landscape crumb at the landscape level', () => {
    expect(buildBreadcrumbs(modelWithHierarchy(), 'landscape', null)).toEqual([
      { label: 'System Landscape', level: 'landscape', focusId: null },
    ]);
  });

  it('returns just the landscape crumb when nothing is focused or there is no model', () => {
    expect(buildBreadcrumbs(modelWithHierarchy(), 'system', null)).toHaveLength(1);
    expect(buildBreadcrumbs(null, 'system', 'sys-1')).toHaveLength(1);
  });

  it('walks up the parent chain to build the full breadcrumb trail', () => {
    const crumbs = buildBreadcrumbs(modelWithHierarchy(), 'component', 'comp-1');
    expect(crumbs).toEqual([
      { label: 'System Landscape', level: 'landscape', focusId: null },
      { label: 'Checkout', level: 'system', focusId: 'sys-1' },
      { label: 'API', level: 'container', focusId: 'cont-1' },
      { label: 'Handler', level: 'component', focusId: 'comp-1' },
    ]);
  });
});

describe('getBoundaryLabel', () => {
  it('returns undefined when there is no focused element', () => {
    expect(getBoundaryLabel(null)).toBeUndefined();
    expect(getBoundaryLabel(undefined)).toBeUndefined();
  });

  it('labels system, container, and landscape kinds by name', () => {
    expect(getBoundaryLabel({ id: 's', name: 'Checkout', kind: 'system', description: '' })).toBe(
      'System Boundary: Checkout'
    );
    expect(getBoundaryLabel({ id: 'c', name: 'API', kind: 'container', description: '' })).toBe(
      'Container Boundary: API'
    );
    expect(getBoundaryLabel({ id: 'l', name: 'Root', kind: 'landscape', description: '' })).toBe(
      'Landscape Boundary: Root'
    );
  });

  it('capitalizes other kinds generically', () => {
    expect(getBoundaryLabel({ id: 'c', name: 'Handler', kind: 'component', description: '' })).toBe(
      'Component Boundary: Handler'
    );
  });
});
