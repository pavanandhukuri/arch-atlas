import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkLocalModelReachable,
  LocalModelUnreachableError,
  buildLocalModelRuntime,
} from '../../src/model-runtime/local-model-runtime.js';
import type { LocalModelConfig } from '../../src/config/config.schema.js';

let server: Server | undefined;
let workDir: string | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    server = undefined;
  }
  if (workDir) {
    await rm(workDir, { recursive: true, force: true });
    workDir = undefined;
  }
});

async function startEphemeralServer(): Promise<number> {
  server = createServer((_req, res) => res.end('ok'));
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind ephemeral server');
  return address.port;
}

describe('checkLocalModelReachable', () => {
  it('resolves when the endpoint responds (US4 acceptance scenario: reachable)', async () => {
    const port = await startEphemeralServer();
    const config: LocalModelConfig = {
      provider: 'ollama',
      endpoint: `http://127.0.0.1:${port}`,
      modelId: 'llama3',
    };
    await expect(checkLocalModelReachable(config)).resolves.toBeUndefined();
  });

  it('rejects with LocalModelUnreachableError when nothing is listening (US4 acceptance scenario: unreachable)', async () => {
    // Port 1 is reserved/unlikely to have anything listening in a test sandbox.
    const config: LocalModelConfig = {
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:1',
      modelId: 'llama3',
    };
    await expect(checkLocalModelReachable(config, 500)).rejects.toThrow(LocalModelUnreachableError);
  });
});

describe('buildLocalModelRuntime', () => {
  it('registers the configured provider/model and resolves it via ModelRuntime.getModel', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'arch-atlas-runtime-test-'));
    const config: LocalModelConfig = {
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434',
      modelId: 'llama3.1:8b',
    };

    const { model } = await buildLocalModelRuntime(config, workDir);
    expect(model.id).toBe('llama3.1:8b');
    expect(model.provider).toBe('ollama');
  });

  it('writes the configured apiKey and sets authHeader so real API keys reach the server', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'arch-atlas-runtime-test-'));
    const config: LocalModelConfig = {
      provider: 'openai-compatible',
      endpoint: 'http://127.0.0.1:8000/v1',
      modelId: 'some-model',
      apiKey: 'secret-key-123',
    };

    await buildLocalModelRuntime(config, workDir);

    const written = JSON.parse(await readFile(join(workDir, 'models.json'), 'utf8')) as {
      providers: Record<string, { apiKey: string; authHeader: boolean }>;
    };
    expect(written.providers['openai-compatible']?.apiKey).toBe('secret-key-123');
    expect(written.providers['openai-compatible']?.authHeader).toBe(true);
  });

  it('falls back to a placeholder apiKey when none is configured', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'arch-atlas-runtime-test-'));
    const config: LocalModelConfig = {
      provider: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      modelId: 'llama3',
    };

    await buildLocalModelRuntime(config, workDir);

    const written = JSON.parse(await readFile(join(workDir, 'models.json'), 'utf8')) as {
      providers: Record<string, { apiKey: string; authHeader: boolean }>;
    };
    expect(written.providers['ollama']?.apiKey).toBe('not-required');
    expect(written.providers['ollama']?.authHeader).toBe(true);
  });

  it('never makes a hosted/cloud provider available — FR-017 characterization', async () => {
    // getProviders() lists pi's full built-in catalog regardless of
    // configuration (verified empirically) — getAvailable() is the
    // semantically correct check for "actually usable without credentials
    // we never supply," since it only returns providers with valid auth.
    workDir = await mkdtemp(join(tmpdir(), 'arch-atlas-runtime-test-'));
    for (const provider of ['ollama', 'mlx', 'openai-compatible'] as const) {
      const config: LocalModelConfig = {
        provider,
        endpoint: 'http://127.0.0.1:11434',
        modelId: 'm',
      };
      const { modelRuntime } = await buildLocalModelRuntime(config, workDir);
      const hostedIds = ['anthropic', 'openai', 'google', 'azure-openai-responses'];
      for (const hostedId of hostedIds) {
        const available = await modelRuntime.getAvailable(hostedId);
        expect(available).toHaveLength(0);
      }
    }
  });
});
