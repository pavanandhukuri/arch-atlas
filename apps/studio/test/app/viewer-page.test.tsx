import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';

vi.mock('../../../../packages/viewer-components/src/components/map-canvas', () => ({
  MapCanvas: vi.fn(() => <div data-testid="map-canvas" />),
}));

vi.mock('../../src/hooks/useGoogleDriveAuth', () => ({
  useGoogleDriveAuth: vi.fn(),
}));

vi.mock('../../src/services/storage/google-drive-provider', () => ({
  GoogleDriveProvider: vi.fn(),
}));

import { ViewerPage } from '../../src/app/view/[id]/viewer-page';
import { useGoogleDriveAuth } from '../../src/hooks/useGoogleDriveAuth';
import { GoogleDriveProvider } from '../../src/services/storage/google-drive-provider';

const MODEL: ArchitectureModel = {
  schemaVersion: '1.0.0',
  metadata: { title: 'Test' },
  elements: [{ id: 'a', kind: 'system', name: 'Alpha' }],
  relationships: [],
  constraints: [],
  views: [
    {
      id: 'v1',
      level: 'landscape',
      title: 'Main',
      layout: { algorithm: 'grid', nodes: [], edges: [] },
    },
  ],
};

const mockAuth = (overrides?: Partial<ReturnType<typeof useGoogleDriveAuth>>) => {
  const base = { accessToken: 'tok', isAuthenticated: true, authorize: vi.fn() };
  (useGoogleDriveAuth as ReturnType<typeof vi.fn>).mockReturnValue({ ...base, ...overrides });
};

const mockLoad = (result: object) => {
  (GoogleDriveProvider as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(result),
  }));
};

describe('ViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows sign-in prompt when not authenticated', () => {
    mockAuth({ accessToken: null, isAuthenticated: false });
    render(<ViewerPage fileId="file-123" />);
    expect(screen.getByText(/sign in to view/i)).toBeDefined();
  });

  it('calls authorize when sign-in button is clicked', async () => {
    const authorize = vi.fn();
    mockAuth({ accessToken: null, isAuthenticated: false, authorize });
    render(<ViewerPage fileId="file-123" />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(authorize).toHaveBeenCalledOnce();
  });

  it('shows loading indicator while fetching', () => {
    mockAuth();
    mockLoad(new Promise(() => {})); // never resolves
    render(<ViewerPage fileId="file-123" />);
    expect(screen.getByTestId('diagram-viewer-loading')).toBeDefined();
  });

  it('renders diagram after successful load', async () => {
    mockAuth();
    mockLoad({ success: true, model: MODEL, modified: null });
    render(<ViewerPage fileId="file-123" />);
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeDefined());
  });

  it('shows error when load returns success: false', async () => {
    mockAuth();
    mockLoad({ success: false });
    render(<ViewerPage fileId="file-123" />);
    await waitFor(() => expect(screen.getByTestId('diagram-viewer-error')).toBeDefined());
  });

  it('shows error when load throws', async () => {
    mockAuth();
    (GoogleDriveProvider as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      load: vi.fn().mockRejectedValue(new Error('network')),
    }));
    render(<ViewerPage fileId="file-123" />);
    await waitFor(() => expect(screen.getByTestId('diagram-viewer-error')).toBeDefined());
  });

  it('constructs GoogleDriveProvider with the access token', async () => {
    mockAuth({ accessToken: 'my-token' });
    mockLoad({ success: true, model: MODEL, modified: null });
    render(<ViewerPage fileId="file-abc" />);
    await waitFor(() => screen.getByTestId('map-canvas'));
    expect(GoogleDriveProvider).toHaveBeenCalledWith('my-token');
  });
});
