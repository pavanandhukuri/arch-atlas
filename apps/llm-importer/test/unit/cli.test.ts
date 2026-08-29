import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadConfigMock = vi.fn();
const checkLocalModelReachableMock = vi.fn();
const runImportMock = vi.fn();

vi.mock('../../src/config/loader.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/loader.js')>(
    '../../src/config/loader.js'
  );
  return { ...actual, loadConfig: loadConfigMock };
});
vi.mock('../../src/model-runtime/local-model-runtime.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/model-runtime/local-model-runtime.js')
  >('../../src/model-runtime/local-model-runtime.js');
  return { ...actual, checkLocalModelReachable: checkLocalModelReachableMock };
});
vi.mock('../../src/analysis/run-import.js', () => ({ runImport: runImportMock }));

const { runCli, buildProgram } = await import('../../src/cli.js');
const { ConfigValidationError } = await import('../../src/config/loader.js');
const { LocalModelUnreachableError } =
  await import('../../src/model-runtime/local-model-runtime.js');

const VALID_CONFIG = {
  version: '2.0' as const,
  localModel: {
    provider: 'ollama' as const,
    endpoint: 'http://localhost:11434',
    modelId: 'llama3',
  },
  output: { directory: './out', diagramFileName: 'architecture.arch.json' },
  analysis: { maxFilesPerRepo: 200, excludePatterns: [], forceRefresh: false, maxConcurrency: 2 },
  repositories: [{ path: './repo-a' }],
};

beforeEach(() => {
  loadConfigMock.mockReset().mockResolvedValue(VALID_CONFIG);
  checkLocalModelReachableMock.mockReset().mockResolvedValue(undefined);
  runImportMock.mockReset().mockResolvedValue(undefined);
});

describe('runCli', () => {
  it('returns exit code 0 on a full successful run', async () => {
    const code = await runCli('config.yaml', {});
    expect(code).toBe(0);
    expect(runImportMock).toHaveBeenCalledOnce();
  });

  it('checks local model reachability before calling runImport (US4 scenario 2 ordering)', async () => {
    const callOrder: string[] = [];
    checkLocalModelReachableMock.mockImplementation(() => {
      callOrder.push('reachability-check');
      return Promise.resolve();
    });
    runImportMock.mockImplementation(() => {
      callOrder.push('run-import');
      return Promise.resolve();
    });
    await runCli('config.yaml', {});
    expect(callOrder).toEqual(['reachability-check', 'run-import']);
  });

  it('returns exit code 1 and does not call runImport on a config validation error', async () => {
    loadConfigMock.mockRejectedValue(new ConfigValidationError('bad config'));
    const code = await runCli('config.yaml', {});
    expect(code).toBe(1);
    expect(checkLocalModelReachableMock).not.toHaveBeenCalled();
    expect(runImportMock).not.toHaveBeenCalled();
  });

  it('returns exit code 2 and does not call runImport when the local model is unreachable (contracts/cli-contract.md)', async () => {
    checkLocalModelReachableMock.mockRejectedValue(
      new LocalModelUnreachableError('http://localhost:11434', new Error('ECONNREFUSED'))
    );
    const code = await runCli('config.yaml', {});
    expect(code).toBe(2);
    expect(runImportMock).not.toHaveBeenCalled();
  });

  it('returns exit code 1 for an unexpected error from runImport', async () => {
    runImportMock.mockRejectedValue(new Error('something unexpected'));
    const code = await runCli('config.yaml', {});
    expect(code).toBe(1);
  });

  it('passes --repos as a parsed, trimmed array to runImport', async () => {
    await runCli('config.yaml', { repos: 'service-a, service-b' });
    expect(runImportMock).toHaveBeenCalledWith(
      VALID_CONFIG,
      expect.objectContaining({ repoNamesFilter: ['service-a', 'service-b'] })
    );
  });

  it('passes through --force-refresh, --analyze-only, --aggregate-only, --max-concurrency, --verbose, --output', async () => {
    await runCli('config.yaml', {
      output: '/custom/out',
      forceRefresh: true,
      analyzeOnly: true,
      aggregateOnly: false,
      maxConcurrency: 5,
      verbose: true,
    });
    expect(runImportMock).toHaveBeenCalledWith(
      VALID_CONFIG,
      expect.objectContaining({
        outputDirOverride: '/custom/out',
        forceRefresh: true,
        analyzeOnly: true,
        aggregateOnly: false,
        maxConcurrencyOverride: 5,
        verbose: true,
      })
    );
  });
});

describe('buildProgram (real commander wiring, end-to-end through parseAsync)', () => {
  it('parses argv, invokes runCli via the action callback, and leaves exitCode unset on success', async () => {
    const program = buildProgram();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(['node', 'arch-atlas-import', 'config.yaml', '--verbose']);
      expect(runImportMock).toHaveBeenCalledOnce();
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('sets process.exitCode (not process.exit) on a config validation failure', async () => {
    loadConfigMock.mockRejectedValue(new ConfigValidationError('bad config'));
    const program = buildProgram();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await program.parseAsync(['node', 'arch-atlas-import', 'bad-config.yaml']);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
