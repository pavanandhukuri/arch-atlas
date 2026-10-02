import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import {
  AGENTS,
  applyPlan,
  loadKit,
  agentMenu,
  parseAgents,
  planInit,
  resolveAnswer,
  renderAgentsMd,
  resolveKitDir,
  type Kit,
} from '../../src/agents/kit.js';
import { runInitCommand, buildProgram } from '../../src/cli.js';

const REPO_ROOT = join(import.meta.dirname, '../../../..');
const PLUGIN_DIR = join(REPO_ROOT, 'plugins/repo-analysis');
const KIT_DIR = join(PLUGIN_DIR, 'skills/import');

const MARK_START = '<!-- archatlas:repo-analysis:start -->';
const MARK_END = '<!-- archatlas:repo-analysis:end -->';

let ws: string;
let kit: Kit;
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'agent-kit-'));
  kit = loadKit(KIT_DIR);
});
afterEach(() => {
  rmSync(ws, { recursive: true, force: true });
});

const read = (rel: string) => readFileSync(join(ws, rel), 'utf8');
const frontmatter = (text: string) =>
  loadYaml(/^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '') as Record<string, unknown>;

describe('the skill folder is the single source of truth', () => {
  it('SKILL.md is self-contained: real frontmatter, the full procedure, no link out of its folder', () => {
    const raw = readFileSync(join(KIT_DIR, 'SKILL.md'), 'utf8');
    const fm = frontmatter(raw);
    expect(fm.name).toBe('import');
    expect(String(fm.description)).toContain('arch-atlas');
    expect(raw).not.toContain('../');
    for (const step of ['gather-context', 'analysisStatus', 'Procedure', 'served', 'outbound']) {
      expect(raw).toContain(step);
    }
    // it points at the sample beside it, which must exist in the same folder
    expect(raw).toContain('sample-analysis.json');
    expect(existsSync(join(KIT_DIR, 'sample-analysis.json'))).toBe(true);
  });

  it('the committed plugin AGENTS.md is exactly what the skill renders to (run `pnpm sync:agent-kit` on drift)', () => {
    const committed = readFileSync(join(PLUGIN_DIR, 'AGENTS.md'), 'utf8');
    expect(committed).toBe(renderAgentsMd(kit, 'skills/import/sample-analysis.json'));
  });

  it('the Claude Code and Cursor plugin manifests agree on name and version', () => {
    const claude = JSON.parse(
      readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8')
    ) as { name: string; version: string };
    const cursor = JSON.parse(
      readFileSync(join(PLUGIN_DIR, '.cursor-plugin/plugin.json'), 'utf8')
    ) as { name: string; version: string; description: string };
    expect(cursor.name).toBe(claude.name);
    expect(cursor.version).toBe(claude.version);
    expect(cursor.description).toBeTruthy();
  });
});

describe('resolveKitDir', () => {
  it('finds the kit in a source checkout (no build needed)', () => {
    expect(existsSync(join(resolveKitDir(), 'SKILL.md'))).toBe(true);
  });

  it('honours an explicit directory', () => {
    expect(resolveKitDir('/somewhere')).toBe('/somewhere');
  });
});

describe('parseAgents', () => {
  it('accepts one, several, and "all"', () => {
    expect(parseAgents('cursor')).toEqual(['cursor']);
    expect(parseAgents('claude, cursor')).toEqual(['claude', 'cursor']);
    expect(parseAgents('all')).toEqual([...AGENTS]);
  });

  it('de-duplicates and rejects unknown agents, naming the valid ones', () => {
    expect(parseAgents('cursor,cursor')).toEqual(['cursor']);
    expect(() => parseAgents('vim')).toThrow(/vim.*claude.*copilot.*cursor.*codex.*generic/s);
    expect(() => parseAgents('')).toThrow(/--agent/);
  });
});

