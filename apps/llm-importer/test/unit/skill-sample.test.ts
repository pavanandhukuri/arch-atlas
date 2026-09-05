import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepositoryKnowledgeGraphSchema } from '../../src/graph/schema.js';

const PLUGIN_DIR = join(import.meta.dirname, '../../../../plugins/repo-analysis');
const SKILL_DIR = join(PLUGIN_DIR, 'skills/repo-analysis');

describe('plugins/repo-analysis (skill)', () => {
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

  it('SKILL.md names the schema fields and flags the hosted-API trade-off (SK3)', () => {
    const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
    for (const field of [
      'description',
      'languages',
      'frameworks',
      'served',
      'outbound',
      'schemaVersion',
    ]) {
      expect(skill).toContain(field);
    }
    expect(skill.toLowerCase()).toContain('opt-in');
    expect(skill.toLowerCase()).toMatch(/hosted[- ]api|hosted model/);
    expect(skill).toContain('analysis-runner-local'); // points at the offline alternative
  });

  it('README.md states the offline alternative', () => {
    const readme = readFileSync(join(PLUGIN_DIR, 'README.md'), 'utf8');
    expect(readme).toContain('packages/analysis-runner-local');
    expect(readme.toLowerCase()).toContain('offline');
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
