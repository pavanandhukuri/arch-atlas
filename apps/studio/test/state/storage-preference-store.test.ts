import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStoragePreference, setStoragePreference } from '../../src/state/storage-preference-store';

describe('StoragePreferenceStore', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localStorageMock[k] ?? null,
      setItem: (k: string, v: string) => { localStorageMock[k] = v; },
      removeItem: (k: string) => { delete localStorageMock[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no preference has been stored', () => {
    expect(getStoragePreference()).toBeNull();
  });

  it('returns "local" after setting preference to local', () => {
    setStoragePreference('local');
    expect(getStoragePreference()).toBe('local');
  });

  it('returns "google-drive" after setting preference to google-drive', () => {
    setStoragePreference('google-drive');
    expect(getStoragePreference()).toBe('google-drive');
  });

  it('overwrites previous preference', () => {
    setStoragePreference('local');
    setStoragePreference('google-drive');
    expect(getStoragePreference()).toBe('google-drive');
  });

  it('returns null when stored value is not a valid type', () => {
    localStorageMock['arch-atlas-storage-preference'] = 'invalid-value';
    expect(getStoragePreference()).toBeNull();
  });
});
