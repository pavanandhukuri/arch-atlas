// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportModel, parseModelFromText, importModel } from '../../src/services/import-export';
import type { ArchitectureModel } from '@arch-atlas/core-model';

const makeModel = (): ArchitectureModel => ({
  schemaVersion: '0.1.0',
  metadata: { title: 'My Diagram', description: '', createdAt: '', updatedAt: '' },
  elements: [],
  relationships: [],
  constraints: [],
  views: [],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportModel', () => {
  it('triggers a download by creating and clicking an anchor element', () => {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:test-url');
    const revokeObjectURLSpy = vi.fn();
    const appendChildSpy = vi.fn();
    const removeChildSpy = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });
    vi.spyOn(document, 'createElement').mockReturnValue(link as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildSpy);

    exportModel(makeModel());

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
  });

  it('sanitises the model title into a safe filename', () => {
    const link = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:x'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, 'createElement').mockReturnValue(link as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
    vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

    const model = makeModel();
    model.metadata.title = 'My  Diagram!!';
    exportModel(model);

    // Spaces and ! → dashes, consecutive dashes collapsed, trailing dashes stripped
    expect(link.download).toBe('my-diagram.arch.json');
  });

  it('falls back to "diagram" filename when title is empty', () => {
    const link = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:x'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, 'createElement').mockReturnValue(link as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
    vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

    const model = makeModel();
    model.metadata.title = '';
    exportModel(model);

    expect(link.download).toBe('diagram.arch.json');
  });
});

describe('parseModelFromText', () => {
  it('parses valid JSON into a model', () => {
    const model = makeModel();
    const result = parseModelFromText(JSON.stringify(model));
    expect(result.schemaVersion).toBe('0.1.0');
  });

  it('throws for missing schemaVersion', () => {
    const bad = { metadata: {}, elements: [], relationships: [], constraints: [], views: [] };
    expect(() => parseModelFromText(JSON.stringify(bad))).toThrow('Missing schemaVersion');
  });

  it('throws for unknown schemaVersion', () => {
    const bad = { ...makeModel(), schemaVersion: '9.9.9' };
    expect(() => parseModelFromText(JSON.stringify(bad))).toThrow('Unknown schemaVersion');
  });

  it('throws for invalid JSON', () => {
    expect(() => parseModelFromText('{{not json')).toThrow();
  });

  it('throws when unknown top-level fields are present', () => {
    const bad = { ...makeModel(), unknownField: true };
    expect(() => parseModelFromText(JSON.stringify(bad))).toThrow('Unknown fields');
  });
});

describe('importModel', () => {
  it('reads a File and returns the parsed model', async () => {
    const model = makeModel();
    const file = new File([JSON.stringify(model)], 'test.arch.json', { type: 'application/json' });
    const result = await importModel(file);
    expect(result.schemaVersion).toBe('0.1.0');
  });
});
