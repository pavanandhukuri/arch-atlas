import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepositoryKnowledgeGraphSchema } from '../../src/graph/schema.js';

const PLUGIN_DIR = join(import.meta.dirname, '../../../../plugins/repo-analysis');
const SKILL_DIR = join(PLUGIN_DIR, 'skills/repo-analysis');

describe('plugins/repo-analysis (skill/plugin)', () => {
  it('sample-analysis.json satisfies RepoAnalysisSchema (SK1)', () => {
    const raw = JSON.parse(
      readFileSync(join(SKILL_DIR, 'sample-analysis.json'), 'utf8')
    ) as unknown;
    const parsed = RepoAnalysisSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it('the sample flows through toCorrelationGraph into a valid knowledge graph', () => {
    const analysis = RepoAnalysisSchema.parse(
      JSON.parse(readFileSync(join(SKILL_DIR, 'sample-analysis.json'), 'utf8'))
    );
    const graph = toCorrelationGraph(analysis);
    expect(RepositoryKnowledgeGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('AGENTS.md is the canonical, tool-neutral procedure and names the schema fields (SK3)', () => {
    const agentsMd = readFileSync(join(PLUGIN_DIR, 'AGENTS.md'), 'utf8');
    for (const field of [
      'description',
      'languages',
      'frameworks',
      'served',
      'outbound',
      'schemaVersion',
    ]) {
      expect(agentsMd).toContain(field);
    }
    // No frontmatter — AGENTS.md is plain markdown per the agents.md convention, not a
    // Claude-Code-specific skill file.
    expect(agentsMd.startsWith('---')).toBe(false);
  });

  it('SKILL.md is a thin Claude Code wrapper pointing at AGENTS.md', () => {
    const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
    expect(skill).toContain('name: repo-analysis');
    expect(skill).toContain('../../AGENTS.md');
  });

  it('README.md advertises multi-agent compatibility, not a single hosted/local trade-off', () => {
    const readme = readFileSync(join(PLUGIN_DIR, 'README.md'), 'utf8');
    expect(readme.toLowerCase()).toContain('agents.md');
    expect(readme).toContain('AGENTS.md');
    // The importer core stays model-free — this file must not claim otherwise.
    expect(readme.toLowerCase()).not.toContain('sends');
  });

  it('plugin.json declares a valid manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8')
    ) as { name?: string; description?: string; version?: string };
    expect(manifest.name).toBe('arch-atlas-repo-analysis');
    expect(manifest.description).toBeTruthy();
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
