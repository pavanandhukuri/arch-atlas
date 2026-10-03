import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { GoogleDriveAuthState } from '../../src/hooks/useGoogleDriveAuth';
import type { StorageHandle } from '../../src/services/storage/storage-provider';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../packages/viewer-components/src/components/map-canvas', () => ({
  MapCanvas: vi.fn(() => <div data-testid="map-canvas" />),
}));

vi.mock('../../src/hooks/useGoogleDriveAuth', () => ({
  useGoogleDriveAuth: vi.fn(),
}));

vi.mock('../../src/services/storage/local-file-provider', () => ({
  LocalFileProvider: vi.fn(() => ({ save: vi.fn(), load: vi.fn() })),
}));
vi.mock('../../src/services/storage/google-drive-provider', () => ({
  GoogleDriveProvider: vi.fn(() => ({ save: vi.fn(), load: vi.fn() })),
}));

vi.mock('../../src/components/storage/StoragePromptDialog', () => ({
  StoragePromptDialog: ({
    mode,
    onLocalSelected,
  }: {
    mode: string;
    onLocalSelected: (handle: StorageHandle) => void;
  }) => (
    <div data-testid="storage-prompt" data-mode={mode}>
      <button
        onClick={() =>
          onLocalSelected({
            type: 'local',
            fileName: 'diagram.arch.json',
            ref: {},
            lastKnownModified: null,
          })
        }
      >
        mock-pick-local
      </button>
    </div>
  ),
}));

import StudioPage from '../../src/app/studio-page';
import { useGoogleDriveAuth } from '../../src/hooks/useGoogleDriveAuth';

const mockAuth = (overrides?: Partial<GoogleDriveAuthState>) => {
  const base: GoogleDriveAuthState = {
    accessToken: null,
    isAuthenticated: false,
    authorize: vi.fn(),
    revoke: vi.fn(),
    isLoading: false,
    authError: null,
  };
  (useGoogleDriveAuth as ReturnType<typeof vi.fn>).mockReturnValue({ ...base, ...overrides });
};

async function pickLocalStorage() {
  await userEvent.click(screen.getByText('mock-pick-local'));
}

describe('StudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockAuth();
  });

  it('shows the startup storage prompt on first load with no handle', () => {
    render(<StudioPage />);
    expect(screen.getByTestId('storage-prompt').getAttribute('data-mode')).toBe('startup');
    expect(screen.getByText('Arch Atlas Studio')).toBeDefined();
  });

  it('New creates an empty diagram and renders the canvas once a storage location is picked', async () => {
    render(<StudioPage />);

    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByTestId('storage-prompt').getAttribute('data-mode')).toBe('new');

    await pickLocalStorage();

    await waitFor(() => expect(screen.queryByTestId('storage-prompt')).toBeNull());
    expect(screen.getByTestId('map-canvas')).toBeDefined();
  });

  it('Open stops autosave and re-shows the prompt in "open" mode', async () => {
    render(<StudioPage />);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await pickLocalStorage();

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('storage-prompt').getAttribute('data-mode')).toBe('open');
  });

  it('adding an element from the palette opens the element editor', async () => {
    render(<StudioPage />);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await pickLocalStorage();

    await userEvent.click(screen.getByRole('button', { name: /Add System/i }));

    expect(await screen.findByDisplayValue('New system')).toBeDefined();
  });

  it('a pending import handed off from the Import Wizard skips straight to the "new" prompt', () => {
    sessionStorage.setItem(
      'import_model',
      JSON.stringify({
        schemaVersion: '0.1.0',
        metadata: { title: 'Imported', createdAt: '', updatedAt: '' },
        elements: [],
        relationships: [],
        constraints: [],
        views: [],
      })
    );

    render(<StudioPage />);
    expect(screen.getByTestId('storage-prompt').getAttribute('data-mode')).toBe('new');
  });

  it('clicking "Import Repos" navigates to the import wizard', async () => {
    render(<StudioPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Import Repos' }));
    expect(push).toHaveBeenCalledWith('/import');
  });
});
