import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const loadConfigMock = vi.fn();
const runImportMock = vi.fn();

vi.mock('../../src/config/loader.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/loader.js')>(
    '../../src/config/loader.js'
  );
  return { ...actual, loadConfig: loadConfigMock };
});
vi.mock('../../src/analysis/run-import.js', () => ({ runImport: runImportMock }));

const {
  runImportCommand,
  runGatherContextCommand,
  runValidateComponentsCommand,
  runAttachComponentsCommand,
  buildProgram,
} = await import('../../src/cli.js');
const { ConfigValidationError } = await import('../../src/config/loader.js');

const VALID_CONFIG = {
  version: '2.0' as const,
  output: { directory: './out' },
  repositories: [{ path: './repo-a', name: 'repo-a' }],
};

beforeEach(() => {
  loadConfigMock.mockReset().mockResolvedValue(VALID_CONFIG);
  runImportMock.mockReset().mockResolvedValue(undefined);
});

describe('runImportCommand', () => {
  it('returns 0 on success and calls runImport once', async () => {
    const code = await runImportCommand('config.yaml', {});
    expect(code).toBe(0);
    expect(runImportMock).toHaveBeenCalledOnce();
  });

  it('returns 1 and does not call runImport on a config validation error', async () => {
    loadConfigMock.mockRejectedValue(new ConfigValidationError('bad config'));
    const code = await runImportCommand('config.yaml', {});
    expect(code).toBe(1);
    expect(runImportMock).not.toHaveBeenCalled();
  });

  it('returns 1 for an unexpected error from runImport', async () => {
    runImportMock.mockRejectedValue(new Error('boom'));
    expect(await runImportCommand('config.yaml', {})).toBe(1);
  });

  it('passes --repos as a parsed, trimmed array and --output through', async () => {
    await runImportCommand('config.yaml', { repos: 'a, b', output: '/custom' });
    expect(runImportMock).toHaveBeenCalledWith(
      VALID_CONFIG,
      expect.objectContaining({ repoNamesFilter: ['a', 'b'], outputDirOverride: '/custom' })
    );
  });

  it('never checks a model endpoint (no reachability gate)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await runImportCommand('config.yaml', {});
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('runGatherContextCommand', () => {
  it('returns 1 on a config validation error', async () => {
    loadConfigMock.mockRejectedValue(new ConfigValidationError('bad'));
    expect(await runGatherContextCommand('config.yaml', {})).toBe(1);
  });
});

describe('runValidateComponentsCommand', () => {
  const VALID_ARTIFACT = {
    schemaVersion: '1.0',
    analyzedAt: '2026-10-03T12:00:00.000Z',
    repository: { name: 'catalog-service', path: 'repos/catalog-service' },
    components: [{ name: 'BookController', kind: 'controller', description: 'Serves /books' }],
    relationships: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };

  let ws: string;
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'validate-components-'));
  });

  it('returns 0 and prints "valid" for a schema-valid file', () => {
    const file = join(ws, 'catalog-service.components.json');
    writeFileSync(file, JSON.stringify(VALID_ARTIFACT));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(runValidateComponentsCommand(file)).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('valid'));
    } finally {
      logSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns 1 and names the field for a schema-invalid file', () => {
    const file = join(ws, 'bad.components.json');
    const { components, ...withoutComponents } = VALID_ARTIFACT;
    void components;
    writeFileSync(file, JSON.stringify(withoutComponents));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(runValidateComponentsCommand(file)).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns 1 for a missing file', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(runValidateComponentsCommand(join(ws, 'nope.json'))).toBe(1);
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns 1 for malformed JSON', () => {
    const file = join(ws, 'malformed.json');
    writeFileSync(file, '{not json');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(runValidateComponentsCommand(file)).toBe(1);
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });
});

