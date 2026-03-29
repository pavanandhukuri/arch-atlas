'use client';

/**
 * StoragePromptDialog — modal dialog for choosing where to store a diagram.
 *
 * Mode 'startup': user first picks "New" or "Open", then storage location.
 * Mode 'new': skip to storage picker for a new file (New button).
 * Mode 'open': skip to storage picker to open an existing file (Open button).
 *
 * Google Drive stores files in the hidden appDataFolder — no picker needed.
 * Auth is popup-based (no page redirect) via @react-oauth/google.
 *
 * Feature: 002-flexible-storage
 */

import React, { useState, useEffect, useCallback } from 'react';
import { LocalFileProvider } from '../../services/storage/local-file-provider';
import { GoogleDriveProvider } from '../../services/storage/google-drive-provider';
import { getStoragePreference, setStoragePreference } from '../../state/storage-preference-store';
import type {
  StorageHandle,
  StorageType,
  LoadResult,
} from '../../services/storage/storage-provider';
import type { GoogleDriveAuthState } from '../../hooks/useGoogleDriveAuth';

export interface StoragePromptDialogProps {
  /**
   * - 'startup': shown on app open — user first picks "New" or "Open", then storage location
   * - 'new': skip to storage picker for a new file (New button)
   * - 'open': skip to storage picker to open an existing file (Open button)
   */
  mode: 'startup' | 'new' | 'open';
  onLocalSelected: (handle: StorageHandle, loadResult?: LoadResult) => void;
  onDriveSelected: (handle: StorageHandle, loadResult?: LoadResult) => void;
  /** Auth state lifted from the parent — single source of truth for the access token */
  driveAuth: GoogleDriveAuthState;
  onClose?: () => void;
}

