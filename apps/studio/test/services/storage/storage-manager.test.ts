import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '../../../src/services/storage/storage-manager';
import type { StorageHandle, StorageProvider, SaveResult, StorageError, LoadResult } from '../../../src/services/storage/storage-provider';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const makeModel = (): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'Test', description: '', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
});

const makeHandle = (): StorageHandle => ({
  type: 'local',
  fileName: 'test.arch.json',
  ref: {} as unknown,
  lastKnownModified: null,
});

const makeSaveResult = (): SaveResult => ({ success: true, newModified: Date.now() });

const makeProvider = (overrides: Partial<StorageProvider> = {}): StorageProvider => ({
  type: 'local',
  openFile: vi.fn().mockResolvedValue({ handle: makeHandle(), result: { success: true, model: makeModel(), modified: 0 } as LoadResult }),
  createFile: vi.fn().mockResolvedValue(makeHandle()),
  save: vi.fn().mockResolvedValue(makeSaveResult()),
  load: vi.fn().mockResolvedValue({ success: true, model: makeModel(), modified: 0 } as LoadResult),
  isAvailable: vi.fn().mockResolvedValue(true),
  ...overrides,
});

describe('StorageManager', () => {
  let manager: StorageManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new StorageManager();
  });

  afterEach(() => {
    manager.stopAutosave();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('startAutosave / stopAutosave', () => {
    it('starts the autosave timer', async () => {
      const provider = makeProvider();
      const handle = makeHandle();
      const getModel = vi.fn().mockReturnValue(makeModel());

      manager.startAutosave(handle, provider, getModel, vi.fn().mockReturnValue(true));
      await vi.advanceTimersByTimeAsync(2000);

      expect(provider.save).toHaveBeenCalledTimes(1);
    });

    it('does not call save when isDirty returns false', async () => {
      const provider = makeProvider();
      const handle = makeHandle();
      const getModel = vi.fn().mockReturnValue(makeModel());

      manager.startAutosave(handle, provider, getModel, vi.fn().mockReturnValue(false));
      await vi.advanceTimersByTimeAsync(2000);

      expect(provider.save).not.toHaveBeenCalled();
    });

    it('stops the autosave timer', async () => {
      const provider = makeProvider();
      const handle = makeHandle();
      const getModel = vi.fn().mockReturnValue(makeModel());

      manager.startAutosave(handle, provider, getModel, vi.fn().mockReturnValue(true));
      manager.stopAutosave();
      await vi.advanceTimersByTimeAsync(4000);

      expect(provider.save).not.toHaveBeenCalled();
    });

    it('replaces previous autosave session when called again', async () => {
      const provider1 = makeProvider();
      const provider2 = makeProvider();
      const handle = makeHandle();
      const getModel = vi.fn().mockReturnValue(makeModel());
      const isDirty = vi.fn().mockReturnValue(true);

      manager.startAutosave(handle, provider1, getModel, isDirty);
      manager.startAutosave(handle, provider2, getModel, isDirty);
      await vi.advanceTimersByTimeAsync(2000);

      expect(provider1.save).not.toHaveBeenCalled();
      expect(provider2.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('events', () => {
    it('emits save-success event after successful save', async () => {
      const provider = makeProvider();
      const handle = makeHandle();
      const listener = vi.fn();
      manager.on('save-success', listener);

      manager.startAutosave(handle, provider, vi.fn().mockReturnValue(makeModel()), vi.fn().mockReturnValue(true));
      await vi.advanceTimersByTimeAsync(2000);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits save-error event when save fails', async () => {
      const error: StorageError = { success: false, code: 'UNKNOWN', message: 'Oops' };
      const provider = makeProvider({ save: vi.fn().mockResolvedValue(error) });
      const handle = makeHandle();
      const listener = vi.fn();
      manager.on('save-error', listener);

      manager.startAutosave(handle, provider, vi.fn().mockReturnValue(makeModel()), vi.fn().mockReturnValue(true));
      await vi.advanceTimersByTimeAsync(2000);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-error' }));
    });

    it('emits conflict event when provider returns CONFLICT error', async () => {
      const conflict: StorageError = {
        success: false,
        code: 'CONFLICT',
        message: 'Conflict',
        conflict: { remoteModified: '2026-01-01', clientLastKnown: null },
      };
      const provider = makeProvider({ save: vi.fn().mockResolvedValue(conflict) });
      const handle = makeHandle();
      const listener = vi.fn();
      manager.on('conflict', listener);

      manager.startAutosave(handle, provider, vi.fn().mockReturnValue(makeModel()), vi.fn().mockReturnValue(true));
      await vi.advanceTimersByTimeAsync(2000);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'conflict' }));
    });
  });

  // T042 — open-then-autosave integration
  describe('open-then-autosave flow (US3)', () => {
    it('autosave tick writes to the opened handle (not a new file handle)', async () => {
      // Simulate: user opens an existing file, we bind its handle to autosave
      const openedHandle: StorageHandle = {
        type: 'local',
        fileName: 'opened-diagram.arch.json',
        ref: { id: 'opened-file-ref' } as unknown,
        lastKnownModified: 1000,
      };
      const provider = makeProvider();
      const model = makeModel();
      const getModel = vi.fn().mockReturnValue(model);
      const isDirty = vi.fn().mockReturnValue(true);

      // Wire autosave to the opened handle (simulating handleStorageSelected in studio-page)
      manager.startAutosave(openedHandle, provider, getModel, isDirty);
      await vi.advanceTimersByTimeAsync(2000);

      // save() should be called with the opened handle, not a newly created one
      expect(provider.save).toHaveBeenCalledWith(openedHandle, model, { force: true });
      expect(provider.save).toHaveBeenCalledTimes(1);
    });

    it('subsequent autosave ticks use the updated handle.lastKnownModified after each save', async () => {
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: {} as unknown,
        lastKnownModified: 1000,
      };
      const newModified = 2000;
      const provider = makeProvider({
        save: vi.fn().mockResolvedValue({ success: true, newModified } as SaveResult),
      });
      const getModel = vi.fn().mockReturnValue(makeModel());
      const isDirty = vi.fn().mockReturnValue(true);

      manager.startAutosave(handle, provider, getModel, isDirty);
      await vi.advanceTimersByTimeAsync(2000);

      // StorageManager updates handle.lastKnownModified after success
      expect(handle.lastKnownModified).toBe(newModified);
    });
  });

  describe('manualSave', () => {
    it('calls provider.save immediately and returns result', async () => {
      const provider = makeProvider();
      const handle = makeHandle();
      const model = makeModel();

      const result = await manager.manualSave(handle, provider, model);

      expect(provider.save).toHaveBeenCalledWith(handle, model, undefined);
      expect(result).toMatchObject({ success: true });
    });
  });
});
