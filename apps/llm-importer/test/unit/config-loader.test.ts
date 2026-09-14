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
  output: { directory: './out' },
  repositories: [{ path: './repo-a' }],
});

describe('loadConfig', () => {
  it('parses a valid JSON v2.0 config', async () => {
    const path = await writeConfigFile('valid.json', VALID_JSON);
    const config = await loadConfig(path);
    expect(config.version).toBe('2.0');
    expect(config.repositories).toHaveLength(1);
  });

  it('parses a valid YAML v2.0 config', async () => {
    const yamlContents = [
      "version: '2.0'",
      'output:',
      '  directory: ./out',
      'repositories:',
      '  - path: ./repo-a',
      '    name: Repo A',
    ].join('\n');
    const path = await writeConfigFile('valid.yaml', yamlContents);
    const config = await loadConfig(path);
    expect(config.repositories[0]?.name).toBe('Repo A');
  });

  it('ignores an unknown legacy "localModel" block rather than erroring (backward compatible)', async () => {
    const legacy = JSON.stringify({
      version: '2.0',
      localModel: { provider: 'ollama', endpoint: 'http://localhost:11434', modelId: 'llama3' },
      output: { directory: './out' },
      repositories: [{ path: './repo-a' }],
    });
    const path = await writeConfigFile('legacy.json', legacy);
    const config = await loadConfig(path);
    expect(config).not.toHaveProperty('localModel');
    expect(config.repositories).toHaveLength(1);
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
      output: { directory: './out' },
      repositories: [],
    });
    const path = await writeConfigFile('empty-repos.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('rejects a config with more than 50 repositories', async () => {
    const config = JSON.stringify({
      version: '2.0',
      output: { directory: './out' },
      repositories: Array.from({ length: 51 }, (_, i) => ({ path: `./repo-${i}` })),
    });
    const path = await writeConfigFile('too-many-repos.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('parses an optional "systems" block declaring a repo grouping', async () => {
    const config = JSON.stringify({
      version: '2.0',
      output: { directory: './out' },
      repositories: [
        { path: './repo-a', name: 'repo-a' },
        { path: './repo-b', name: 'repo-b' },
      ],
      systems: [{ name: 'Core Platform', repositories: ['repo-a', 'repo-b'] }],
    });
    const path = await writeConfigFile('with-systems.json', config);
    const parsed = await loadConfig(path);
    expect(parsed.systems).toEqual([{ name: 'Core Platform', repositories: ['repo-a', 'repo-b'] }]);
  });

  it('leaves "systems" undefined when the config omits it (backward compatible)', async () => {
    const path = await writeConfigFile('no-systems.json', VALID_JSON);
    const parsed = await loadConfig(path);
    expect(parsed.systems).toBeUndefined();
  });

  it('rejects a systems[] entry with an empty repositories list', async () => {
    const config = JSON.stringify({
      version: '2.0',
      output: { directory: './out' },
      repositories: [{ path: './repo-a' }],
      systems: [{ name: 'Empty', repositories: [] }],
    });
    const path = await writeConfigFile('empty-system.json', config);
    await expect(loadConfig(path)).rejects.toThrow(ConfigValidationError);
  });

  it('rejects an unsupported file extension', async () => {
    const path = await writeConfigFile('config.txt', VALID_JSON);
    await expect(loadConfig(path)).rejects.toThrow(/Unsupported config file extension/);
  });
});
