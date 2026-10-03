import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ArchitectureModel } from '@archatlas/core-model';
import { ModelStore } from '../../src/state/model-store';
import { useDiagramEditorState } from '../../src/hooks/useDiagramEditorState';

function baseModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title: 'Test', createdAt: '', updatedAt: '' },
    elements: [
      { id: 'land-1', name: 'Landscape', kind: 'landscape', description: '' },
      { id: 'sys-1', name: 'System A', kind: 'system', description: '', parentId: 'land-1' },
      { id: 'sys-2', name: 'System B', kind: 'system', description: '', parentId: 'land-1' },
      { id: 'cont-1', name: 'Container', kind: 'container', description: '', parentId: 'sys-1' },
    ],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'View',
        level: 'landscape',
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

function setup(overrides: { currentLevel?: string; focusedElementId?: string | null } = {}) {
  const store = new ModelStore();
  store.loadModel(baseModel());
  const navigateToLevel = vi.fn();
  const { result, rerender } = renderHook(
    (props: { model: ArchitectureModel | null; focusedElementId: string | null }) =>
      useDiagramEditorState({
        model: props.model,
        modelStore: store,
        focusedElementId: props.focusedElementId,
        currentLevel: (overrides.currentLevel as never) ?? 'landscape',
        navigateToLevel,
      }),
    {
      initialProps: {
        model: store.getState().model,
        focusedElementId: overrides.focusedElementId ?? null,
      },
    }
  );
  return { store, navigateToLevel, result, rerender };
}

