'use client';

/**
 * useStorageSession — manages the active StorageHandle for the current diagram session.
 *
 * Feature: 002-flexible-storage
 */

import { useState, useCallback } from 'react';
import type { StorageHandle, StorageType } from '../services/storage/storage-provider';

export interface StorageSession {
  handle: StorageHandle | null;
  storageType: StorageType | null;
  setHandle: (handle: StorageHandle) => void;
  clearHandle: () => void;
}

export function useStorageSession(): StorageSession {
  const [handle, setHandleState] = useState<StorageHandle | null>(null);

  const setHandle = useCallback((newHandle: StorageHandle) => {
    setHandleState(newHandle);
  }, []);

  const clearHandle = useCallback(() => {
    setHandleState(null);
  }, []);

  return {
    handle,
    storageType: handle?.type ?? null,
    setHandle,
    clearHandle,
  };
}
