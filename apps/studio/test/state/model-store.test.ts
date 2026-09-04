import { describe, it, expect, vi } from 'vitest';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import { ModelStore } from '../../src/state/model-store';

function createBaseModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: {
      title: 'Test Model',
      description: 'ModelStore test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: [
      { id: 'land-1', name: 'Landscape', kind: 'landscape', description: '' },
      { id: 'sys-1', name: 'System A', kind: 'system', description: '', parentId: 'land-1' },
    ],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'System Context',
        level: 'system',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [{ elementId: 'sys-1', x: 0, y: 0, w: 120, h: 80 }],
          edges: [],
        },
      },
    ],
  };
}

function createInvalidModel(): ArchitectureModel {
  const model = createBaseModel();
  // References an element that doesn't exist — validateReferences should flag this.
  model.relationships.push({
    id: 'rel-1',
    sourceId: 'sys-1',
    targetId: 'does-not-exist',
    type: 'depends_on',
  });
  return model;
}

describe('ModelStore', () => {
  it('starts with no model, no errors, and not dirty', () => {
    const store = new ModelStore();
    expect(store.getState()).toEqual({ model: null, errors: [], isDirty: false });
  });

  it('loadModel sets the model, validates it, and clears dirty', () => {
    const store = new ModelStore();
    const model = createBaseModel();
    store.loadModel(model);
    const state = store.getState();
    expect(state.model).toEqual(model);
    expect(state.errors).toEqual([]);
    expect(state.isDirty).toBe(false);
  });

  it('loadModel surfaces validation errors for an invalid model', () => {
    const store = new ModelStore();
    store.loadModel(createInvalidModel());
    expect(store.getState().errors.length).toBeGreaterThan(0);
  });

  it('updateModel marks the store dirty and re-validates', () => {
    const store = new ModelStore();
    store.loadModel(createBaseModel());
    const updated = createBaseModel();
    updated.metadata.title = 'Renamed';
    store.updateModel(updated);
    const state = store.getState();
    expect(state.model?.metadata.title).toBe('Renamed');
    expect(state.isDirty).toBe(true);
  });

  it('clearDirty resets isDirty without touching model or errors', () => {
    const store = new ModelStore();
    const model = createBaseModel();
    store.loadModel(model);
    store.updateModel(model);
    expect(store.getState().isDirty).toBe(true);
    store.clearDirty();
    const state = store.getState();
    expect(state.isDirty).toBe(false);
    expect(state.model).toEqual(model);
  });

  it('getState returns a snapshot, not a live reference', () => {
    const store = new ModelStore();
    const first = store.getState();
    store.loadModel(createBaseModel());
    expect(first).toEqual({ model: null, errors: [], isDirty: false });
  });

  it('notifies subscribers on loadModel, updateModel, and clearDirty', () => {
    const store = new ModelStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.loadModel(createBaseModel());
    expect(listener).toHaveBeenCalledTimes(1);

    store.updateModel(createBaseModel());
    expect(listener).toHaveBeenCalledTimes(2);

    store.clearDirty();
    expect(listener).toHaveBeenCalledTimes(3);

    expect(listener).toHaveBeenLastCalledWith(store.getState());
  });

  it('unsubscribe stops future notifications', () => {
    const store = new ModelStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.loadModel(createBaseModel());
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.updateModel(createBaseModel());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent subscribers', () => {
    const store = new ModelStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    const unsubscribeB = store.subscribe(b);

    store.loadModel(createBaseModel());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubscribeB();
    store.updateModel(createBaseModel());
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
