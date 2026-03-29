/**
 * StorageManager — orchestrates autosave, conflict detection, and event emission
 * across all storage backends.
 *
 * Feature: 002-flexible-storage
 */

import type { ArchitectureModel } from '@arch-atlas/core-model';
import type {
  StorageProvider,
  StorageHandle,
  SaveResult,
  StorageError,
  StorageEvent,
  StorageEventType,
} from './storage-provider';

const AUTOSAVE_INTERVAL_MS = 2000;

type EventListener = (event: StorageEvent) => void;

export class StorageManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isSaving = false;
  private listeners: Map<StorageEventType, Set<EventListener>> = new Map();

  // ---------------------------------------------------------------------------
  // Autosave lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the autosave loop. Calls provider.save() every 2 seconds when isDirty.
   * Skips a tick if a save is already in-flight to prevent concurrent saves
   * racing on lastKnownModified and producing false conflicts.
   * Replaces any existing autosave session.
   */
  startAutosave(
    handle: StorageHandle,
    provider: StorageProvider,
    getModel: () => ArchitectureModel | null,
    isDirty: () => boolean
  ): void {
    this.stopAutosave();
    this.timer = setInterval(() => {
      if (this.isSaving) return;   // previous save still in-flight — skip tick
      if (!isDirty()) return;
      const model = getModel();
      if (!model) return;
      // force: true — autosave skips the conflict-check GET (one request, not two).
      // Conflict detection happens on explicit load; autosave is the authoritative write.
      void this._doSave(handle, provider, model, { force: true });
    }, AUTOSAVE_INTERVAL_MS);
  }

  stopAutosave(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isSaving = false;
  }

  // ---------------------------------------------------------------------------
  // Manual save
  // ---------------------------------------------------------------------------

  async manualSave(
    handle: StorageHandle,
    provider: StorageProvider,
    model: ArchitectureModel,
    options?: { force?: boolean }
  ): Promise<SaveResult | StorageError> {
    return this._doSave(handle, provider, model, options);
  }

  // ---------------------------------------------------------------------------
  // Internal save logic
  // ---------------------------------------------------------------------------

  private async _doSave(
    handle: StorageHandle,
    provider: StorageProvider,
    model: ArchitectureModel,
    options?: { force?: boolean }
  ): Promise<SaveResult | StorageError> {
    this.isSaving = true;
    try {
      const result = await provider.save(handle, model, options);

      if (result.success) {
        handle.lastKnownModified = result.newModified;
        this.emit({ type: 'save-success', handle });
      } else {
        const error = result;
        if (error.code === 'CONFLICT') {
          this.emit({ type: 'conflict', handle, error });
        } else if (error.code === 'NETWORK_UNAVAILABLE' || error.code === 'AUTH_REQUIRED') {
          this.emit({ type: 'offline', handle, error });
        } else {
          this.emit({ type: 'save-error', handle, error });
        }
      }

      return result;
    } finally {
      this.isSaving = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Event emitter
  // ---------------------------------------------------------------------------

  on(type: StorageEventType, listener: EventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  private emit(event: StorageEvent): void {
    this.listeners.get(event.type)?.forEach(l => l(event));
  }
}
