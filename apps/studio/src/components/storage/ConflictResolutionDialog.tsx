'use client';

import React from 'react';

/**
 * ConflictResolutionDialog — shown when a save conflict is detected.
 *
 * Presents the user with two timestamps (their local version vs the remote
 * version) and forces an explicit choice. Cannot be dismissed without choosing.
 *
 * Feature: 002-flexible-storage (US4 / T045)
 */

export interface ConflictResolutionDialogProps {
  /** Name of the file that has a conflict */
  fileName: string;
  /** ISO timestamp of the user's local version */
  localTimestamp: string;
  /** ISO timestamp of the remote (server/disk) version */
  remoteTimestamp: string;
  /** User chose to overwrite remote with their local version */
  onKeepMine: () => void;
  /** User chose to discard local changes and load the remote version */
  onLoadRemote: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ConflictResolutionDialog({
  fileName,
  localTimestamp,
  remoteTimestamp,
  onKeepMine,
  onLoadRemote,
}: ConflictResolutionDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '2rem',
          minWidth: 420,
          maxWidth: 520,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        <h2 id="conflict-dialog-title" style={{ marginTop: 0, color: '#b91c1c' }}>
          File conflict detected
        </h2>
        <p style={{ color: '#555', fontSize: '0.9rem' }}>
          <strong>{fileName}</strong> was modified outside of Arch Atlas. Choose which version to keep:
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              padding: '1rem',
              border: '2px solid #0066cc',
              borderRadius: 6,
              background: '#e8f0fe',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#1a56db' }}>Your version</div>
            <div style={{ fontSize: '0.85rem', color: '#374151' }}>
              {formatTimestamp(localTimestamp)}
            </div>
          </div>
          <div
            style={{
              padding: '1rem',
              border: '2px solid #d1d5db',
              borderRadius: 6,
              background: '#f9fafb',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>Remote version</div>
            <div style={{ fontSize: '0.85rem', color: '#374151' }}>
              {formatTimestamp(remoteTimestamp)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onLoadRemote}
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              color: '#111',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >
            Load Remote Version
          </button>
          <button
            onClick={onKeepMine}
            style={{
              padding: '0.5rem 1rem',
              background: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Keep My Version
          </button>
        </div>
      </div>
    </div>
  );
}
