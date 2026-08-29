import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsManager } from '@earendil-works/pi-coding-agent';
import {
  buildResourceLoader,
  loadAndVerifyResources,
  UNDERSTAND_ANYTHING_SKILL_DIR,
} from '../../src/analysis/resource-loader.js';

let cwd: string;
let agentDir: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'arch-atlas-loader-test-repo-'));
  agentDir = await mkdtemp(join(tmpdir(), 'arch-atlas-loader-test-agent-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  await rm(agentDir, { recursive: true, force: true });
});

describe('buildResourceLoader + loadAndVerifyResources', () => {
  // T062 live-run regression: pi's createAgentSession only reloads a resource
  // loader it constructs itself. A caller-supplied loader that is never
  // reload()ed exposes ZERO skills and ZERO extensions — /skill:understand
  // passes through as literal text and the FR-015 secret-exclusion extension
  // is silently inert. These tests pin the caller-side loading contract.
  it('exposes no skills before loading — the exact state that broke the live run', () => {
    const loader = buildResourceLoader({ cwd, agentDir });
    expect(loader.getSkills().skills).toHaveLength(0);
  });

  it('resolves the vendored understand skill after loading', async () => {
    const loader = buildResourceLoader({
      cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({}),
    });
    await loadAndVerifyResources(loader);

    const { skills } = loader.getSkills();
    const understand = skills.find((s) => s.name === 'understand');
    expect(understand).toBeDefined();
    expect(understand?.filePath).toBe(join(UNDERSTAND_ANYTHING_SKILL_DIR, 'SKILL.md'));
  });

  it('loads the secret-exclusion and pi-subagent extensions after loading (FR-015)', async () => {
    const loader = buildResourceLoader({
      cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({}),
    });
    await loadAndVerifyResources(loader);

    const { extensions, errors } = loader.getExtensions();
    expect(errors).toHaveLength(0);
    expect(extensions.length).toBeGreaterThanOrEqual(2);
  });
});
