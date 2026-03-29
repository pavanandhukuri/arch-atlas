import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StorageHandle } from '../../../src/services/storage/storage-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_ACCESS_TOKEN = 'ya29.mock-access-token';
const MOCK_FILE_ID = 'drive-file-id-abc123';
const MOCK_MODIFIED_TIME = '2026-03-19T10:00:00.000Z';
const MOCK_MODIFIED_TIME_NEWER = '2026-03-19T11:00:00.000Z';

const MINIMAL_MODEL = {
  schemaVersion: '0.1.0',
  metadata: { title: 'Test', description: '', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
};

function makeDriveHandle(overrides: Partial<StorageHandle> = {}): StorageHandle {
  return {
    type: 'google-drive',
    fileName: 'diagram.arch.json',
    ref: MOCK_FILE_ID,
    lastKnownModified: MOCK_MODIFIED_TIME,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GoogleDriveProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // createFile()
  // -------------------------------------------------------------------------

  describe('createFile()', () => {
    it('POSTs to Drive v3 multipart upload endpoint with Bearer token', async () => {
      // Mock folder picker — Drive picker resolves with a folder ID
      // Mock metadata fetch (modifiedTime after creation)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: MOCK_FILE_ID, modifiedTime: MOCK_MODIFIED_TIME }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.createFile('diagram');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('upload/drive/v3/files'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_ACCESS_TOKEN}`,
          }),
        })
      );
    });

    it('returns a StorageHandle with type=google-drive and driveFileId as ref', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: MOCK_FILE_ID, modifiedTime: MOCK_MODIFIED_TIME }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.createFile('diagram');

      expect(result).toMatchObject({
        type: 'google-drive',
        ref: MOCK_FILE_ID,
        lastKnownModified: MOCK_MODIFIED_TIME,
      });
      expect((result as StorageHandle).fileName).toContain('diagram');
    });

    it('returns AUTH_REQUIRED error when Drive API returns 401', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid Credentials' } }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.createFile('diagram');

      expect(result).toMatchObject({
        success: false,
        code: 'AUTH_REQUIRED',
      });
    });

    it('returns NETWORK_UNAVAILABLE error when fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.createFile('diagram');

      expect(result).toMatchObject({
        success: false,
        code: 'NETWORK_UNAVAILABLE',
      });
    });
  });

  // -------------------------------------------------------------------------
  // save()
  // -------------------------------------------------------------------------

  describe('save()', () => {
    it('GETs modifiedTime before writing (conflict check)', async () => {
      // First call: GET metadata for conflict check
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME }),
      });
      // Second call: PATCH upload
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: MOCK_FILE_ID, modifiedTime: MOCK_MODIFIED_TIME_NEWER }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      await provider.save(handle, MINIMAL_MODEL as never);

      const [firstCallUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(firstCallUrl).toContain(`drive/v3/files/${MOCK_FILE_ID}`);
      expect(firstCallUrl).toContain('modifiedTime');
    });

    it('PATCHes the file with multipart body after conflict check passes', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: MOCK_FILE_ID, modifiedTime: MOCK_MODIFIED_TIME_NEWER }),
        });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      const result = await provider.save(handle, MINIMAL_MODEL as never);

      const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(patchUrl).toContain(`upload/drive/v3/files/${MOCK_FILE_ID}`);
      expect((patchInit as RequestInit).method).toBe('PATCH');
      expect(((patchInit as RequestInit).headers as Record<string, string>)?.Authorization).toBe(
        `Bearer ${MOCK_ACCESS_TOKEN}`
      );

      expect(result).toMatchObject({
        success: true,
        newModified: MOCK_MODIFIED_TIME_NEWER,
      });
    });

    it('returns CONFLICT error when remote modifiedTime differs from lastKnownModified', async () => {
      // Remote has a newer modifiedTime than handle.lastKnownModified
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME_NEWER }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      // handle.lastKnownModified is the older timestamp
      const handle = makeDriveHandle({ lastKnownModified: MOCK_MODIFIED_TIME });

      const result = await provider.save(handle, MINIMAL_MODEL as never);

      expect(result).toMatchObject({
        success: false,
        code: 'CONFLICT',
        conflict: {
          remoteModified: MOCK_MODIFIED_TIME_NEWER,
          clientLastKnown: MOCK_MODIFIED_TIME,
        },
      });
      // Should NOT have called PATCH
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('skips conflict check and PATCHes when force=true', async () => {
      // Only PATCH call — no GET
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: MOCK_FILE_ID, modifiedTime: MOCK_MODIFIED_TIME_NEWER }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      const result = await provider.save(handle, MINIMAL_MODEL as never, { force: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('upload/drive/v3/files');
      expect((init as RequestInit).method).toBe('PATCH');
      expect(result).toMatchObject({ success: true });
    });

    it('returns NETWORK_UNAVAILABLE when fetch throws during PATCH', async () => {
      // GET metadata succeeds (no conflict)
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME }),
        })
        .mockRejectedValueOnce(new TypeError('Network error'));

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      const result = await provider.save(handle, MINIMAL_MODEL as never);

      expect(result).toMatchObject({
        success: false,
        code: 'NETWORK_UNAVAILABLE',
      });
    });
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------

  describe('load()', () => {
    it('GETs file content via alt=media and returns parsed model', async () => {
      const modelJson = JSON.stringify(MINIMAL_MODEL);
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => modelJson,
        });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      const result = await provider.load(handle);

      expect(result).toMatchObject({
        success: true,
        model: MINIMAL_MODEL,
        modified: MOCK_MODIFIED_TIME,
      });

      const mediaCallUrl = fetchMock.mock.calls[1]?.[0] as string;
      expect(mediaCallUrl).toContain('alt=media');
      expect(mediaCallUrl).toContain(MOCK_FILE_ID);
    });

    it('returns INVALID_FORMAT when file content is malformed JSON', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'not valid json {{',
        });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);
      const handle = makeDriveHandle();

      const result = await provider.load(handle);

      expect(result).toMatchObject({
        success: false,
        code: 'INVALID_FORMAT',
      });
    });
  });

  // -------------------------------------------------------------------------
  // isAvailable()
  // -------------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('returns true when Drive about endpoint responds with 200', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { displayName: 'Test User' } }),
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const available = await provider.isAvailable();

      expect(available).toBe(true);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('drive/v3/about');
    });

    it('returns false when network fetch throws (unreachable)', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('returns false when Drive API responds with 401 (token expired)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // openFile() — T037/T039 (US3)
  // -------------------------------------------------------------------------

  describe('openFile()', () => {
    it('returns NOT_IMPLEMENTED when called without a fileId (picker must be shown by UI)', async () => {
      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.openFile();

      expect(result).toMatchObject({
        success: false,
        code: 'NOT_IMPLEMENTED',
      });
    });

    it('fetches metadata + content and returns handle + LoadResult when fileId is provided', async () => {
      const MOCK_MODEL = {
        schemaVersion: '0.1.0',
        metadata: { title: 'Test', description: '', createdAt: '', updatedAt: '' },
        elements: [],
        relationships: [],
        constraints: [],
        views: [],
      };
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME, name: 'diagram.arch.json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(MOCK_MODEL),
        });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.openFile(MOCK_FILE_ID, 'diagram.arch.json');

      const outcome = result as { handle: StorageHandle; result: { success: true; model: unknown; modified: string } };
      expect(outcome.handle).toMatchObject({
        type: 'google-drive',
        ref: MOCK_FILE_ID,
        lastKnownModified: MOCK_MODIFIED_TIME,
        fileName: 'diagram.arch.json',
      });
      expect(outcome.result.success).toBe(true);
      expect(outcome.result.modified).toBe(MOCK_MODIFIED_TIME);
      // Content fetched via alt=media
      const mediaCallUrl = fetchMock.mock.calls[1]?.[0] as string;
      expect(mediaCallUrl).toContain('alt=media');
      expect(mediaCallUrl).toContain(MOCK_FILE_ID);
    });

    it('returns INVALID_FORMAT when opened file has corrupt JSON', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ modifiedTime: MOCK_MODIFIED_TIME, name: 'bad.arch.json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'not-valid-json{{',
        });

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.openFile(MOCK_FILE_ID, 'bad.arch.json');

      expect(result).toMatchObject({ success: false, code: 'INVALID_FORMAT' });
    });

    it('returns NETWORK_UNAVAILABLE when metadata fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Network error'));

      const { GoogleDriveProvider } = await import(
        '../../../src/services/storage/google-drive-provider'
      );
      const provider = new GoogleDriveProvider(MOCK_ACCESS_TOKEN);

      const result = await provider.openFile(MOCK_FILE_ID, 'diagram.arch.json');

      expect(result).toMatchObject({ success: false, code: 'NETWORK_UNAVAILABLE' });
    });
  });
});
