import { describe, it, expect } from 'vitest';
import {
  getDiagramTitle,
  getElementKindForLevel,
  canDrillDown,
  canDrillUp,
  getParentLevel,
  getChildLevel,
  getLevelIcon,
} from '../../src/services/diagram-context';

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
