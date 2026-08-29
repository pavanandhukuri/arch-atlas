import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DefaultResourceLoader, type SettingsManager } from '@earendil-works/pi-coding-agent';
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
  settingsManager?: SettingsManager;
}): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    ...(options.settingsManager ? { settingsManager: options.settingsManager } : {}),
    additionalSkillPaths: [UNDERSTAND_ANYTHING_SKILL_DIR],
    additionalExtensionPaths: [PI_SUBAGENT_EXTENSION_PATH],
    extensionFactories: [secretExclusionExtension],
  });
}

/**
 * Load the loader's resources and verify the vendored skill actually resolved.
 *
 * pi's `createAgentSession` only calls `reload()` on a resource loader it
 * constructs itself — a caller-supplied loader must be reloaded by the caller
 * (see pi's sdk.md "full control" example). Skipping this leaves the session
 * with NO skills and NO extensions: `/skill:understand` passes through as
 * literal prose and, far worse, the FR-015 secret-exclusion extension is
 * silently inert. Caught live in T062 — hence the hard failure here instead
 * of a warning.
 */
export async function loadAndVerifyResources(loader: DefaultResourceLoader): Promise<void> {
  await loader.reload();
  const { skills, diagnostics } = loader.getSkills();
  if (!skills.some((skill) => skill.name === 'understand')) {
    const detail = diagnostics.map((d) => `${d.type}: ${d.message} (${d.path ?? '?'})`).join('; ');
    throw new Error(
      `Vendored "understand" skill did not load from ${UNDERSTAND_ANYTHING_SKILL_DIR}` +
        (detail ? ` — ${detail}` : '')
    );
  }
}
