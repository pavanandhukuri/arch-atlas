import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, ConfigValidationError } from '../../src/config/loader.js';

let tmpDir: string | undefined;

async function writeConfigFile(name: string, contents: string): Promise<string> {
  tmpDir = tmpDir ?? (await mkdtemp(join(tmpdir(), 'arch-atlas-config-test-')));
  const path = join(tmpDir, name);
  await writeFile(path, contents, 'utf8');
  return path;
}

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

const VALID_JSON = JSON.stringify({
  version: '2.0',
  localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
  output: { directory: './out' },
  repositories: [{ path: './repo-a' }],
});

describe('loadConfig', () => {
  it('parses a valid JSON v2.0 config', async () => {
    const path = await writeConfigFile('valid.json', VALID_JSON);
    const config = await loadConfig(path);
    expect(config.version).toBe('2.0');
    expect(config.localModel.provider).toBe('ollama');
    expect(config.repositories).toHaveLength(1);
    expect(config.analysis.maxConcurrency).toBe(1); // default (serial — safest for one local model)
  });

  it('parses a valid YAML v2.0 config', async () => {
    const yamlContents = [
      "version: '2.0'",
      'localModel:',
      '  provider: mlx',
      '  endpoint: http://localhost:8080',
      '  modelId: some-model',
      'output:',
      '  directory: ./out',
      'repositories:',
      '  - path: ./repo-a',
      '    name: Repo A',
    ].join('\n');
    const path = await writeConfigFile('valid.yaml', yamlContents);
    const config = await loadConfig(path);
    expect(config.localModel.provider).toBe('mlx');
    expect(config.repositories[0]?.name).toBe('Repo A');
  });

  it('rejects a v1.0-shaped config with a specific, actionable error', async () => {
    const v1Config = JSON.stringify({
      version: '1.0',
      provider: { type: 'anthropic' },
      output: { directory: './out' },
      repositories: [{ path: './repo-a' }],
    });
    const path = await writeConfigFile('v1.json', v1Config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
    await expect(loadConfig(path)).rejects.toThrow(/v1\.0-style "provider" field/);
  });

  it('rejects a config with no repositories', async () => {
    const config = JSON.stringify({
      version: '2.0',
      localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
      output: { directory: './out' },
      repositories: [],
    });
    const path = await writeConfigFile('empty-repos.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('rejects a config with more than 50 repositories', async () => {
    const config = JSON.stringify({
      version: '2.0',
      localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
      output: { directory: './out' },
      repositories: Array.from({ length: 51 }, (_, i) => ({ path: `./repo-${i}` })),
    });
    const path = await writeConfigFile('too-many-repos.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('rejects maxConcurrency above the hard cap of 8', async () => {
    const config = JSON.stringify({
      version: '2.0',
      localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
      output: { directory: './out' },
      analysis: { maxConcurrency: 20 },
      repositories: [{ path: './repo-a' }],
    });
    const path = await writeConfigFile('too-concurrent.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('rejects an unsupported file extension', async () => {
    const path = await writeConfigFile('config.txt', VALID_JSON);
    await expect(loadConfig(path)).rejects.toThrow(/Unsupported config file extension/);
  });
});
