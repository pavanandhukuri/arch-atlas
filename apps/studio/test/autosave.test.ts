import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutosaveManager } from '../src/services/autosave';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import minimalModel from '../../core-model/test/fixtures/minimal-model.json';

describe('Autosave to localStorage', () => {
  let autosave: AutosaveManager;
  let model: ArchitectureModel;

  beforeEach(() => {
    autosave = new AutosaveManager();
    model = minimalModel as ArchitectureModel;
    localStorage.clear();
  });

  afterEach(() => {
    autosave.stopAutosave();
    localStorage.clear();
  });

  it('should save model to localStorage', () => {
    autosave.saveToLocalStorage(model);
    const loaded = autosave.loadFromLocalStorage();
    expect(loaded).toEqual(model);
  });

  it('should save timestamp with autosave', () => {
    autosave.saveToLocalStorage(model);
    const timestamp = autosave.getAutosaveTimestamp();
    expect(timestamp).toBeTruthy();
    expect(new Date(timestamp!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should clear autosave data', () => {
    autosave.saveToLocalStorage(model);
    autosave.clearAutosave();
    expect(autosave.loadFromLocalStorage()).toBeNull();
    expect(autosave.getAutosaveTimestamp()).toBeNull();
  });
});
