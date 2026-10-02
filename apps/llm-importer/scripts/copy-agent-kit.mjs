// Ship the analysis-producer skill (the single canonical copy under plugins/) inside the
// npm package, so `npx @archatlas/llm-importer init` needs no checkout.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, '..', '..', 'plugins', 'repo-analysis', 'skills', 'import');
const to = join(root, 'dist', 'agent-kit');

if (!existsSync(join(from, 'SKILL.md'))) {
  console.error(`agent kit source not found: ${from}`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
