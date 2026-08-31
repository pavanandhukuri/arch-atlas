import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RepoAnalysisSchema } from '@arch-atlas/llm-importer';
import { analyzeRepoLocal } from '../../src/analyze-repo.js';
import { checkLocalModelReachable } from '../../src/reachability.js';

/**
 * Opt-in live check (set RUN_LIVE=1). Runs the real bounded call against a local
 * OpenAI-compatible endpoint over the importer's fixture repos and asserts the
 * result validates and is broadly consistent with the committed pi-produced
 * `apps/llm-importer/test/fixtures/analyses/*.json`.
 *
 *   RUN_LIVE=1 EVAL_MODEL_ENDPOINT=http://127.0.0.1:8000/v1 \
 *   EVAL_MODEL_ID=Qwen3-Coder-30B-A3B-Instruct-MLX-4bit EVAL_MODEL_API_KEY=1234 \
 *   pnpm --filter @arch-atlas/analysis-runner-local test -- live-analyze
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPOS = join(HERE, '../../../../apps/llm-importer/test/fixtures/repos');
const FIXTURE_ANALYSES = join(HERE, '../../../../apps/llm-importer/test/fixtures/analyses');

const model = {
  endpoint: process.env.EVAL_MODEL_ENDPOINT ?? 'http://127.0.0.1:8000/v1',
  modelId: process.env.EVAL_MODEL_ID ?? 'Qwen3-Coder-30B-A3B-Instruct-MLX-4bit',
  ...(process.env.EVAL_MODEL_API_KEY ? { apiKey: process.env.EVAL_MODEL_API_KEY } : {}),
  temperature: Number(process.env.EVAL_TEMPERATURE ?? '0.1'),
};

describe.skipIf(!process.env.RUN_LIVE)('analyzeRepoLocal (live, local endpoint)', () => {
  it('produces a schema-valid analysis whose languages match the committed fixture', async () => {
    await checkLocalModelReachable(model, 3000);

    for (const name of ['user-service', 'gateway']) {
      const res = await analyzeRepoLocal({
        repoName: name,
        input: { repoPath: join(FIXTURE_REPOS, name) },
        endpoint: model.endpoint,
        modelId: model.modelId,
        ...(model.apiKey !== undefined ? { apiKey: model.apiKey } : {}),
        temperature: model.temperature,
      });
      expect(res.status).not.toBe('failed');
      if (res.status === 'failed') return;

      expect(RepoAnalysisSchema.safeParse(res.analysis).success).toBe(true);

      const canned = RepoAnalysisSchema.parse(
        JSON.parse(readFileSync(join(FIXTURE_ANALYSES, `${name}.analysis.json`), 'utf8'))
      );
      // Loose parity: same primary language.
      expect(res.analysis.languages[0]?.toLowerCase()).toBe(canned.languages[0]?.toLowerCase());
    }
  }, 240_000);
});
