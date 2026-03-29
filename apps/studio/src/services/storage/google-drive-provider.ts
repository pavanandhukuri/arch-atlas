/**
 * GoogleDriveProvider — StorageProvider implementation for Google Drive v3 REST API.
 *
 * Responsibilities:
 * - createFile(): Upload new file to Drive with multipart upload
 * - save(): Conflict-check (GET modifiedTime) then PATCH with new content
 * - load(): GET file metadata + content via alt=media
 * - isAvailable(): Lightweight ping to Drive about endpoint
 * - openFile(): Stub — implemented in US3 (T039)
 *
 * All API calls use the Bearer access token passed at construction time.
 * Token refresh is the caller's responsibility (AuthContext / useGoogleDriveAuth).
 *
 * Feature: 002-flexible-storage
 */

import type { ArchitectureModel } from '@arch-atlas/core-model';
import { parseModelFromText } from '../import-export';
import type {
  StorageProvider,
  StorageHandle,
  SaveResult,
  LoadResult,
  StorageError,
  StorageEvent,
  StorageEventType,
} from './storage-provider';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user';

// ---------------------------------------------------------------------------
// Fetch with timeout (10 s hard limit) + exponential backoff retry (T051)
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  // Network throws propagate immediately — only retry on 429/503 responses.
  const res = await fetchWithTimeout(url, init);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (res.status !== 429 && res.status !== 503) break;
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    await new Promise(r => setTimeout(r, delay));
    const retry = await fetchWithTimeout(url, init);
    // Return on success or non-retryable status
    if (retry.status !== 429 && retry.status !== 503) return retry;
    if (attempt === maxRetries - 1) return retry;
  }
  return res;
}

