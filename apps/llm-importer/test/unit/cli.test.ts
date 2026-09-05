import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadConfigMock = vi.fn();
const runImportMock = vi.fn();

vi.mock('../../src/config/loader.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/loader.js')>(
    '../../src/config/loader.js'
  );
  return { ...actual, loadConfig: loadConfigMock };
});
vi.mock('../../src/analysis/run-import.js', () => ({ runImport: runImportMock }));

const { runImportCommand, runGatherContextCommand, buildProgram } =
  await import('../../src/cli.js');
const { ConfigValidationError } = await import('../../src/config/loader.js');

const VALID_CONFIG = {
  version: '2.0' as const,
  output: { directory: './out', diagramFileName: 'architecture.arch.json' },
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

describe('buildProgram — commander wiring', () => {
  it('routes `import <config>` through runImport and leaves exitCode unset on success', async () => {
    const program = buildProgram();
    const prev = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(['node', 'arch-atlas-import', 'import', 'config.yaml', '--verbose']);
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
      await program.parseAsync(['node', 'arch-atlas-import', 'import', 'bad.yaml']);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prev;
    }
  });

  it('exposes a `gather-context` subcommand', () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['import', 'gather-context']));
  });

  it('no longer accepts --analyze-only', async () => {
    const program = buildProgram().exitOverride();
    await expect(
      program.parseAsync(['node', 'arch-atlas-import', 'import', 'config.yaml', '--analyze-only'])
    ).rejects.toThrow();
  });
});
