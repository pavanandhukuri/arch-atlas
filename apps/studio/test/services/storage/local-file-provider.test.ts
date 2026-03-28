import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalFileProvider } from '../../../src/services/storage/local-file-provider';
import type { StorageHandle } from '../../../src/services/storage/storage-provider';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const makeModel = (): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'Test', description: '', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
});

const makeWritable = () => ({
  write: vi.fn().mockResolvedValue(undefined),
  truncate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

const makeFileHandle = (lastModified = 1000) => {
  const writable = makeWritable();
  return {
    getFile: vi.fn().mockResolvedValue({
      lastModified,
      text: vi.fn().mockResolvedValue(JSON.stringify(makeModel())),
    }),
    createWritable: vi.fn().mockResolvedValue(writable),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    _writable: writable,
  };
};

describe('LocalFileProvider', () => {
  let provider: LocalFileProvider;
  let dbMock: Record<string, unknown>;

  beforeEach(() => {
    dbMock = {};
    // Stub IndexedDB operations via the idb module mock
    vi.mock('idb', () => ({
      openDB: vi.fn().mockResolvedValue({
        put: vi.fn().mockImplementation((_store: string, value: unknown, key: string) => {
          dbMock[key] = value;
          return Promise.resolve();
        }),
        get: vi.fn().mockImplementation((_store: string, key: string) => {
          return Promise.resolve(dbMock[key] ?? null);
        }),
        delete: vi.fn().mockImplementation((_store: string, key: string) => {
          delete dbMock[key];
          return Promise.resolve();
        }),
      }),
    }));

    provider = new LocalFileProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFile()', () => {
    it('calls showSaveFilePicker with .arch.json filter', async () => {
      const fileHandle = makeFileHandle();
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockResolvedValue(fileHandle));

      const result = await provider.createFile('my-diagram');

      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: 'my-diagram.arch.json',
          types: expect.arrayContaining([
            expect.objectContaining({ accept: { 'application/json': ['.arch.json'] } }),
          ]),
        })
      );
      expect((result as StorageHandle).type).toBe('local');
      expect((result as StorageHandle).fileName).toContain('.arch.json');
    });

    it('returns PERMISSION_DENIED when user cancels picker', async () => {
      vi.stubGlobal('showSaveFilePicker', vi.fn().mockRejectedValue(new DOMException('User aborted', 'AbortError')));

      const result = await provider.createFile('my-diagram');

      expect((result as { success: false; code: string }).code).toBe('PERMISSION_DENIED');
    });

    it('falls back when showSaveFilePicker is not available', async () => {
      vi.stubGlobal('showSaveFilePicker', undefined);

      const result = await provider.createFile('my-diagram');

      // In fallback mode, returns PERMISSION_DENIED (download-on-save, no autosave handle)
      expect((result as { success: false; code: string }).code).toBe('PERMISSION_DENIED');
    });
  });

  describe('save()', () => {
    it('performs full-overwrite: write + truncate + close', async () => {
      const fileHandle = makeFileHandle(1000);
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: fileHandle,
        lastKnownModified: 1000,
      };
      const model = makeModel();

      const result = await provider.save(handle, model);

      expect(fileHandle.createWritable).toHaveBeenCalledTimes(1);
      const w = fileHandle._writable;
      expect(w.write).toHaveBeenCalledTimes(1);
      expect(w.truncate).toHaveBeenCalledTimes(1);
      expect(w.close).toHaveBeenCalledTimes(1);
      expect((result as { success: true }).success).toBe(true);
    });

    it('returns CONFLICT error when lastModified differs from lastKnownModified', async () => {
      const fileHandle = makeFileHandle(2000); // remote is newer
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: fileHandle,
        lastKnownModified: 1000, // client's last known
      };

      const result = await provider.save(handle, makeModel());

      expect((result as { success: false; code: string }).code).toBe('CONFLICT');
    });

    it('skips conflict check when force=true', async () => {
      const fileHandle = makeFileHandle(2000); // remote is newer
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: fileHandle,
        lastKnownModified: 1000,
      };

      const result = await provider.save(handle, makeModel(), { force: true });

      expect((result as { success: true }).success).toBe(true);
    });
  });

  describe('load()', () => {
    it('parses and returns the model from file', async () => {
      const model = makeModel();
      const fileHandle = makeFileHandle(1000);
      fileHandle.getFile = vi.fn().mockResolvedValue({
        lastModified: 1000,
        text: vi.fn().mockResolvedValue(JSON.stringify(model)),
      });
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: fileHandle,
        lastKnownModified: null,
      };

      const result = await provider.load(handle);

      expect((result as { success: true; model: ArchitectureModel }).success).toBe(true);
      expect((result as { success: true; model: ArchitectureModel }).model.schemaVersion).toBe('0.1.0');
    });

    it('returns INVALID_FORMAT for corrupt JSON', async () => {
      const fileHandle = makeFileHandle();
      fileHandle.getFile = vi.fn().mockResolvedValue({
        lastModified: 1000,
        text: vi.fn().mockResolvedValue('not-json{{{'),
      });
      const handle: StorageHandle = {
        type: 'local',
        fileName: 'test.arch.json',
        ref: fileHandle,
        lastKnownModified: null,
      };

      const result = await provider.load(handle);

      expect((result as { success: false; code: string }).code).toBe('INVALID_FORMAT');
    });
  });

  describe('isAvailable()', () => {
    it('returns true when file permission is granted', async () => {
      const fileHandle = makeFileHandle();
      provider['_currentHandle'] = fileHandle as unknown as FileSystemFileHandle;

      const available = await provider.isAvailable();

      expect(available).toBe(true);
    });

    it('returns false when no handle is set', async () => {
      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('openFile()', () => {
    it('calls showOpenFilePicker with .arch.json filter and returns handle + model', async () => {
      const fileHandle = makeFileHandle();
      const openPickerMock = vi.fn().mockResolvedValue([fileHandle]);
      vi.stubGlobal('showOpenFilePicker', openPickerMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(provider as any, '_supportsFileSystemAccess').mockReturnValue(true);

      const result = await provider.openFile();

      expect(openPickerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          types: expect.arrayContaining([
            expect.objectContaining({ accept: { 'application/json': ['.arch.json'] } }),
          ]),
        })
      );
      expect((result as { handle: unknown }).handle).toBeDefined();
      expect((result as { result: { success: boolean } }).result.success).toBe(true);

      vi.unstubAllGlobals();
    });

    it('returns PERMISSION_DENIED when user cancels the picker', async () => {
      const openPickerMock = vi.fn().mockRejectedValue(new DOMException('User cancelled', 'AbortError'));
      vi.stubGlobal('showOpenFilePicker', openPickerMock);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(provider as any, '_supportsFileSystemAccess').mockReturnValue(true);

      const result = await provider.openFile();

      expect((result as { success: false; code: string }).code).toBe('PERMISSION_DENIED');

      vi.unstubAllGlobals();
    });
  });
});
