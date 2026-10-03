import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ArchitectureModel } from '@archatlas/core-model';
import type { GoogleDriveAuthState } from '../../src/hooks/useGoogleDriveAuth';
import type {
  StorageHandle,
  LoadResult,
  StorageError,
} from '../../src/services/storage/storage-provider';

vi.mock('../../src/services/storage/local-file-provider', () => ({
  LocalFileProvider: vi.fn(),
}));
vi.mock('../../src/services/storage/google-drive-provider', () => ({
  GoogleDriveProvider: vi.fn(),
}));

import { useStudioDocument } from '../../src/hooks/useStudioDocument';
import { LocalFileProvider } from '../../src/services/storage/local-file-provider';
import { GoogleDriveProvider } from '../../src/services/storage/google-drive-provider';

function makeModel(title = 'Imported Model'): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: { title, description: '', createdAt: '', updatedAt: '' },
    elements: [],
    relationships: [],
    constraints: [],
    views: [],
  };
}

function makeHandle(overrides: Partial<StorageHandle> = {}): StorageHandle {
  return {
    type: 'local',
    fileName: 'diagram.arch.json',
    ref: {},
    lastKnownModified: null,
    ...overrides,
  };
}

function mockLocalProvider(overrides: Record<string, unknown> = {}) {
  const provider = {
    type: 'local',
    save: vi.fn().mockResolvedValue({ success: true, newModified: 123 }),
    load: vi.fn().mockResolvedValue({ success: true, model: makeModel('Reloaded'), modified: 456 }),
    openFile: vi.fn(),
    createFile: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  (LocalFileProvider as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => provider);
  return provider;
}

const driveAuth: GoogleDriveAuthState = {
  accessToken: null,
  isAuthenticated: false,
  authorize: vi.fn(),
  revoke: vi.fn(),
  isLoading: false,
  authError: null,
};

describe('useStudioDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockLocalProvider();
    (GoogleDriveProvider as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      save: vi.fn(),
      load: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prompts "startup" on a fresh load with no pending import', () => {
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));
    expect(result.current.showStoragePrompt).toBe('startup');
    expect(result.current.model).toBeNull();
  });

  it('loads a pending import from sessionStorage and skips straight to the "new" prompt', () => {
    const pending = makeModel('From Import Wizard');
    sessionStorage.setItem('import_model', JSON.stringify(pending));

    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    expect(result.current.model?.metadata.title).toBe('From Import Wizard');
    expect(result.current.showStoragePrompt).toBe('new');
    expect(sessionStorage.getItem('import_model')).toBeNull();
  });

  it('ignores a malformed pending import and falls back to the startup prompt', () => {
    sessionStorage.setItem('import_model', '{not json');

    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    expect(result.current.model).toBeNull();
    expect(result.current.showStoragePrompt).toBe('startup');
  });

  it('handleNewFile creates an empty model and shows the "new" storage prompt', () => {
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleNewFile());

    expect(result.current.model?.metadata.title).toBe('New Architecture');
    expect(result.current.model?.elements).toEqual([]);
    expect(result.current.showStoragePrompt).toBe('new');
  });

  it('handleStorageSelected with a loadResult loads its model and notifies onFileOpened', () => {
    const onFileOpened = vi.fn();
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened }));
    const loaded = makeModel('Opened File');

    act(() =>
      result.current.handleStorageSelected(makeHandle(), {
        success: true,
        model: loaded,
        modified: 1,
      } as LoadResult)
    );

    expect(result.current.model?.metadata.title).toBe('Opened File');
    expect(result.current.handle?.fileName).toBe('diagram.arch.json');
    expect(onFileOpened).toHaveBeenCalledOnce();
    expect(result.current.showStoragePrompt).toBeNull();
  });

  it('handleStorageSelected without a loadResult and no existing model creates a fresh one (startup "new" flow)', () => {
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleStorageSelected(makeHandle()));

    expect(result.current.model?.metadata.title).toBe('New Architecture');
    expect(result.current.handle).not.toBeNull();
  });

  it('handleManualSave writes through the provider and surfaces "saved" status', async () => {
    const provider = mockLocalProvider();
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleStorageSelected(makeHandle()));
    await act(() => result.current.handleManualSave());

    expect(provider.save).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
  });

  it('handleManualSave surfaces an error status when the provider reports failure', async () => {
    const error: StorageError = { success: false, code: 'DISK_FULL', message: 'No space left' };
    mockLocalProvider({ save: vi.fn().mockResolvedValue(error) });
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleStorageSelected(makeHandle()));
    await act(() => result.current.handleManualSave());

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.saveStatusMessage).toBe('No space left');
  });

  it('a CONFLICT save surfaces conflictInfo, and handleKeepMine force-saves to clear it', async () => {
    const conflict: StorageError = {
      success: false,
      code: 'CONFLICT',
      message: 'Conflict',
      conflict: { remoteModified: '2026-01-01T00:00:00.000Z', clientLastKnown: null },
    };
    const provider = mockLocalProvider({ save: vi.fn().mockResolvedValue(conflict) });
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleStorageSelected(makeHandle()));
    await act(() => result.current.handleManualSave());

    expect(result.current.conflictInfo).toEqual({
      remoteModified: '2026-01-01T00:00:00.000Z',
      clientLastKnown: null,
    });

    provider.save.mockResolvedValue({ success: true, newModified: 999 });
    await act(() => result.current.handleKeepMine());

    expect(result.current.conflictInfo).toBeNull();
    expect(provider.save).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ force: true })
    );
  });

  it('handleLoadRemote reloads the model from the provider and discards local state', async () => {
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));
    act(() => result.current.handleStorageSelected(makeHandle()));

    await act(() => result.current.handleLoadRemote());

    expect(result.current.model?.metadata.title).toBe('Reloaded');
    expect(result.current.conflictInfo).toBeNull();
  });

  it('handleNewFile with unsaved changes asks for confirmation and aborts if declined', () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const { result } = renderHook(() => useStudioDocument({ driveAuth, onFileOpened: vi.fn() }));

    act(() => result.current.handleStorageSelected(makeHandle()));
    const titleBeforeAttempt = result.current.model?.metadata.title;
    // Model is dirty only after an edit via modelStore.updateModel — handleStorageSelected uses loadModel,
    // which starts clean. Mark dirty directly through the store to exercise the confirmation gate.
    act(() => result.current.modelStore.updateModel(result.current.model!));

    act(() => result.current.handleNewFile());

    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.model?.metadata.title).toBe(titleBeforeAttempt);
    expect(result.current.showStoragePrompt).not.toBe('new');
  });
});
