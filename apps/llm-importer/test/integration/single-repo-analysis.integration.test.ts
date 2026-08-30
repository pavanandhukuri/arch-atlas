import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkLocalModelReachable,
  buildLocalModelRuntime,
} from '../../src/model-runtime/local-model-runtime.js';
import { analyzeRepo } from '../../src/analysis/analyze-repo.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { SharedLimiter } from '../../src/concurrency/shared-limiter.js';

/**
 * 008 research.md D10: runs the REAL bounded analysis call against a real local
 * model — no SDK mocking. Requires a reachable Ollama/MLX/OpenAI-compatible
 * server at ARCH_ATLAS_TEST_MODEL_ENDPOINT with ARCH_ATLAS_TEST_MODEL_ID ready.
 * Skipped cleanly in ordinary CI (no local model, and the
 * ARCH_ATLAS_RUN_INTEGRATION_TESTS gate is unset).
 */
const ENDPOINT = process.env.ARCH_ATLAS_TEST_MODEL_ENDPOINT ?? 'http://localhost:11434';
const MODEL_ID = process.env.ARCH_ATLAS_TEST_MODEL_ID ?? 'llama3.1:8b';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const FIXTURE_REPO = join(FIXTURES_DIR, 'repos', 'user-service');

describe('pre-canned analysis fixtures', () => {
  it('every test/fixtures/analyses/*.analysis.json is schema-valid', async () => {
    for (const name of ['user-service', 'notification-service']) {
      const raw = JSON.parse(
        await readFile(join(FIXTURES_DIR, 'analyses', `${name}.analysis.json`), 'utf8')
      ) as unknown;
      expect(RepoAnalysisSchema.safeParse(raw).success).toBe(true);
    }
  });
});

let modelAvailable = false;
beforeAll(async () => {
  try {
    await checkLocalModelReachable(
      { provider: 'ollama', endpoint: ENDPOINT, modelId: MODEL_ID },
      2000
    );
    modelAvailable = true;
  } catch {
    modelAvailable = false;
  }
});

describe.skipIf(!process.env.ARCH_ATLAS_RUN_INTEGRATION_TESTS)(
  'single-repo-analysis (integration, real bounded call + real local model)',
  () => {
    it('produces a schema-valid RepoAnalysis for the user-service fixture', async (ctx) => {
      if (!modelAvailable) {
        ctx.skip();
        return;
      }

      const { model, modelRuntime } = await buildLocalModelRuntime(
        { provider: 'ollama', endpoint: ENDPOINT, modelId: MODEL_ID },
        FIXTURE_REPO
      );

      const result = await analyzeRepo({
        repoName: 'user-service',
        repoPath: FIXTURE_REPO,
        model,
        modelRuntime,
        limiter: new SharedLimiter(1),
        onProgress: (line) => {
          console.log(`[user-service] ${line}`);
        },
      });

      expect(result.status).toBe('complete');
      if (result.status === 'complete') {
        // Schema validity is the hard guarantee; a capable model should also
        // name the stack and surface the Kafka publish, but that isn't
        // asserted strictly (US1 scenario 4 allows empty interface lists).
        expect(RepoAnalysisSchema.safeParse(result.analysis).success).toBe(true);
        expect(result.analysis.repository.name).toBe('user-service');
      }
    }, 120_000);
  }
);
