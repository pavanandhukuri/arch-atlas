'use client';

/**
 * ConnectionStatusBanner — shows a persistent amber banner when Google Drive
 * is unreachable and dismisses automatically when connectivity is restored.
 *
 * Subscribes to StorageManager 'offline' and 'online' events.
 *
 * Feature: 002-flexible-storage
 */

import React, { useEffect, useState } from 'react';
import type { StorageManager } from '../../services/storage/storage-manager';

interface ConnectionStatusBannerProps {
  storageManager: StorageManager;
}

export function ConnectionStatusBanner({ storageManager }: ConnectionStatusBannerProps): React.JSX.Element | null {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubOffline = storageManager.on('offline', () => setIsOffline(true));
    const unsubOnline = storageManager.on('online', () => setIsOffline(false));

    return () => {
      unsubOffline();
      unsubOnline();
    };
  }, [storageManager]);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#d97706',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      Google Drive unavailable — autosave paused. Reconnecting…
    </div>
  );
}
