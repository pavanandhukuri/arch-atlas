import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';

/**
 * The analysis-producer procedure, as an "agent kit": one canonical skill folder
 * (SKILL.md + sample-analysis.json) that `archatlas init` renders into whatever
 * shape each coding agent reads. Nothing here calls a model or the network.
 */

export const AGENTS = ['claude', 'copilot', 'cursor', 'codex', 'generic'] as const;
export type Agent = (typeof AGENTS)[number];

/** Directory name the skill is installed under — the Agent Skills spec requires `name` to match it. */
const SKILL_NAME = 'arch-atlas-import';
const SAMPLE_FILE = 'sample-analysis.json';
/** Where each agent loads project skills from. Codex and generic agents just read AGENTS.md. */
const SKILL_ROOTS = {
  claude: '.claude/skills',
  cursor: '.cursor/skills',
  copilot: '.github/skills',
} as const;
const SAMPLE_DIR = '.archatlas/repo-analysis';
const BLOCK_START = '<!-- archatlas:repo-analysis:start -->';
const BLOCK_END = '<!-- archatlas:repo-analysis:end -->';

export interface Kit {
  description: string;
  /** Procedure text, without frontmatter; it refers to the sample as `sample-analysis.json`. */
  body: string;
  sampleJson: string;
}

export interface PlannedFile {
  path: string;
  content: string;
  /** `block`: a marker-delimited section inside a file the user may also own (AGENTS.md). */
  mode: 'write' | 'block';
}

export type Action = 'created' | 'updated' | 'unchanged';

/** Where the kit lives: shipped beside the compiled code, or — in a source checkout — the plugin folder. */
export function resolveKitDir(explicit?: string): string {
  if (explicit) return explicit;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'agent-kit'),
    join(here, '..', '..', '..', '..', 'plugins', 'repo-analysis', 'skills', 'import'),
  ];
  const found = candidates.find((dir) => existsSync(join(dir, 'SKILL.md')));
  if (!found) throw new Error(`agent kit not found (looked in: ${candidates.join(', ')})`);
  return found;
}

export function loadKit(dir: string): Kit {
  const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n+/.exec(raw);
  if (!match) throw new Error(`${join(dir, 'SKILL.md')} has no frontmatter`);
  const fm = load(match[1] ?? '') as { description?: unknown } | null;
  if (typeof fm?.description !== 'string')
    throw new Error('SKILL.md frontmatter has no description');
  return {
    description: fm.description,
    body: `${raw.slice(match[0].length).trimEnd()}\n`,
    sampleJson: readFileSync(join(dir, SAMPLE_FILE), 'utf8'),
  };
}

const frontmatter = (fields: Record<string, unknown>): string =>
  `---\n${dump(fields, { lineWidth: -1 })}---\n\n`;

const withSamplePath = (body: string, samplePath: string): string =>
  body.replaceAll(SAMPLE_FILE, samplePath);

/** The plain-markdown AGENTS.md form: the procedure with the sample path pointed where the sample lives. */
export function renderAgentsMd(kit: Kit, samplePath: string): string {
  return withSamplePath(kit.body, samplePath);
}

export function parseAgents(csv: string | undefined): Agent[] {
  const names = (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    throw new Error(`--agent is required: one or more of ${AGENTS.join(', ')} (or "all")`);
  }
  if (names.includes('all')) return [...AGENTS];
  const unknown = names.filter((n) => !(AGENTS as readonly string[]).includes(n));
  if (unknown.length > 0) {
    throw new Error(`unknown agent "${unknown.join('", "')}" — valid: ${AGENTS.join(', ')}, all`);
  }
  return [...new Set(names)] as Agent[];
}

/** Copilot Chat's explicit `/arch-atlas-import` command; it hands off to the installed skill. */
function copilotPrompt(): string {
  return (
    frontmatter({
      description:
        'Import this workspace into an arch-atlas diagram (analyze each repo, then run the importer)',
      agent: 'agent',
      'argument-hint': 'path to import.yaml',
    }) +
    `Follow the procedure in [SKILL.md](../skills/${SKILL_NAME}/SKILL.md) for this workspace.\n\n` +
    'Config file: ${input:config:import.yaml}\n'
  );
}

export function agentMenu(): string {
  return [...AGENTS.map((agent, i) => `  ${i + 1}) ${agent}`), '  all'].join('\n');
}

/** Numbers and names, comma-separated, to the CSV `parseAgents` takes. */
export function resolveAnswer(answer: string): string {
  const names = answer
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      if (!/^\d+$/.test(token)) return token;
      const agent = AGENTS[Number(token) - 1];
      if (!agent) throw new Error(`no agent numbered ${token} (choose 1-${AGENTS.length})`);
      return agent;
    });
  if (names.length === 0) throw new Error('--agent is required: pick at least one agent');
  return names.join(',');
}

export function planInit(kit: Kit, agents: Agent[], dir: string): PlannedFile[] {
  const files = new Map<string, PlannedFile>();
  const add = (file: PlannedFile): void => void files.set(file.path, file);
  const sharedSample = join(dir, SAMPLE_DIR, SAMPLE_FILE);
  const sharedSampleRef = `${SAMPLE_DIR}/${SAMPLE_FILE}`;

  for (const agent of agents) {
    const skillRoot = (SKILL_ROOTS as Partial<Record<Agent, string>>)[agent];
    if (skillRoot) {
      // A skill is also its own /slash command in Claude Code and Cursor.
      const skillDir = join(dir, skillRoot, SKILL_NAME);
      add({
        path: join(skillDir, 'SKILL.md'),
        content: frontmatter({ name: SKILL_NAME, description: kit.description }) + kit.body,
        mode: 'write',
      });
      add({ path: join(skillDir, SAMPLE_FILE), content: kit.sampleJson, mode: 'write' });
      if (agent === 'copilot') {
        add({
          path: join(dir, '.github', 'prompts', `${SKILL_NAME}.prompt.md`),
          content: copilotPrompt(),
          mode: 'write',
        });
      }
    } else {
      add({
        path: join(dir, 'AGENTS.md'),
        content: renderAgentsMd(kit, sharedSampleRef),
        mode: 'block',
      });
      add({ path: sharedSample, content: kit.sampleJson, mode: 'write' });
    }
  }
  return [...files.values()];
}

const block = (content: string): string => `${BLOCK_START}\n${content.trimEnd()}\n${BLOCK_END}\n`;

/** Insert or refresh the managed block, leaving everything else in the file exactly as it was. */
function mergeBlock(existing: string | undefined, content: string): string {
  const managed = block(content);
  if (existing === undefined) return managed;
  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    return (
      existing.slice(0, start) + managed + existing.slice(end + BLOCK_END.length).replace(/^\n/, '')
    );
  }
  return `${existing.trimEnd()}\n\n${managed}`;
}

export function applyPlan(
  files: PlannedFile[],
  options: { dryRun: boolean }
): Array<{ path: string; action: Action }> {
  return files.map((file) => {
    const before = existsSync(file.path) ? readFileSync(file.path, 'utf8') : undefined;
    const next = file.mode === 'block' ? mergeBlock(before, file.content) : file.content;
    const action: Action =
      before === undefined ? 'created' : before === next ? 'unchanged' : 'updated';
    if (!options.dryRun && action !== 'unchanged') {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, next, 'utf8');
    }
    return { path: file.path, action };
  });
}
