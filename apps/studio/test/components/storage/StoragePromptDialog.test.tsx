import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { StoragePromptDialog } from '../../../src/components/storage/StoragePromptDialog';
import type { StorageHandle } from '../../../src/services/storage/storage-provider';

// Mock storage preference store
vi.mock('../../../src/state/storage-preference-store', () => ({
  getStoragePreference: vi.fn().mockReturnValue(null),
  setStoragePreference: vi.fn(),
}));

// Mock LocalFileProvider
vi.mock('../../../src/services/storage/local-file-provider', () => ({
  LocalFileProvider: vi.fn().mockImplementation(() => ({
    createFile: vi.fn(),
    openFile: vi.fn(),
  })),
}));

// Mock GoogleDriveProvider
vi.mock('../../../src/services/storage/google-drive-provider', () => ({
  GoogleDriveProvider: vi.fn().mockImplementation(() => ({
    createFile: vi.fn(),
    openFile: vi.fn(),
  })),
}));

const defaultDriveAuth = {
  accessToken: null,
  isAuthenticated: false,
  authorize: () => {},
  revoke: async () => {},
  isLoading: false,
  authError: null,
};

const makeHandle = (): StorageHandle => ({
  type: 'local',
  fileName: 'test.arch.json',
  ref: {},
  lastKnownModified: null,
});

describe('StoragePromptDialog — new mode (US1)', () => {
  const onLocalSelected = vi.fn();
  const onDriveSelected = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with Local Computer and Google Drive options', () => {
    render(
      <StoragePromptDialog
        mode="new"
        onLocalSelected={onLocalSelected}
        onDriveSelected={onDriveSelected}
        driveAuth={defaultDriveAuth}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/local computer/i)).toBeDefined();
    expect(screen.getByText(/google drive/i)).toBeDefined();
  });

  it('pre-selects the last-used storage type from preference store', async () => {
    const { getStoragePreference } = await import('../../../src/state/storage-preference-store');
    vi.mocked(getStoragePreference).mockReturnValue('google-drive');

    render(
      <StoragePromptDialog
        mode="new"
        onLocalSelected={onLocalSelected}
        onDriveSelected={onDriveSelected}
        driveAuth={defaultDriveAuth}
        onClose={onClose}
      />
    );

    // Google Drive tab should be active/selected
    const driveTab = screen.getByRole('tab', { name: /google drive/i });
    expect(driveTab.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onLocalSelected with handle after successful file picker', async () => {
    const { LocalFileProvider } = await import('../../../src/services/storage/local-file-provider');
    const handle = makeHandle();
    vi.mocked(LocalFileProvider).mockImplementation(() => ({
      createFile: vi.fn().mockResolvedValue(handle),
      openFile: vi.fn(),
      save: vi.fn(),
      load: vi.fn(),
      isAvailable: vi.fn(),
      type: 'local' as const,
    }));

    render(
      <StoragePromptDialog
        mode="new"
        onLocalSelected={onLocalSelected}
        onDriveSelected={onDriveSelected}
        driveAuth={defaultDriveAuth}
        onClose={onClose}
      />
    );

    const saveButton = screen.getByRole('button', { name: /^create$/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onLocalSelected).toHaveBeenCalledWith(handle);
    });
  });

  it('shows error message when picker returns an error', async () => {
    const { LocalFileProvider } = await import('../../../src/services/storage/local-file-provider');
    vi.mocked(LocalFileProvider).mockImplementation(() => ({
      createFile: vi.fn().mockResolvedValue({ success: false, code: 'PERMISSION_DENIED', message: 'Cancelled' }),
      openFile: vi.fn(),
      save: vi.fn(),
      load: vi.fn(),
      isAvailable: vi.fn(),
      type: 'local' as const,
    }));

    render(
      <StoragePromptDialog
        mode="new"
        onLocalSelected={onLocalSelected}
        onDriveSelected={onDriveSelected}
        driveAuth={defaultDriveAuth}
        onClose={onClose}
      />
    );

    const saveButton = screen.getByRole('button', { name: /^create$/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(onLocalSelected).not.toHaveBeenCalled();
    });
  });
});
