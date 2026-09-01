import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRunnerConfig, RunnerConfigError } from '../../src/config.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'runner-config-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(name: string, lines: string[]): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, lines.join('\n'), 'utf8');
  return p;
}

describe('loadRunnerConfig', () => {
  it('returns a RunnerConfig with the localModel block populated', async () => {
    const p = await write('import.yaml', [
      "version: '2.0'",
      'localModel:',
      '  provider: ollama',
      '  endpoint: http://localhost:11434/v1',
      '  modelId: llama3',
      'output:',
      `  directory: ${dir}`,
      'repositories:',
      '  - { path: /repos/a, name: a }',
    ]);
    const config = await loadRunnerConfig(p);
    expect(config.localModel).toMatchObject({
      provider: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      modelId: 'llama3',
    });
  });

  it('throws RunnerConfigError naming the file when `localModel` is absent', async () => {
    const p = await write('no-model.yaml', [
      "version: '2.0'",
      'output:',
      `  directory: ${dir}`,
      'repositories:',
      '  - { path: /repos/a, name: a }',
    ]);
    await expect(loadRunnerConfig(p)).rejects.toThrowError(RunnerConfigError);
    await expect(loadRunnerConfig(p)).rejects.toThrow(/no-model\.yaml/);
  });
});
