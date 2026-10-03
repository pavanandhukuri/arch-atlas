import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ArchitectureModel } from '@archatlas/core-model';
import { ModelStore } from '../../src/state/model-store';
import { useExternalElementPositions } from '../../src/hooks/useExternalElementPositions';

function baseModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title: 'Test', createdAt: '', updatedAt: '' },
    elements: [
      { id: 'sys-1', name: 'A', kind: 'system', description: '' },
      { id: 'sys-2', name: 'B (external)', kind: 'system', description: '' },
    ],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'View',
        level: 'system',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [
            { elementId: 'sys-1', x: 0, y: 0 },
            { elementId: 'sys-2', x: 50, y: 50 },
          ],
          edges: [],
        },
      },
    ],
  };
}

describe('useExternalElementPositions', () => {
  it('starts with no dragged positions for the current view', () => {
    const store = new ModelStore();
    store.loadModel(baseModel());
    const { result } = renderHook(() =>
      useExternalElementPositions(store, 'diagram-1', 'system|', ['sys-2'])
    );
    expect(result.current.externalPositions).toEqual({});
  });

  it('dragging an external element records its position without touching the model', () => {
    const store = new ModelStore();
    store.loadModel(baseModel());
    const { result } = renderHook(() =>
      useExternalElementPositions(store, 'diagram-1', 'system|', ['sys-2'])
    );

    act(() => result.current.handleElementDrag('sys-2', 10, 20));

    expect(result.current.externalPositions).toEqual({ 'sys-2': { x: 10, y: 20 } });
    expect(store.getState().isDirty).toBe(false);
  });

  it('dragging a regular (non-external) element updates the model layout instead', () => {
    const store = new ModelStore();
    store.loadModel(baseModel());
    const { result } = renderHook(() =>
      useExternalElementPositions(store, 'diagram-1', 'system|', ['sys-2'])
    );

    act(() => result.current.handleElementDrag('sys-1', 99, 88));

    expect(result.current.externalPositions).toEqual({});
    const node = store
      .getState()
      .model?.views[0]?.layout.nodes.find((n) => n.elementId === 'sys-1');
    expect(node).toEqual(expect.objectContaining({ x: 99, y: 88 }));
    expect(store.getState().isDirty).toBe(true);
  });

  it('positions are scoped per view key', () => {
    const store = new ModelStore();
    store.loadModel(baseModel());
    const { result, rerender } = renderHook(
      ({ viewKey }: { viewKey: string }) =>
        useExternalElementPositions(store, 'diagram-1', viewKey, ['sys-2']),
      { initialProps: { viewKey: 'system|' } }
    );

    act(() => result.current.handleElementDrag('sys-2', 1, 1));
    expect(result.current.externalPositions).toEqual({ 'sys-2': { x: 1, y: 1 } });

    rerender({ viewKey: 'container|sys-1' });
    expect(result.current.externalPositions).toEqual({});
  });

  it('resets all dragged positions when the diagram identity changes', () => {
    const store = new ModelStore();
    store.loadModel(baseModel());
    const { result, rerender } = renderHook(
      ({ identity }: { identity: string }) =>
        useExternalElementPositions(store, identity, 'system|', ['sys-2']),
      { initialProps: { identity: 'diagram-1' } }
    );

    act(() => result.current.handleElementDrag('sys-2', 5, 5));
    expect(result.current.externalPositions).toEqual({ 'sys-2': { x: 5, y: 5 } });

    rerender({ identity: 'diagram-2' });
    expect(result.current.externalPositions).toEqual({});
  });
});