describe('runAttachComponentsCommand', () => {
  const MODEL = {
    schemaVersion: '0.1.0',
    metadata: { title: 'Test', createdAt: '', updatedAt: '' },
    elements: [{ id: 'container-1', kind: 'container', name: 'catalog-service', description: '' }],
    relationships: [],
    constraints: [],
    views: [
      {
        id: 'view-1',
        title: 'View',
        level: 'container',
        layout: {
          algorithm: 'deterministic-v1',
          nodes: [{ elementId: 'container-1', x: 0, y: 0 }],
          edges: [],
        },
      },
    ],
  };
  const COMPONENTS = {
    schemaVersion: '1.0',
    analyzedAt: '2026-10-03T12:00:00.000Z',
    repository: { name: 'catalog-service', path: 'repos/catalog-service' },
    components: [{ name: 'BookController', kind: 'controller', description: 'Serves /books' }],
    relationships: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };

  let ws: string;
  let archFile: string;
  let componentsFile: string;
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'attach-components-'));
    archFile = join(ws, 'diagram.arch.json');
    componentsFile = join(ws, 'catalog-service.components.json');
    writeFileSync(archFile, JSON.stringify(MODEL));
    writeFileSync(componentsFile, JSON.stringify(COMPONENTS));
  });

  it('merges in place and returns 0', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = runAttachComponentsCommand(archFile, componentsFile, {
        container: 'catalog-service',
      });
      expect(code).toBe(0);
      const updated = JSON.parse(readFileSync(archFile, 'utf8')) as {
        elements: Array<{ kind: string }>;
      };
      expect(updated.elements.some((e) => e.kind === 'component')).toBe(true);
    } finally {
      logSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('writes to --output instead, leaving the original arch file untouched', () => {
    const outFile = join(ws, 'out.arch.json');
    const before = readFileSync(archFile, 'utf8');
    runAttachComponentsCommand(archFile, componentsFile, {
      container: 'catalog-service',
      output: outFile,
    });
    expect(readFileSync(archFile, 'utf8')).toBe(before);
    const written = JSON.parse(readFileSync(outFile, 'utf8')) as {
      elements: Array<{ kind: string }>;
    };
    expect(written.elements.some((e) => e.kind === 'component')).toBe(true);
  });

  it('returns 1 and writes nothing when --container does not match any container', () => {
    const before = readFileSync(archFile, 'utf8');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(runAttachComponentsCommand(archFile, componentsFile, { container: 'nope' })).toBe(1);
      expect(readFileSync(archFile, 'utf8')).toBe(before);
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns 1 for a components file that fails schema validation', () => {
    writeFileSync(componentsFile, JSON.stringify({ not: 'valid' }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        runAttachComponentsCommand(archFile, componentsFile, { container: 'catalog-service' })
      ).toBe(1);
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('returns 1 for an arch file that is not valid JSON', () => {
    writeFileSync(archFile, '{not json');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        runAttachComponentsCommand(archFile, componentsFile, { container: 'catalog-service' })
      ).toBe(1);
    } finally {
      errSpy.mockRestore();
      rmSync(ws, { recursive: true, force: true });
    }
  });
});

describe('buildProgram — commander wiring', () => {
  it('routes `import <config>` through runImport and leaves exitCode unset on success', async () => {
    const program = buildProgram();
    const prev = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(['node', 'archatlas', 'import', 'config.yaml', '--verbose']);
      expect(runImportMock).toHaveBeenCalledOnce();
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = prev;
    }
  });

  it('sets process.exitCode = 1 on a config validation failure', async () => {
    loadConfigMock.mockRejectedValue(new ConfigValidationError('bad config'));
    const program = buildProgram();
    const prev = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(['node', 'archatlas', 'import', 'bad.yaml']);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prev;
    }
  });

  it('exposes `gather-context`, `validate-components` and `attach-components` subcommands', () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'import',
        'gather-context',
        'validate-components',
        'attach-components',
      ])
    );
  });

  it('no longer accepts --analyze-only', async () => {
    const program = buildProgram().exitOverride();
    await expect(
      program.parseAsync(['node', 'archatlas', 'import', 'config.yaml', '--analyze-only'])
    ).rejects.toThrow();
  });
});
