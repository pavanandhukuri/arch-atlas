/**
 * StorageProvider — core types and interface for all storage backends.
 *
 * Every storage backend (Local File System, Google Drive) MUST implement
 * the StorageProvider interface. The AutosaveManager and studio-page interact
 * with storage exclusively through this interface.
 *
 * Feature: 002-flexible-storage
 */

import type { ArchitectureModel } from '@arch-atlas/core-model';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export type StorageType = 'local' | 'google-drive';

/**
 * A fully-resolved handle to a file on a storage backend.
 * Returned by openFile() and createFile(), then passed into save() and load().
 */
export interface StorageHandle {
  readonly type: StorageType;
  readonly fileName: string;
  /**
   * Opaque backend-specific reference.
   * - Local: FileSystemFileHandle (serializable to IndexedDB)
   * - Drive: Drive file ID string
   */
  readonly ref: unknown;
  /**
   * Last-known modification marker for conflict detection.
   * - Local: File.lastModified (ms epoch, number)
   * - Drive: ISO 8601 modifiedTime string
   */
  lastKnownModified: number | string | null;
}

export interface SaveResult {
  success: true;
  newModified: number | string;
}

export interface LoadResult {
  success: true;
  model: ArchitectureModel;
  modified: number | string;
}

export interface ConflictInfo {
  remoteModified: number | string;
  clientLastKnown: number | string | null;
}

export interface StorageError {
  success: false;
  code: StorageErrorCode;
  message: string;
  conflict?: ConflictInfo;
}

export type StorageErrorCode =
  | 'PERMISSION_DENIED'
  | 'DISK_FULL'
  | 'NETWORK_UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'CONFLICT'
  | 'FILE_NOT_FOUND'
  | 'INVALID_FORMAT'
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN';

// ---------------------------------------------------------------------------
// StorageProvider interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  readonly type: StorageType;

  /**
   * Prompt the user to pick an existing file for opening.
   * Returns a StorageHandle bound to the chosen file plus the loaded model.
   */
  openFile(): Promise<{ handle: StorageHandle; result: LoadResult } | StorageError>;

  /**
   * Prompt the user to choose a location and name for a new file.
   * Does NOT write any content — caller must call save() next.
   */
  createFile(suggestedName: string): Promise<StorageHandle | StorageError>;

  /**
   * Write model to the location described by handle.
   * Checks for conflicts before writing unless force=true.
   */
  save(
    handle: StorageHandle,
    model: ArchitectureModel,
    options?: { force?: boolean }
  ): Promise<SaveResult | StorageError>;

  /**
   * Read and parse the diagram file described by handle.
   */
  load(handle: StorageHandle): Promise<LoadResult | StorageError>;

  /**
   * Test whether the storage backend is currently reachable.
   */
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Auth provider sub-contract (Google Drive only)
// ---------------------------------------------------------------------------

export interface DriveAuthProvider {
  getAccessToken(): Promise<string>;
  authorize(): Promise<void>;
  revoke(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Event types emitted by StorageManager
// ---------------------------------------------------------------------------

export type StorageEventType = 'save-success' | 'save-error' | 'conflict' | 'offline' | 'online';

export interface StorageEvent {
  type: StorageEventType;
  handle?: StorageHandle;
  error?: StorageError;
}

export const STORAGE_PREFERENCE_KEY = 'arch-atlas-storage-preference';