describe('interactive agent picker', () => {
  it('lists every agent with a number, plus "all"', () => {
    const menu = agentMenu();
    for (const [i, a] of AGENTS.entries()) expect(menu).toContain(`${i + 1}) ${a}`);
    expect(menu).toContain('all');
  });

  it('turns numbers, names, a mix, or "all" into an agent list', () => {
    expect(resolveAnswer('1')).toBe('claude');
    expect(resolveAnswer('1, 3')).toBe('claude,cursor');
    expect(resolveAnswer('copilot, 3')).toBe('copilot,cursor');
    expect(resolveAnswer('all')).toBe('all');
  });

  it('rejects an out-of-range number and an empty answer', () => {
    expect(() => resolveAnswer('9')).toThrow(/9/);
    expect(() => resolveAnswer('  ')).toThrow(/--agent/);
  });
});

describe('planInit', () => {
  it('claude → a project skill folder, named after its directory', () => {
    const files = planInit(kit, ['claude'], ws);
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        join(ws, '.claude/skills/arch-atlas-import/SKILL.md'),
        join(ws, '.claude/skills/arch-atlas-import/sample-analysis.json'),
      ].sort()
    );
    const skill = files.find((f) => f.path.endsWith('SKILL.md'));
    const fm = frontmatter(skill?.content ?? '');
    expect(fm.name).toBe('arch-atlas-import'); // the spec requires name == directory
    expect(fm.description).toBe(kit.description);
    expect(skill?.content).toContain('sample-analysis.json');
  });

  it('cursor → the same skill under .cursor/skills (a skill is also its /slash command)', () => {
    const files = planInit(kit, ['cursor'], ws);
    expect(files.map((f) => f.path).sort()).toEqual(
      [
        join(ws, '.cursor/skills/arch-atlas-import/SKILL.md'),
        join(ws, '.cursor/skills/arch-atlas-import/sample-analysis.json'),
      ].sort()
    );
    const fm = frontmatter(files.find((f) => f.path.endsWith('SKILL.md'))?.content ?? '');
    expect(fm.name).toBe('arch-atlas-import');
  });

  it('copilot → the skill under .github/skills plus an explicit /arch-atlas-import prompt file', () => {
    const files = planInit(kit, ['copilot'], ws);
    const paths = files.map((f) => f.path);
    expect(paths).toContain(join(ws, '.github/skills/arch-atlas-import/SKILL.md'));
    const prompt = files.find((f) => f.path.endsWith('.prompt.md'));
    expect(prompt?.path).toBe(join(ws, '.github/prompts/arch-atlas-import.prompt.md'));
    const fm = frontmatter(prompt?.content ?? '');
    expect(fm.agent).toBe('agent');
    expect(String(fm.description)).toBeTruthy();
    expect(fm['argument-hint']).toBeTruthy();
    // links the installed skill (resolvable relative to .github/prompts) and takes the config as input
    expect(prompt?.content).toContain('(../skills/arch-atlas-import/SKILL.md)');
    expect(prompt?.content).toContain('${input:config:import.yaml}');
  });

  it('codex and generic → one managed AGENTS.md block plus the sample', () => {
    for (const agent of ['codex', 'generic'] as const) {
      const files = planInit(kit, [agent], ws);
      const agents = files.find((f) => f.path === join(ws, 'AGENTS.md'));
      expect(agents?.mode).toBe('block');
      expect(agents?.content).toContain('.archatlas/repo-analysis/sample-analysis.json');
    }
  });

  it('codex + generic together do not write AGENTS.md twice', () => {
    const files = planInit(kit, ['codex', 'generic'], ws);
    expect(files.filter((f) => f.path === join(ws, 'AGENTS.md'))).toHaveLength(1);
  });
});

