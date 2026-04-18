/**
 * Integration test: element formatting colors persist through save → reload cycle.
 * Feature: 003-diagram-enhancements (US3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalFileProvider } from '../../../src/services/storage/local-file-provider';
import type { StorageHandle } from '../../../src/services/storage/storage-provider';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const makeModelWithFormatting = (): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'Formatting Test', description: '', createdAt: '', updatedAt: '' },
  elements: [
    {
      id: 'sys-1',
      kind: 'system',
      name: 'Payment Service',
      formatting: {
        backgroundColor: '#1168bd',
        borderColor: '#0e5fa8',
        fontColor: '#ffffff',
      },
    },
    {
      id: 'sys-2',
      kind: 'system',
      name: 'Auth Service',
      formatting: {
        backgroundColor: '#e67e22',
      },
    },
  ],
  relationships: [],
  constraints: [],
  views: [],
});

const makeWritable = () => ({
  write: vi.fn().mockResolvedValue(undefined),
  truncate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
});

describe('formatting persistence (save → reload)', () => {
  let provider: LocalFileProvider;
  let dbMock: Record<string, unknown>;
  let writtenContent: string;

  beforeEach(() => {
    dbMock = {};
    writtenContent = '';

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

  it('preserves all formatting fields after save and reload', async () => {
    const model = makeModelWithFormatting();

    // Build a file handle whose text() returns whatever was last written
    const writable = makeWritable();
    writable.write = vi.fn().mockImplementation((data: string) => {
      writtenContent = data;
      return Promise.resolve();
    });

    const fileHandle = {
      getFile: vi.fn().mockImplementation(() =>
        Promise.resolve({
          lastModified: 1000,
          text: vi
            .fn()
            .mockImplementation(() => Promise.resolve(writtenContent || JSON.stringify(model))),
        })
      ),
      createWritable: vi.fn().mockResolvedValue(writable),
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    const handle: StorageHandle = {
      type: 'local',
      fileName: 'formatting-test.arch.json',
      ref: fileHandle,
      lastKnownModified: 1000,
    };

    // Save the model with formatting
    const saveResult = await provider.save(handle, model);
    expect((saveResult as { success: true }).success).toBe(true);

    // Verify content was serialized
    expect(writtenContent).toBeTruthy();
    const parsed = JSON.parse(writtenContent) as ArchitectureModel;
    expect(parsed.elements[0]?.formatting).toEqual({
      backgroundColor: '#1168bd',
      borderColor: '#0e5fa8',
      fontColor: '#ffffff',
    });
    expect(parsed.elements[1]?.formatting).toEqual({
      backgroundColor: '#e67e22',
    });

    // Update handle lastKnownModified to match save result
    const updatedHandle: StorageHandle = {
      ...handle,
      lastKnownModified: (saveResult as { success: true; newModified: number }).newModified,
    };

    // Reload from the same handle
    const loadResult = await provider.load(updatedHandle);
    expect((loadResult as { success: true }).success).toBe(true);

    const reloaded = (loadResult as { success: true; model: ArchitectureModel }).model;

    // Assert formatting is identical after reload
    expect(reloaded.elements[0]?.formatting).toEqual({
      backgroundColor: '#1168bd',
      borderColor: '#0e5fa8',
      fontColor: '#ffffff',
    });
    expect(reloaded.elements[1]?.formatting).toEqual({
      backgroundColor: '#e67e22',
    });
  });

  it('preserves undefined formatting (no formatting field) after save and reload', async () => {
    const model: ArchitectureModel = {
      schemaVersion: '0.1.0',
      metadata: { title: 'No Formatting', description: '', createdAt: '', updatedAt: '' },
      elements: [{ id: 'sys-1', kind: 'system', name: 'Plain System' }],
      relationships: [],
      constraints: [],
      views: [],
    };

    const writable = makeWritable();
    writable.write = vi.fn().mockImplementation((data: string) => {
      writtenContent = data;
      return Promise.resolve();
    });

    const fileHandle = {
      getFile: vi.fn().mockImplementation(() =>
        Promise.resolve({
          lastModified: 1000,
          text: vi
            .fn()
            .mockImplementation(() => Promise.resolve(writtenContent || JSON.stringify(model))),
        })
      ),
      createWritable: vi.fn().mockResolvedValue(writable),
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    const handle: StorageHandle = {
      type: 'local',
      fileName: 'no-formatting.arch.json',
      ref: fileHandle,
      lastKnownModified: 1000,
    };

    await provider.save(handle, model);

    const updatedHandle: StorageHandle = { ...handle, lastKnownModified: 1000 };
    const loadResult = await provider.load(updatedHandle);

    const reloaded = (loadResult as { success: true; model: ArchitectureModel }).model;
    expect(reloaded.elements[0]?.formatting).toBeUndefined();
  });

  it('preserves containerSubtype field after save and reload', async () => {
    const model: ArchitectureModel = {
      schemaVersion: '0.1.0',
      metadata: { title: 'Subtype Test', description: '', createdAt: '', updatedAt: '' },
      elements: [
        { id: 'sys-1', kind: 'system', name: 'System' },
        {
          id: 'ctr-1',
          kind: 'container',
          name: 'DB',
          parentId: 'sys-1',
          containerSubtype: 'database',
          formatting: { backgroundColor: '#336791' },
        },
      ],
      relationships: [],
      constraints: [],
      views: [],
    };

    const writable = makeWritable();
    writable.write = vi.fn().mockImplementation((data: string) => {
      writtenContent = data;
      return Promise.resolve();
    });

    const fileHandle = {
      getFile: vi.fn().mockImplementation(() =>
        Promise.resolve({
          lastModified: 1000,
          text: vi
            .fn()
            .mockImplementation(() => Promise.resolve(writtenContent || JSON.stringify(model))),
        })
      ),
      createWritable: vi.fn().mockResolvedValue(writable),
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    const handle: StorageHandle = {
      type: 'local',
      fileName: 'subtype-test.arch.json',
      ref: fileHandle,
      lastKnownModified: 1000,
    };

    await provider.save(handle, model);

    const updatedHandle: StorageHandle = { ...handle, lastKnownModified: 1000 };
    const loadResult = await provider.load(updatedHandle);

    const reloaded = (loadResult as { success: true; model: ArchitectureModel }).model;
    const container = reloaded.elements.find((e) => e.id === 'ctr-1');
    expect(container?.containerSubtype).toBe('database');
    expect(container?.formatting).toEqual({ backgroundColor: '#336791' });
  });
});
