// Regenerate plugins/repo-analysis/AGENTS.md from the canonical skill (SKILL.md).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadKit, renderAgentsMd } from '../src/agents/kit.js';

const plugin = join(import.meta.dirname, '..', '..', '..', 'plugins', 'repo-analysis');
const kit = loadKit(join(plugin, 'skills', 'import'));
writeFileSync(
  join(plugin, 'AGENTS.md'),
  renderAgentsMd(kit, 'skills/import/sample-analysis.json'),
  'utf8'
);
console.log('wrote plugins/repo-analysis/AGENTS.md');