describe('useDiagramEditorState', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handleElementClick opens the element editor', () => {
    const { result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    expect(result.current.editingElement?.id).toBe('sys-1');
  });

  it('handleElementClick while connecting creates a relationship and selects the target', () => {
    const { store, result } = setup();
    act(() => result.current.handleConnectionStart('sys-1'));
    act(() => result.current.handleElementClick('sys-2'));

    expect(store.getState().model?.relationships).toHaveLength(1);
    expect(store.getState().model?.relationships[0]).toMatchObject({
      sourceId: 'sys-1',
      targetId: 'sys-2',
    });
    expect(result.current.connectionStartId).toBeNull();
    expect(result.current.editingElement?.id).toBe('sys-2');
  });

  it('handleElementClick while connecting to the same element cancels without creating a relationship', () => {
    const { store, result } = setup();
    act(() => result.current.handleConnectionStart('sys-1'));
    act(() => result.current.handleElementClick('sys-1'));

    expect(store.getState().model?.relationships).toHaveLength(0);
    expect(result.current.connectionStartId).toBeNull();
  });

  it('handleElementDoubleClick drills down a level when the level allows it', () => {
    const { navigateToLevel, result } = setup({ currentLevel: 'landscape' });
    act(() => result.current.handleElementDoubleClick('sys-1'));
    expect(navigateToLevel).toHaveBeenCalledWith('system', 'sys-1');
  });

  it('handleElementDoubleClick does nothing for an org-external element', () => {
    const store = new ModelStore();
    const model = baseModel();
    model.elements[1]!.isExternal = true;
    store.loadModel(model);
    const navigateToLevel = vi.fn();
    const { result } = renderHook(() =>
      useDiagramEditorState({
        model: store.getState().model,
        modelStore: store,
        focusedElementId: null,
        currentLevel: 'landscape' as never,
        navigateToLevel,
      })
    );

    act(() => result.current.handleElementDoubleClick('sys-1'));
    expect(navigateToLevel).not.toHaveBeenCalled();
  });

  it('handleElementDoubleClick on a scope-external sibling navigates to its system context', () => {
    const { navigateToLevel, result } = setup({
      currentLevel: 'container',
      focusedElementId: 'sys-1',
    });
    // sys-2 is a system, but its parent (land-1) isn't the focused element (sys-1) -> scope-external
    act(() => result.current.handleElementDoubleClick('sys-2'));
    expect(navigateToLevel).toHaveBeenCalledWith('system', 'sys-2');
  });

  it('handleAddElement adds a new element and opens its editor', () => {
    const { store, result } = setup();
    act(() => result.current.handleAddElement('container'));
    expect(result.current.editingElement?.kind).toBe('container');
    expect(
      store.getState().model?.elements.some((e) => e.id === result.current.editingElement?.id)
    ).toBe(true);
  });

  it('handleAddContainerSubtype adds a labeled container parented to the focused element', () => {
    const { result } = setup({ focusedElementId: 'sys-1' });
    act(() => result.current.handleAddContainerSubtype('database'));
    expect(result.current.editingElement?.name).toBe('Database');
    expect(result.current.editingElement?.parentId).toBe('sys-1');
  });

  it('handleSaveElement persists edits and closes the editor', () => {
    const { store, result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() =>
      result.current.handleSaveElement({
        id: 'sys-1',
        name: 'Renamed',
        kind: 'system',
        description: '',
      })
    );
    expect(store.getState().model?.elements.find((e) => e.id === 'sys-1')?.name).toBe('Renamed');
    expect(result.current.editingElement).toBeNull();
  });

  it('handleDeleteElement removes the element and its descendants', () => {
    const { store, result } = setup();
    act(() => result.current.handleDeleteElement('sys-1'));
    expect(store.getState().model?.elements.map((e) => e.id)).not.toContain('sys-1');
    expect(store.getState().model?.elements.map((e) => e.id)).not.toContain('cont-1');
    expect(result.current.editingElement).toBeNull();
  });

  it('handleMarkExternal with descendants asks for confirmation before deleting them', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { store, result } = setup();

    act(() => result.current.handleMarkExternal('sys-1', true));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(store.getState().model?.elements.find((e) => e.id === 'sys-1')?.isExternal).toBe(true);
    expect(store.getState().model?.elements.map((e) => e.id)).not.toContain('cont-1');
  });

  it('handleMarkExternal aborts when the user declines the confirmation', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const { store, result } = setup();

    act(() => result.current.handleMarkExternal('sys-1', true));

    expect(
      store.getState().model?.elements.find((e) => e.id === 'sys-1')?.isExternal
    ).toBeUndefined();
  });

  it('handleMarkExternal un-marking never prompts for confirmation', () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { store, result } = setup();

    act(() => result.current.handleMarkExternal('sys-2', false));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(store.getState().model?.elements.find((e) => e.id === 'sys-2')?.isExternal).toBe(false);
  });

  it('handleConnectionStart / handleRelationshipClick close any open editor and set selection', () => {
    const { result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleConnectionStart('sys-2'));
    expect(result.current.editingElement).toBeNull();
    expect(result.current.connectionStartId).toBe('sys-2');

    act(() => result.current.handleRelationshipClick('rel-1'));
    expect(result.current.selectedRelationshipId).toBe('rel-1');
    expect(result.current.connectionStartId).toBeNull();
  });

  it('handleAddRelationshipFromElement opens a pending relationship and remembers the originating element', () => {
    const { result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleAddRelationshipFromElement('sys-1'));

    expect(result.current.editingElement).toBeNull();
    expect(result.current.pendingNewRelationship).toMatchObject({
      sourceId: 'sys-1',
      targetId: '',
    });
  });

  it('handleSaveRelationship on a pending relationship saves it and returns to the originating element editor', () => {
    const { store, result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleAddRelationshipFromElement('sys-1'));
    act(() =>
      result.current.handleSaveRelationship({
        id: result.current.pendingNewRelationship!.id,
        sourceId: 'sys-1',
        targetId: 'sys-2',
        type: 'relates_to',
      })
    );

    expect(store.getState().model?.relationships).toHaveLength(1);
    expect(result.current.pendingNewRelationship).toBeNull();
    expect(result.current.editingElement?.id).toBe('sys-1');
  });

  it('handleDeleteRelationship removes a real relationship and returns to the originating element', () => {
    const { store, result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleAddRelationshipFromElement('sys-1'));
    const relId = result.current.pendingNewRelationship!.id;
    act(() =>
      result.current.handleSaveRelationship({
        id: relId,
        sourceId: 'sys-1',
        targetId: 'sys-2',
        type: 'relates_to',
      })
    );

    act(() =>
      result.current.handleEditRelationshipFromElement(store.getState().model!.relationships[0]!)
    );
    act(() => result.current.handleDeleteRelationship());

    expect(store.getState().model?.relationships).toHaveLength(0);
    expect(result.current.selectedRelationshipId).toBeNull();
  });

  it('handleDeleteRelationship on a derived relationship just closes the editor (no model entry)', () => {
    const { store, result } = setup();
    act(() => result.current.handleRelationshipClick('derived-sys-1-sys-2'));
    act(() => result.current.handleDeleteRelationship());
    expect(result.current.selectedRelationshipId).toBeNull();
    expect(store.getState().model?.relationships).toHaveLength(0);
  });

  it('handleCancelRelationshipEdit clears selection and returns to the originating element', () => {
    const { result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleAddRelationshipFromElement('sys-1'));
    act(() => result.current.handleCancelRelationshipEdit());

    expect(result.current.pendingNewRelationship).toBeNull();
    expect(result.current.editingElement?.id).toBe('sys-1');
  });

  it('closeEditors clears every panel at once', () => {
    const { result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.closeEditors());
    expect(result.current.editingElement).toBeNull();
    expect(result.current.selectedRelationshipId).toBeNull();
    expect(result.current.pendingNewRelationship).toBeNull();
  });

  it('handleFormatChange updates the element formatting and keeps the editor in sync', () => {
    const { store, result } = setup();
    act(() => result.current.handleElementClick('sys-1'));
    act(() => result.current.handleFormatChange('sys-1', { backgroundColor: '#ff0000' }));

    expect(store.getState().model?.elements.find((e) => e.id === 'sys-1')?.formatting).toEqual({
      backgroundColor: '#ff0000',
    });
    expect(result.current.editingElement?.formatting).toEqual({ backgroundColor: '#ff0000' });
  });
});
