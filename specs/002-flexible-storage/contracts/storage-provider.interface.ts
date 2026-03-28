/**
 * Contract: StorageProvider
 *
 * Every storage backend (Local File System, Google Drive) MUST implement
 * this interface. The AutosaveManager and studio-page.tsx interact with
 * storage exclusively through this interface — never through backend-specific
 * code directly.
 *
 * Feature: 002-flexible-storage
 * Date: 2026-03-19
 */

import type { ArchitectureModel } from '@arch-atlas/core-model';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export type StorageType = 'local' | 'google-drive';

/**
 * A fully-resolved handle to a file on a storage backend.
 * Returned by `openFile()` and `createFile()`, then passed back
 * into `save()` and `load()`.
 */
export interface StorageHandle {
  /** Which backend owns this handle */
  readonly type: StorageType;
  /** Human-readable filename (e.g., "my-diagram.arch.json") */
  readonly fileName: string;
  /**
   * Opaque backend-specific reference.
   * - Local: a `FileSystemFileHandle` (serializable to IndexedDB)
   * - Drive: a Drive file ID string
   */
  readonly ref: FileSystemFileHandle | string;
  /**
   * Last-known modification marker used for conflict detection.
   * - Local: `File.lastModified` (ms epoch, number)
   * - Drive: ISO 8601 `modifiedTime` string
   */
  lastKnownModified: number | string | null;
}

/** Structured save/load result */
export interface SaveResult {
  success: true;
  /** Updated modification marker after a successful write */
  newModified: number | string;
}

export interface LoadResult {
  success: true;
  model: ArchitectureModel;
  /** Modification marker at time of read */
  modified: number | string;
}

/** Conflict information returned when a write conflict is detected */
export interface ConflictInfo {
  /** Modification marker of the remote (stored) version */
  remoteModified: number | string;
  /** Modification marker the client expected (last known) */
  clientLastKnown: number | string | null;
}

/** Error shapes */
export interface StorageError {
  success: false;
  code: StorageErrorCode;
  message: string;
  conflict?: ConflictInfo; // present when code === 'CONFLICT'
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
  | 'UNKNOWN';

// ---------------------------------------------------------------------------
// StorageProvider interface
// ---------------------------------------------------------------------------

/**
 * A storage backend capable of opening, saving, and loading diagram files.
 *
 * Implementations MUST:
 * - Be stateless between calls (all state lives in `StorageHandle`)
 * - Perform conflict detection before every write
 * - Throw `StorageError` (not raw exceptions) for all failure cases
 * - Never expose backend credentials or tokens in return values
 */
export interface StorageProvider {
  /** Identifies this provider's backend type */
  readonly type: StorageType;

  /**
   * Prompt the user to pick an existing file for opening.
   * Returns a `StorageHandle` bound to the chosen file.
   * Throws `StorageError` with code `PERMISSION_DENIED` if user cancels.
   */
  openFile(): Promise<{ handle: StorageHandle; result: LoadResult } | StorageError>;

  /**
   * Prompt the user to choose a location and name for a new file.
   * Does NOT write any content — the caller must call `save()` next.
   * Throws `StorageError` with code `PERMISSION_DENIED` if user cancels.
   */
  createFile(suggestedName: string): Promise<StorageHandle | StorageError>;

  /**
   * Write `model` to the location described by `handle`.
   *
   * MUST check for conflicts before writing:
   * - Fetch current modification marker from the storage backend.
   * - If it differs from `handle.lastKnownModified`, return a `StorageError`
   *   with code `CONFLICT` and populate `conflict` field.
   *
   * On success, returns a `SaveResult` with the updated `newModified` marker.
   * Caller is responsible for updating `handle.lastKnownModified`.
   */
  save(handle: StorageHandle, model: ArchitectureModel): Promise<SaveResult | StorageError>;

  /**
   * Read and parse the diagram file described by `handle`.
   * Returns the parsed model and an updated modification marker.
   */
  load(handle: StorageHandle): Promise<LoadResult | StorageError>;

  /**
   * Test whether the storage backend is currently reachable.
   * For local: checks whether file permission is still granted.
   * For Drive: checks network connectivity and token validity.
   */
  isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Auth provider sub-contract (Google Drive only)
// ---------------------------------------------------------------------------

/**
 * Interface for the Google Drive authentication lifecycle.
 * Implemented by the BFF auth service (Next.js API routes).
 *
 * The client only ever holds an access token in memory; all refresh-token
 * operations are handled server-side and MUST NOT expose the refresh token
 * to client JavaScript.
 */
export interface DriveAuthProvider {
  /**
   * Returns a valid access token, silently refreshing via the BFF if needed.
   * Throws `StorageError` with code `AUTH_REQUIRED` if no session exists.
   * Throws `StorageError` with code `AUTH_FAILED` if refresh fails.
   */
  getAccessToken(): Promise<string>;

  /**
   * Initiates the OAuth2 + PKCE authorization flow via a browser popup.
   * Resolves when the user has successfully authorized and a session is established.
   * Throws `StorageError` with code `AUTH_FAILED` if the user denies or an error occurs.
   */
  authorize(): Promise<void>;

  /**
   * Revokes the OAuth session: calls Google's revoke endpoint server-side,
   * clears the httpOnly refresh-token cookie, and drops the in-memory access token.
   */
  revoke(): Promise<void>;

  /**
   * Returns true if a valid session (refresh token cookie) exists.
   * Does not guarantee the access token is fresh — use `getAccessToken()` for that.
   */
  isAuthenticated(): Promise<boolean>;
}
