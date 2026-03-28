/**
 * StoragePreferenceStore — persists the user's last-used storage type across sessions.
 *
 * Stores only non-sensitive metadata ('local' | 'google-drive') in localStorage.
 * No file paths, Drive IDs, or credentials are stored here.
 *
 * Feature: 002-flexible-storage
 */

import type { StorageType } from '../services/storage/storage-provider';
import { STORAGE_PREFERENCE_KEY } from '../services/storage/storage-provider';

const VALID_TYPES: readonly StorageType[] = ['local', 'google-drive'];

export function getStoragePreference(): StorageType | null {
  try {
    const value = localStorage.getItem(STORAGE_PREFERENCE_KEY);
    if (value && (VALID_TYPES as readonly string[]).includes(value)) {
      return value as StorageType;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoragePreference(type: StorageType): void {
  try {
    localStorage.setItem(STORAGE_PREFERENCE_KEY, type);
  } catch {
    // Non-fatal
  }
}
