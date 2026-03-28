'use client';

/**
 * LocalFileProvider — StorageProvider implementation using the browser
 * File System Access API for reading and writing diagram files to local disk.
 *
 * Fallback: if the browser does not support showSaveFilePicker, operations
 * requiring write access return PERMISSION_DENIED. loadFromLocalStorage()
 * (crash recovery buffer) still works in all browsers.
 *
 * Feature: 002-flexible-storage
 */

import { openDB } from 'idb';
import { parseModelFromText } from '../import-export';
import type {
  StorageProvider,
  StorageHandle,
  SaveResult,
  LoadResult,
  StorageError,
} from './storage-provider';

// IndexedDB database/store names
const DB_NAME = 'arch-atlas-fs';
const STORE_NAME = 'file-handles';
const HANDLE_KEY = 'current-diagram';

// Internal access to the stored file handle for isAvailable()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FSFileHandle = any; // FileSystemFileHandle — avoid lib.dom types for now

export class LocalFileProvider implements StorageProvider {
  readonly type = 'local' as const;

  /** Internal reference to the active file handle — set on create/open */
  _currentHandle: FSFileHandle | null = null;

  // ---------------------------------------------------------------------------
  // openFile — prompt user to pick an existing file
  // ---------------------------------------------------------------------------

  async openFile(): Promise<{ handle: StorageHandle; result: LoadResult } | StorageError> {
    if (!this._supportsFileSystemAccess()) {
      return {
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Your browser does not support the File System Access API.',
      };
    }

    try {
      const [fileHandle]: FSFileHandle[] = await (globalThis as typeof globalThis & {
        showOpenFilePicker: (opts: unknown) => Promise<unknown[]>
      }).showOpenFilePicker({
        types: [
          {
            description: 'Architecture Diagram',
            accept: { 'application/json': ['.arch.json'] },
          },
        ],
        multiple: false,
      });

      await this._persistHandle(fileHandle);
      this._currentHandle = fileHandle;

      const file = await fileHandle.getFile();
      const text: string = await file.text();

      let model: import('@arch-atlas/core-model').ArchitectureModel;
      try {
        model = parseModelFromText(text);
      } catch (err) {
        return {
          success: false,
          code: 'INVALID_FORMAT',
          message: err instanceof Error ? err.message : 'Failed to parse diagram file.',
        };
      }

      const handle: StorageHandle = {
        type: 'local',
        fileName: fileHandle.name,
        ref: fileHandle,
        lastKnownModified: file.lastModified,
      };

      return { handle, result: { success: true, model, modified: file.lastModified } };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, code: 'PERMISSION_DENIED', message: 'File selection cancelled.' };
      }
      return {
        success: false,
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Unknown error opening file.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // createFile — prompt user to pick save location
  // ---------------------------------------------------------------------------

  async createFile(suggestedName: string): Promise<StorageHandle | StorageError> {
    if (!this._supportsFileSystemAccess()) {
      return {
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Your browser does not support the File System Access API. Use the Export button to download your diagram.',
      };
    }

    try {
      // Ensure suggestedName ends in .arch.json
      const fileName = suggestedName.endsWith('.arch.json')
        ? suggestedName
        : `${suggestedName}.arch.json`;

      const fileHandle: FSFileHandle = await (globalThis as typeof globalThis & { showSaveFilePicker: (opts: unknown) => Promise<unknown> }).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'Architecture Diagram',
            accept: { 'application/json': ['.arch.json'] },
          },
        ],
      });

      await this._persistHandle(fileHandle);
      this._currentHandle = fileHandle;

      return {
        type: 'local',
        fileName: fileHandle.name ?? fileName,
        ref: fileHandle,
        lastKnownModified: null,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, code: 'PERMISSION_DENIED', message: 'File selection cancelled.' };
      }
      return {
        success: false,
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Unknown error creating file.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // save — full-overwrite with conflict detection
  // ---------------------------------------------------------------------------

  async save(
    handle: StorageHandle,
    model: import('@arch-atlas/core-model').ArchitectureModel,
    options?: { force?: boolean }
  ): Promise<SaveResult | StorageError> {
    const fileHandle = handle.ref as FSFileHandle;

    try {
      // Conflict detection: compare current lastModified with stored value
      if (!options?.force && handle.lastKnownModified !== null) {
        const file = await fileHandle.getFile();
        const currentModified: number = file.lastModified;
        if (currentModified !== handle.lastKnownModified) {
          return {
            success: false,
            code: 'CONFLICT',
            message: 'The file was modified externally since it was last read.',
            conflict: {
              remoteModified: currentModified,
              clientLastKnown: handle.lastKnownModified,
            },
          };
        }
      }

      // Full-overwrite write
      const json = JSON.stringify(model, null, 2);
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.truncate(new TextEncoder().encode(json).length);
      await writable.close();

      // Read back the new lastModified timestamp
      const written = await fileHandle.getFile();
      return { success: true, newModified: written.lastModified };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Write failed';
      if (message.toLowerCase().includes('quota')) {
        return { success: false, code: 'DISK_FULL', message };
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        return { success: false, code: 'PERMISSION_DENIED', message };
      }
      return { success: false, code: 'UNKNOWN', message };
    }
  }

  // ---------------------------------------------------------------------------
  // load — read and parse model from file
  // ---------------------------------------------------------------------------

  async load(handle: StorageHandle): Promise<LoadResult | StorageError> {
    const fileHandle = handle.ref as FSFileHandle;

    try {
      const file = await fileHandle.getFile();
      const text: string = await file.text();

      const parsed = parseModelFromText(text);
      return { success: true, model: parsed, modified: file.lastModified };
    } catch (err) {
      return {
        success: false,
        code: 'INVALID_FORMAT',
        message: err instanceof Error ? err.message : 'Failed to parse diagram file.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // isAvailable — check if permission is still granted
  // ---------------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    if (!this._currentHandle) return false;
    try {
      const permission = await this._currentHandle.queryPermission({ mode: 'readwrite' });
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // FileHandle persistence (IndexedDB)
  // ---------------------------------------------------------------------------

  async getRestoredHandle(): Promise<FSFileHandle | null> {
    try {
      const db = await this._openDB();
      const record = await db.get(STORE_NAME, HANDLE_KEY);
      if (!record) return null;

      const handle = record as FSFileHandle;
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        this._currentHandle = handle;
        return handle;
      }
      // Try to re-request — Chrome 122+ shows persistent permissions prompt
      const requested = await handle.requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') {
        this._currentHandle = handle;
        return handle;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async _persistHandle(fileHandle: FSFileHandle): Promise<void> {
    try {
      const db = await this._openDB();
      await db.put(STORE_NAME, fileHandle, HANDLE_KEY);
    } catch {
      // Non-fatal — handle just won't persist across refreshes
    }
  }

  private async _openDB() {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _supportsFileSystemAccess(): boolean {
    return typeof (globalThis as Record<string, unknown>).showSaveFilePicker === 'function';
  }
}
