import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { secretExclusionExtension } from './secret-exclusion-extension.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..', '..');

export const UNDERSTAND_ANYTHING_SKILL_DIR = join(PACKAGE_ROOT, 'vendor', 'understand-anything');
export const PI_SUBAGENT_EXTENSION_PATH = join(PACKAGE_ROOT, 'vendor', 'pi-subagent', 'index.ts');

/**
 * research.md D6: "full control" pattern — everything this loader resolves is
 * an explicit, package-relative path. No filesystem discovery of a host's
 * `~/.pi/agent/...` — `agentDir` points at a fresh directory dedicated to
 * this run (created by the caller, e.g. under the configured output
 * directory), so there is nothing else to accidentally discover there
 * either. This is what makes every analysis session self-contained and
 * reproducible regardless of what happens to be installed on the machine
 * running the CLI.
 */
export function buildResourceLoader(options: {
  cwd: string;
  agentDir: string;
}): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    additionalSkillPaths: [UNDERSTAND_ANYTHING_SKILL_DIR],
    additionalExtensionPaths: [PI_SUBAGENT_EXTENSION_PATH],
    extensionFactories: [secretExclusionExtension],
  });
}
