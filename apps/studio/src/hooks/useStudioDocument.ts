'use client';

/**
 * useStudioDocument — owns the active diagram's model, its storage backing (local file or
 * Google Drive), autosave, and conflict resolution. This is the state/behavior that used to
 * live directly in studio-page.tsx: picking up a model handed off from the Import Wizard,
 * the startup "New or Open" prompt, autosave start/stop, and the New/Open/Save/Export/
 * keep-mine/load-remote handlers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchitectureModel } from '@archatlas/core-model';
import { ModelStore } from '../state/model-store';
import { StorageManager } from '../services/storage/storage-manager';
import { LocalFileProvider } from '../services/storage/local-file-provider';
import { GoogleDriveProvider } from '../services/storage/google-drive-provider';
import type { GoogleDriveAuthState } from './useGoogleDriveAuth';
import { useStorageSession } from './useStorageSession';
import { exportModel } from '../services/import-export';
import type { StorageHandle, LoadResult } from '../services/storage/storage-provider';

export type StoragePromptMode = 'startup' | 'new' | 'open';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ConflictInfo {
  remoteModified: string;
  clientLastKnown: string | number | null;
}

export interface UseStudioDocumentOptions {
  driveAuth: GoogleDriveAuthState;
  /** Called after an existing file is opened, so navigation can reset to the landscape view. */
  onFileOpened: () => void;
}

export interface StudioDocument {
  modelStore: ModelStore;
  storageManager: StorageManager;
  model: ArchitectureModel | null;
  /** Live read of the store's dirty flag — not its own reactive state (matches pre-refactor behavior). */
  isDirty: boolean;
  handle: StorageHandle | null;
  saveStatus: SaveStatus;
  saveStatusMessage: string;
  conflictInfo: ConflictInfo | null;
  showStoragePrompt: StoragePromptMode | null;
  setShowStoragePrompt: (mode: StoragePromptMode | null) => void;
  handleNewFile: () => void;
  handleImportClick: () => void;
  handleExport: () => void;
  handleManualSave: () => Promise<void>;
  handleKeepMine: () => Promise<void>;
  handleLoadRemote: () => Promise<void>;
  handleStorageSelected: (handle: StorageHandle, loadResult?: LoadResult) => void;
}

function createEmptyArchitectureModel(): ArchitectureModel {
  return {
    schemaVersion: '0.1.0',
    metadata: {
      title: 'New Architecture',
      description: 'Created with Arch Atlas Studio',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: [],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'System Context',
        level: 'system',
        layout: { algorithm: 'deterministic-v1', nodes: [], edges: [] },
      },
    ],
  };
}

