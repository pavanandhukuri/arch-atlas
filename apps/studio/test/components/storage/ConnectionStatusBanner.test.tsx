import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConnectionStatusBanner } from '../../../src/components/storage/ConnectionStatusBanner';
import { StorageManager } from '../../../src/services/storage/storage-manager';
import type { ArchitectureModel } from '@archatlas/core-model';
import type {
  StorageHandle,
  StorageProvider,
  StorageError,
} from '../../../src/services/storage/storage-provider';

const makeModel = (): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'Test', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
});

const makeHandle = (): StorageHandle => ({
  type: 'local',
  fileName: 'test.arch.json',
  ref: {},
  lastKnownModified: null,
});

describe('ConnectionStatusBanner', () => {
  it('renders nothing while online', () => {
    const manager = new StorageManager();
    render(<ConnectionStatusBanner storageManager={manager} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the offline banner when a save reports the backend is unreachable', async () => {
    const manager = new StorageManager();
    const error: StorageError = { success: false, code: 'NETWORK_UNAVAILABLE', message: 'offline' };
    const provider: StorageProvider = {
      type: 'local',
      openFile: vi.fn(),
      createFile: vi.fn(),
      save: vi.fn().mockResolvedValue(error),
      load: vi.fn(),
      isAvailable: vi.fn(),
    };
    render(<ConnectionStatusBanner storageManager={manager} />);

    await act(() => manager.manualSave(makeHandle(), provider, makeModel()));

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Google Drive unavailable/i)).toBeDefined();
  });
});