export function StoragePromptDialog({
  mode,
  onLocalSelected,
  onDriveSelected,
  driveAuth,
}: StoragePromptDialogProps) {
  const [localProvider] = useState(() => new LocalFileProvider());

  // In 'startup' mode, user first picks intent ('new' or 'open') before seeing storage options
  const [startupIntent, setStartupIntent] = useState<'new' | 'open' | null>(null);
  const resolvedMode = mode === 'startup' ? startupIntent : mode;

  const [activeTab, setActiveTab] = useState<StorageType>('local');
  const [diagramName, setDiagramName] = useState('New Architecture');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Drive file list (open mode)
  const [driveFiles, setDriveFiles] = useState<
    Array<{ id: string; name: string; modifiedTime: string }>
  >([]);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [selectedDriveFileId, setSelectedDriveFileId] = useState<string | null>(null);
  const [selectedDriveFileName, setSelectedDriveFileName] = useState<string | null>(null);

  const {
    accessToken,
    isAuthenticated,
    authorize,
    revoke,
    isLoading: authLoading,
    authError,
  } = driveAuth;

  // Restore last-used storage tab preference
  useEffect(() => {
    const pref = getStoragePreference();
    if (pref) setActiveTab(pref);
  }, []);

  // Fetch Drive file list when authenticated and in open mode
  const fetchDriveFiles = useCallback(async (token: string) => {
    setDriveFilesLoading(true);
    setError(null);
    const provider = new GoogleDriveProvider(token);
    const result = await provider.listFiles();
    setDriveFilesLoading(false);
    if ('success' in result) {
      setError('Failed to load your diagrams from Drive.');
    } else {
      setDriveFiles(result);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'google-drive' && isAuthenticated && accessToken && resolvedMode === 'open') {
      void fetchDriveFiles(accessToken);
    }
  }, [activeTab, isAuthenticated, accessToken, resolvedMode, fetchDriveFiles]);

  const handleDeleteDriveFile = async (fileId: string) => {
    if (!accessToken) return;
    const provider = new GoogleDriveProvider(accessToken);
    await provider.deleteFile(fileId);
    setDriveFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (selectedDriveFileId === fileId) {
      setSelectedDriveFileId(null);
      setSelectedDriveFileName(null);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (activeTab === 'local') {
        if (resolvedMode === 'new') {
          const result = await localProvider.createFile(diagramName);
          if ('success' in result) {
            setError(result.message);
            return;
          }
          setStoragePreference('local');
          onLocalSelected(result);
        } else {
          // resolvedMode === 'open'
          const result = await localProvider.openFile();
          if ('success' in result) {
            setError(result.message);
            return;
          }
          const { handle, result: loadResult } = result;
          setStoragePreference('local');
          onLocalSelected(handle, loadResult);
        }
      } else {
        // Google Drive
        if (!isAuthenticated || !accessToken) {
          setError('Please connect your Google Drive account first.');
          return;
        }

        const driveProvider = new GoogleDriveProvider(accessToken);

        if (resolvedMode === 'new') {
          const result = await driveProvider.createFile(diagramName);
          if ('success' in result) {
            setError(result.message);
            return;
          }
          setStoragePreference('google-drive');
          onDriveSelected(result);
        } else {
          // resolvedMode === 'open'
          if (!selectedDriveFileId || !selectedDriveFileName) {
            setError('Please select a file from your Google Drive first.');
            return;
          }
          const result = await driveProvider.openFile(selectedDriveFileId, selectedDriveFileName);
          if ('success' in result) {
            setError(result.message);
            return;
          }
          const { handle, result: loadResult } = result;
          setStoragePreference('google-drive');
          onDriveSelected(handle, loadResult);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '2rem',
          minWidth: 420,
          maxWidth: 520,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h2 id="storage-prompt-title" style={{ marginTop: 0 }}>
          {resolvedMode === 'new'
            ? 'Choose where to save your diagram'
            : resolvedMode === 'open'
              ? 'Open a diagram'
              : 'Welcome to Arch Atlas'}
        </h2>

        {/* Startup intent selection */}
        {mode === 'startup' && startupIntent === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1rem' }}>
            <p style={{ color: '#555', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
              What would you like to do?
            </p>
            <button
              onClick={() => setStartupIntent('new')}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 6,
                border: '2px solid #0066cc',
                background: '#e8f0fe',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '1rem',
                textAlign: 'left',
                color: '#111',
                fontFamily: 'inherit',
                lineHeight: 1.4,
              }}
            >
              New diagram
              <div style={{ fontWeight: 400, fontSize: '0.85rem', color: '#555', marginTop: 4 }}>
                Start from scratch and choose where to save
              </div>
            </button>
            <button
              onClick={() => setStartupIntent('open')}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 6,
                border: '2px solid #ccc',
                background: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '1rem',
                textAlign: 'left',
                color: '#111',
                fontFamily: 'inherit',
                lineHeight: 1.4,
              }}
            >
              Open existing diagram
              <div style={{ fontWeight: 400, fontSize: '0.85rem', color: '#555', marginTop: 4 }}>
                Open a diagram from your computer or Google Drive
              </div>
            </button>
          </div>
        )}

        {/* Storage tabs + panels */}
        {resolvedMode !== null && (
          <>
            {mode === 'startup' && (
              <button
                onClick={() => {
                  setStartupIntent(null);
                  setError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginBottom: '1rem',
                  cursor: 'pointer',
                  color: '#0066cc',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← Back
              </button>
            )}

            <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
              {(['local', 'google-drive'] as StorageType[]).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setError(null);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 4,
                    border: activeTab === tab ? '2px solid #0066cc' : '2px solid #ccc',
                    background: activeTab === tab ? '#e8f0fe' : '#fff',
                    cursor: 'pointer',
                    fontWeight: activeTab === tab ? 600 : 400,
                    color: '#111',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                  }}
                >
                  {tab === 'local' ? 'Local Computer' : 'Google Drive'}
                </button>
              ))}
            </div>

            {/* Local Computer panel */}
            {activeTab === 'local' && (
              <div role="tabpanel">
                {resolvedMode === 'new' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      htmlFor="diagram-name"
                      style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}
                    >
                      Diagram name
                    </label>
                    <input
                      id="diagram-name"
                      type="text"
                      value={diagramName}
                      onChange={(e) => setDiagramName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
                <p style={{ color: '#555', fontSize: '0.9rem', margin: '0 0 1rem' }}>
                  {resolvedMode === 'new'
                    ? 'Your browser will ask you to choose a folder and filename. The diagram will autosave to that file automatically.'
                    : 'Your browser will ask you to pick an existing diagram file to open.'}
                </p>
              </div>
            )}

            {/* Google Drive panel */}
            {activeTab === 'google-drive' && (
              <div role="tabpanel">
                {authLoading ? (
                  <p style={{ color: '#555', fontSize: '0.9rem' }}>Connecting…</p>
                ) : !isAuthenticated ? (
                  <>
                    <p style={{ color: '#555', fontSize: '0.9rem', margin: '0 0 1rem' }}>
                      Connect your Google account to save diagrams to Google Drive.
                    </p>
                    {authError && (
                      <p style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '0 0 1rem' }}>
                        {authError}
                      </p>
                    )}
                    <button
                      onClick={authorize}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#4285f4',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      Sign in with Google
                    </button>
                  </>
                ) : (
                  <>
                    {/* New diagram — just name it, saved to appDataFolder */}
                    {resolvedMode === 'new' && (
                      <div style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor="drive-diagram-name"
                          style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}
                        >
                          Diagram name
                        </label>
                        <input
                          id="drive-diagram-name"
                          type="text"
                          value={diagramName}
                          onChange={(e) => setDiagramName(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            border: '1px solid #ccc',
                            borderRadius: 4,
                            boxSizing: 'border-box',
                          }}
                        />
                        <p style={{ color: '#888', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
                          Saved to your Google Drive app data folder (private to this app).
                        </p>
                      </div>
                    )}

                    {/* Open diagram — list files from appDataFolder */}
                    {resolvedMode === 'open' && (
                      <div style={{ marginBottom: '1rem' }}>
                        {driveFilesLoading ? (
                          <p style={{ color: '#555', fontSize: '0.9rem' }}>
                            Loading your diagrams…
                          </p>
                        ) : driveFiles.length === 0 ? (
                          <p style={{ color: '#555', fontSize: '0.9rem' }}>
                            No diagrams found in Google Drive. Create a new diagram first.
                          </p>
                        ) : (
                          <ul
                            style={{
                              listStyle: 'none',
                              padding: 0,
                              margin: 0,
                              maxHeight: 200,
                              overflowY: 'auto',
                              border: '1px solid #eee',
                              borderRadius: 4,
                            }}
                          >
                            {driveFiles.map((file) => (
                              <li
                                key={file.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.5rem 0.75rem',
                                  background:
                                    selectedDriveFileId === file.id ? '#e8f0fe' : 'transparent',
                                  borderBottom: '1px solid #f0f0f0',
                                  cursor: 'pointer',
                                }}
                                onClick={() => {
                                  setSelectedDriveFileId(file.id);
                                  setSelectedDriveFileName(file.name);
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                    {file.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                    {new Date(file.modifiedTime).toLocaleDateString()}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteDriveFile(file.id);
                                  }}
                                  title="Delete"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#999',
                                    fontSize: '1rem',
                                    padding: '0 0.25rem',
                                  }}
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        revoke();
                      }}
                      style={{
                        fontSize: '0.8rem',
                        color: '#666',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Sign out
                    </button>
                  </>
                )}
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  background: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: 4,
                  padding: '0.5rem 0.75rem',
                  color: '#b91c1c',
                  marginBottom: '1rem',
                  fontSize: '0.9rem',
                  marginTop: '1rem',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
              <button
                onClick={handleConfirm}
                disabled={
                  isLoading ||
                  (activeTab === 'google-drive' && !isAuthenticated) ||
                  (activeTab === 'google-drive' && resolvedMode === 'open' && !selectedDriveFileId)
                }
                style={{
                  padding: '0.5rem 1.25rem',
                  background: '#0066cc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                  opacity:
                    isLoading ||
                    (activeTab === 'google-drive' && !isAuthenticated) ||
                    (activeTab === 'google-drive' &&
                      resolvedMode === 'open' &&
                      !selectedDriveFileId)
                      ? 0.5
                      : 1,
                }}
              >
                {isLoading
                  ? resolvedMode === 'new'
                    ? 'Creating…'
                    : 'Opening…'
                  : resolvedMode === 'new'
                    ? 'Create'
                    : 'Open'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