function buildBoundary(): string {
  return `arch-atlas-${Math.random().toString(36).slice(2)}`;
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
  boundary: string
): string {
  return (
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`
  );
}

// ---------------------------------------------------------------------------
// GoogleDriveProvider
// ---------------------------------------------------------------------------

const OFFLINE_POLL_INTERVAL_MS = 10_000;

type EventListener = (event: StorageEvent) => void;

export class GoogleDriveProvider implements StorageProvider {
  readonly type = 'google-drive' as const;

  private offlinePollTimer: ReturnType<typeof setInterval> | null = null;
  private isOffline = false;
  private listeners: Map<StorageEventType, Set<EventListener>> = new Map();

  constructor(private accessToken: string) {}

  /** Register a listener for offline/online events emitted by this provider */
  on(type: StorageEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  private emit(event: StorageEvent): void {
    this.listeners.get(event.type)?.forEach(l => l(event));
  }

  /** Called after a NETWORK_UNAVAILABLE save error — starts polling every 10s */
  private startOfflinePolling(): void {
    if (this.offlinePollTimer) return; // already polling
    this.isOffline = true;
    this.emit({ type: 'offline' });

    this.offlinePollTimer = setInterval(async () => {
      const available = await this.isAvailable();
      if (available) {
        this.stopOfflinePolling();
        this.emit({ type: 'online' });
      }
    }, OFFLINE_POLL_INTERVAL_MS);
  }

  private stopOfflinePolling(): void {
    if (this.offlinePollTimer) {
      clearInterval(this.offlinePollTimer);
      this.offlinePollTimer = null;
    }
    this.isOffline = false;
  }

  // ── listFiles() ───────────────────────────────────────────────────────────

  async listFiles(): Promise<Array<{ id: string; name: string; modifiedTime: string }> | StorageError> {
    try {
      const res = await fetchWithTimeout(
        `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      if (!res.ok) {
        return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Failed to list files' };
      }
      const data: { files: Array<{ id: string; name: string; modifiedTime: string }> } = await res.json();
      return data.files;
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Failed to list files — network error' };
    }
  }

  // ── deleteFile() ──────────────────────────────────────────────────────────

  async deleteFile(fileId: string): Promise<{ success: true } | StorageError> {
    try {
      const res = await fetchWithTimeout(`${DRIVE_FILES_URL}/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok && res.status !== 404) {
        return { success: false, code: 'UNKNOWN', message: 'Failed to delete file' };
      }
      return { success: true };
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Failed to delete file — network error' };
    }
  }

  // ── createFile() ──────────────────────────────────────────────────────────

  async createFile(suggestedName: string): Promise<StorageHandle | StorageError> {
    const fileName = suggestedName.endsWith('.arch.json')
      ? suggestedName
      : `${suggestedName}.arch.json`;

    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType: 'application/json',
      parents: ['appDataFolder'],
    };

    const boundary = buildBoundary();
    const body = buildMultipartBody(metadata, JSON.stringify({ nodes: [], edges: [], version: '1.0' }), boundary);

    try {
      const res = await fetchWithRetry(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!res.ok) {
        if (res.status === 401) {
          return { success: false, code: 'AUTH_REQUIRED', message: 'Access token expired or invalid' };
        }
        return { success: false, code: 'UNKNOWN', message: `Drive API error: ${res.status}` };
      }

      const data: { id: string; modifiedTime: string } = await res.json();

      const handle: StorageHandle = {
        type: 'google-drive',
        fileName,
        ref: data.id,
        lastKnownModified: data.modifiedTime,
      };

      return handle;
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Network request failed' };
    }
  }

  // ── save() ────────────────────────────────────────────────────────────────

  async save(
    handle: StorageHandle,
    model: ArchitectureModel,
    options?: { force?: boolean }
  ): Promise<SaveResult | StorageError> {
    const fileId = handle.ref as string;

    // Conflict check — unless force=true
    if (!options?.force) {
      try {
        const metaRes = await fetchWithRetry(
          `${DRIVE_FILES_URL}/${fileId}?fields=modifiedTime`,
          {
            headers: { Authorization: `Bearer ${this.accessToken}` },
          }
        );

        if (!metaRes.ok) {
          return { success: false, code: 'NETWORK_UNAVAILABLE', message: `Metadata fetch failed: ${metaRes.status}` };
        }

        const meta: { modifiedTime: string } = await metaRes.json();

        if (handle.lastKnownModified !== null && meta.modifiedTime !== handle.lastKnownModified) {
          return {
            success: false,
            code: 'CONFLICT',
            message: 'File was modified remotely since last load',
            conflict: {
              remoteModified: meta.modifiedTime,
              clientLastKnown: handle.lastKnownModified,
            },
          };
        }
      } catch {
        return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Conflict check failed — network error' };
      }
    }

    // PATCH with new content
    const content = JSON.stringify(model);
    const metadata = { mimeType: 'application/json' };
    const boundary = buildBoundary();
    const body = buildMultipartBody(metadata, content, boundary);

    try {
      const patchRes = await fetchWithRetry(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!patchRes.ok) {
        if (patchRes.status === 401) {
          return { success: false, code: 'AUTH_REQUIRED', message: 'Access token expired' };
        }
        return { success: false, code: 'UNKNOWN', message: `PATCH failed: ${patchRes.status}` };
      }

      const data: { id: string; modifiedTime: string } = await patchRes.json();

      return { success: true, newModified: data.modifiedTime };
    } catch {
      this.startOfflinePolling();
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'PATCH request failed — network error' };
    }
  }

  // ── load() ────────────────────────────────────────────────────────────────

  async load(handle: StorageHandle): Promise<LoadResult | StorageError> {
    const fileId = handle.ref as string;

    // Fetch metadata (modifiedTime)
    let modifiedTime: string;
    try {
      const metaRes = await fetchWithTimeout(`${DRIVE_FILES_URL}/${fileId}?fields=modifiedTime`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!metaRes.ok) {
        return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Failed to load file metadata' };
      }

      const meta: { modifiedTime: string } = await metaRes.json();
      modifiedTime = meta.modifiedTime;
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Metadata fetch failed — network error' };
    }

    // Fetch file content
    try {
      const contentRes = await fetchWithTimeout(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!contentRes.ok) {
        return { success: false, code: 'FILE_NOT_FOUND', message: 'File not found or access denied' };
      }

      const text = await contentRes.text();

      let model: ArchitectureModel;
      try {
        model = parseModelFromText(text);
      } catch {
        return { success: false, code: 'INVALID_FORMAT', message: 'File content is not a valid architecture model' };
      }

      return { success: true, model, modified: modifiedTime };
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Content fetch failed — network error' };
    }
  }

  // ── isAvailable() ─────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(DRIVE_ABOUT_URL, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── openFile() — US3 / T039 ──────────────────────────────────────────────
  //
  // The Drive file picker (DrivePicker React component) must be shown by the
  // UI layer (StoragePromptDialog). Once the user selects a file, the dialog
  // calls openFile(fileId, fileName) with the chosen IDs.
  //
  // When called with no arguments (e.g. from the StorageProvider interface),
  // returns NOT_IMPLEMENTED — the caller must supply fileId.

  async openFile(
    fileId?: string,
    fileName?: string
  ): Promise<{ handle: StorageHandle; result: LoadResult } | StorageError> {
    if (!fileId) {
      return {
        success: false,
        code: 'NOT_IMPLEMENTED',
        message: 'GoogleDriveProvider.openFile() requires a fileId — show DrivePicker in the UI first.',
      };
    }

    // Fetch file metadata (modifiedTime, name)
    let modifiedTime: string;
    let resolvedName: string;
    try {
      const metaRes = await fetchWithTimeout(
        `${DRIVE_FILES_URL}/${fileId}?fields=modifiedTime,name`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      if (!metaRes.ok) {
        return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Failed to load file metadata' };
      }
      const meta: { modifiedTime: string; name: string } = await metaRes.json();
      modifiedTime = meta.modifiedTime;
      resolvedName = fileName ?? meta.name;
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Metadata fetch failed — network error' };
    }

    // Fetch file content
    try {
      const contentRes = await fetchWithTimeout(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!contentRes.ok) {
        return { success: false, code: 'FILE_NOT_FOUND', message: 'File not found or access denied' };
      }

      const text = await contentRes.text();
      let model: ArchitectureModel;
      try {
        model = parseModelFromText(text);
      } catch {
        return { success: false, code: 'INVALID_FORMAT', message: 'File content is not a valid architecture model' };
      }

      const handle: StorageHandle = {
        type: 'google-drive',
        fileName: resolvedName,
        ref: fileId,
        lastKnownModified: modifiedTime,
      };

      return { handle, result: { success: true, model, modified: modifiedTime } };
    } catch {
      return { success: false, code: 'NETWORK_UNAVAILABLE', message: 'Content fetch failed — network error' };
    }
  }
}