describe('applyPlan', () => {
  it('writes every planned file and reports them', () => {
    const files = planInit(kit, ['claude', 'cursor', 'generic'], ws);
    const written = applyPlan(files, { dryRun: false });
    expect(written).toHaveLength(files.length);
    expect(read('.claude/skills/arch-atlas-import/SKILL.md')).toContain('gather-context');
    expect(read('.cursor/skills/arch-atlas-import/SKILL.md')).toContain('gather-context');
    expect(
      (
        JSON.parse(read('.archatlas/repo-analysis/sample-analysis.json')) as {
          schemaVersion: string;
        }
      ).schemaVersion
    ).toBe('1.0');
  });

  it('--dry-run touches nothing', () => {
    applyPlan(planInit(kit, ['claude', 'generic'], ws), { dryRun: true });
    expect(existsSync(join(ws, '.claude'))).toBe(false);
    expect(existsSync(join(ws, 'AGENTS.md'))).toBe(false);
  });

  it('is idempotent: running twice leaves byte-identical files', () => {
    const run = () =>
      applyPlan(planInit(kit, ['claude', 'cursor', 'copilot', 'generic'], ws), { dryRun: false });
    run();
    const tracked = [
      '.claude/skills/arch-atlas-import/SKILL.md',
      '.github/prompts/arch-atlas-import.prompt.md',
      'AGENTS.md',
    ];
    const first = tracked.map(read);
    run();
    const second = tracked.map(read);
    expect(second).toEqual(first);
    expect(read('AGENTS.md').split(MARK_START)).toHaveLength(2); // one block, not two
  });

  it('adds its block to an existing AGENTS.md without touching what is already there', () => {
    writeFileSync(join(ws, 'AGENTS.md'), '# My project\n\nUse tabs.\n');
    applyPlan(planInit(kit, ['generic'], ws), { dryRun: false });
    const text = read('AGENTS.md');
    expect(text.startsWith('# My project\n\nUse tabs.\n')).toBe(true);
    expect(text).toContain(MARK_START);
    expect(text).toContain(MARK_END);
  });

  it('refreshes only its own block on re-run, leaving surrounding edits alone', () => {
    applyPlan(planInit(kit, ['generic'], ws), { dryRun: false });
    writeFileSync(join(ws, 'AGENTS.md'), `Header line\n\n${read('AGENTS.md')}\nFooter line\n`);
    // simulate a stale block, then re-run
    writeFileSync(
      join(ws, 'AGENTS.md'),
      read('AGENTS.md').replace(
        /(<!-- archatlas:repo-analysis:start -->)[\s\S]*?(<!-- archatlas:repo-analysis:end -->)/,
        '$1\nSTALE\n$2'
      )
    );
    applyPlan(planInit(kit, ['generic'], ws), { dryRun: false });
    const text = read('AGENTS.md');
    expect(text).not.toContain('STALE');
    expect(text).toContain('Header line');
    expect(text).toContain('Footer line');
    expect(text).toContain('gather-context');
  });

  it('creates missing parent directories', () => {
    mkdirSync(join(ws, 'deep'));
    applyPlan(planInit(kit, ['copilot'], join(ws, 'deep')), { dryRun: false });
    expect(existsSync(join(ws, 'deep/.github/skills/arch-atlas-import/SKILL.md'))).toBe(true);
  });
});

describe('runInitCommand / CLI wiring', () => {
  it('returns 0 and writes files for a valid agent', () => {
    expect(runInitCommand({ agent: 'claude', dir: ws, kit: KIT_DIR })).toBe(0);
    expect(existsSync(join(ws, '.claude/skills/arch-atlas-import/SKILL.md'))).toBe(true);
  });

  it('returns 1 for an unknown agent and writes nothing', () => {
    expect(runInitCommand({ agent: 'vim', dir: ws, kit: KIT_DIR })).toBe(1);
    expect(existsSync(join(ws, '.claude'))).toBe(false);
  });

  it('returns 1 when no --agent is given', () => {
    expect(runInitCommand({ dir: ws, kit: KIT_DIR })).toBe(1);
  });

  it('returns 1 when the kit directory is missing', () => {
    expect(runInitCommand({ agent: 'claude', dir: ws, kit: join(ws, 'nope') })).toBe(1);
  });

  it('registers an `init` subcommand with --agent, --dir and --dry-run', () => {
    const init = buildProgram().commands.find((c) => c.name() === 'init');
    expect(init).toBeDefined();
    const flags = init?.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--agent', '--dir', '--dry-run']));
  });
});