export function useStudioDocument({
  driveAuth,
  onFileOpened,
}: UseStudioDocumentOptions): StudioDocument {
  const [modelStore] = useState(() => new ModelStore());
  const [storageManager] = useState(() => new StorageManager());
  const [localProvider] = useState(() => new LocalFileProvider());
  const { handle, setHandle, clearHandle } = useStorageSession();

  const [model, setModel] = useState<ArchitectureModel | null>(null);
  const [showStoragePrompt, setShowStoragePrompt] = useState<StoragePromptMode | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveStatusMessage, setSaveStatusMessage] = useState('');
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);

  // Guards the pending-import / startup-prompt decision against Strict Mode's dev double-invoke.
  const hasHandledMountRef = useRef(false);

  const getProvider = useCallback(
    (h: StorageHandle) =>
      h.type === 'local' ? localProvider : new GoogleDriveProvider(driveAuth.accessToken ?? ''),
    [localProvider, driveAuth.accessToken]
  );

  useEffect(() => {
    const unsubscribe = modelStore.subscribe((state) => {
      setModel(state.model);
    });

    if (!hasHandledMountRef.current) {
      hasHandledMountRef.current = true;

      // Pick up a model handed off from the Import Wizard ("Open in Studio"), if any.
      // Consume it once so a page refresh doesn't keep re-importing the same model.
      const pendingImportRaw = sessionStorage.getItem('import_model');
      let pendingImportLoaded = false;
      if (pendingImportRaw) {
        sessionStorage.removeItem('import_model');
        try {
          modelStore.loadModel(JSON.parse(pendingImportRaw) as ArchitectureModel);
          pendingImportLoaded = true;
        } catch {
          // Malformed payload — ignore and fall through to the normal startup flow.
        }
      }

      // Hydrate immediately from current store state (subscribe() doesn't fire retroactively).
      setModel(modelStore.getState().model);

      if (pendingImportLoaded) {
        // A model was just handed off from the Import Wizard — skip the "New or
        // Open" question (it's obviously a new, unsaved diagram) and go straight
        // to picking where to save it.
        setShowStoragePrompt('new');
      } else if (!handle) {
        // Only prompt on fresh load — if a handle is already in session storage (e.g. after HMR),
        // skip the dialog so the user isn't interrupted mid-session.
        setShowStoragePrompt('startup');
      }
    }

    const offSuccess = storageManager.on('save-success', () => {
      modelStore.clearDirty();
      setSaveStatus('saved');
      setSaveStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setSaveStatus('idle'), 3000);
    });
    const offError = storageManager.on('save-error', (e) => {
      setSaveStatus('error');
      setSaveStatusMessage(e.error?.message ?? 'Save failed');
    });
    const offConflict = storageManager.on('conflict', (e) => {
      if (e.error?.conflict) {
        setConflictInfo({
          remoteModified: String(e.error.conflict.remoteModified),
          clientLastKnown: e.error.conflict.clientLastKnown,
        });
      }
    });

    return () => {
      unsubscribe();
      offSuccess();
      offError();
      offConflict();
      storageManager.stopAutosave();
    };
    // mount-only: modelStore/storageManager are stable useState refs
  }, []);

  useEffect(() => {
    if (!handle) {
      storageManager.stopAutosave();
      return;
    }
    const provider = getProvider(handle);
    storageManager.startAutosave(
      handle,
      provider,
      () => modelStore.getState().model,
      () => modelStore.getState().isDirty
    );
    return () => storageManager.stopAutosave();
    // localProvider/modelStore/storageManager are stable useState refs
  }, [handle, driveAuth.accessToken]);

  const handleExport = useCallback(() => {
    if (model) {
      exportModel(model);
      modelStore.clearDirty();
    }
  }, [model, modelStore]);

  /** Open button — show StoragePromptDialog in open mode */
  const handleImportClick = useCallback(() => {
    storageManager.stopAutosave();
    clearHandle();
    setShowStoragePrompt('open');
  }, [storageManager, clearHandle]);

  /** New button — stop current session and show StoragePromptDialog */
  const handleNewFile = useCallback(() => {
    if (handle && modelStore.getState().isDirty) {
      if (!confirm('Create a new file? Unsaved changes will be lost.')) return;
    }
    storageManager.stopAutosave();
    clearHandle();

    const newModel = createEmptyArchitectureModel();
    modelStore.loadModel(newModel);
    setModel(newModel);
    setShowStoragePrompt('new');
  }, [handle, modelStore, storageManager, clearHandle]);

  /** Manual Save */
  const handleManualSave = useCallback(async () => {
    if (!handle || !model) return;
    setSaveStatus('saving');
    const provider = getProvider(handle);
    try {
      const result = await storageManager.manualSave(handle, provider, model);
      if (!result.success) {
        setSaveStatus('error');
        setSaveStatusMessage(result.message);
      }
    } catch (err) {
      setSaveStatus('error');
      setSaveStatusMessage(err instanceof Error ? err.message : 'Unexpected error during save');
    }
  }, [handle, model, storageManager, getProvider]);

  /** Keep My Version — force-overwrite remote with local state */
  const handleKeepMine = useCallback(async () => {
    if (!handle || !model) return;
    const provider = getProvider(handle);
    setConflictInfo(null);
    await storageManager.manualSave(handle, provider, model, { force: true });
  }, [handle, model, storageManager, getProvider]);

  /** Load Remote Version — discard local changes and reload from storage */
  const handleLoadRemote = useCallback(async () => {
    if (!handle) return;
    const provider = getProvider(handle);
    setConflictInfo(null);
    const result = await provider.load(handle);
    if (result.success) {
      modelStore.loadModel(result.model);
      setModel(result.model);
      handle.lastKnownModified = result.modified;
    }
  }, [handle, modelStore, getProvider]);

  /** Called when the user selects a storage location from the dialog */
  const handleStorageSelected = useCallback(
    (selectedHandle: StorageHandle, loadResult?: LoadResult) => {
      if (loadResult) {
        // Opening an existing file — load its model
        modelStore.loadModel(loadResult.model);
        setModel(loadResult.model);
        onFileOpened();
      } else if (!modelStore.getState().model) {
        // New file from startup flow — no model has been created yet, initialize empty one
        const newModel = createEmptyArchitectureModel();
        modelStore.loadModel(newModel);
        setModel(newModel);
      }

      setHandle(selectedHandle);
      setShowStoragePrompt(null);
    },
    [modelStore, setHandle, onFileOpened]
  );

  return {
    modelStore,
    storageManager,
    model,
    isDirty: modelStore.getState().isDirty,
    handle,
    saveStatus,
    saveStatusMessage,
    conflictInfo,
    showStoragePrompt,
    setShowStoragePrompt,
    handleNewFile,
    handleImportClick,
    handleExport,
    handleManualSave,
    handleKeepMine,
    handleLoadRemote,
    handleStorageSelected,
  };
}
