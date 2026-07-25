import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkLocalModelReachable } from '../../src/model-runtime/local-model-runtime.js';
import { buildLocalModelRuntime } from '../../src/model-runtime/local-model-runtime.js';
import { runUnderstand } from '../../src/analysis/run-understand.js';
import { SharedLimiter } from '../../src/concurrency/shared-limiter.js';

/**
 * research.md D12: runs the REAL vendored (trimmed, patched) skill against a
 * real local model — no SDK mocking. Requires an actual Ollama/MLX/OpenAI-
 * compatible server reachable at ARCH_ATLAS_TEST_MODEL_ENDPOINT (default
 * http://localhost:11434) with ARCH_ATLAS_TEST_MODEL_ID pulled and ready.
 *
 * Not run as part of `pnpm test` in ordinary CI, which has no local model
 * server — skipped cleanly (not failed) when the endpoint is unreachable,
 * exactly like the retired Python suite skipped its Neo4j-backed tests.
 */
const ENDPOINT = process.env.ARCH_ATLAS_TEST_MODEL_ENDPOINT ?? 'http://localhost:11434';
const MODEL_ID = process.env.ARCH_ATLAS_TEST_MODEL_ID ?? 'llama3.1:8b';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = join(__dirname, '..', 'fixtures', 'repos', 'user-service');

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
  'single-repo-analysis (integration, real skill + real local model)',
  () => {
    it('produces a valid knowledge graph for the user-service fixture', async (ctx) => {
      if (!modelAvailable) {
        ctx.skip();
        return;
      }

      const { model, modelRuntime } = await buildLocalModelRuntime(
        { provider: 'ollama', endpoint: ENDPOINT, modelId: MODEL_ID },
        FIXTURE_REPO
      );

      const result = await runUnderstand({
        repoName: 'user-service',
        repoPath: FIXTURE_REPO,
        model,
        modelRuntime,
        limiter: new SharedLimiter(1),
        verbose: true,
        onProgress: (line) => {
          console.log(`[user-service] ${line}`);
        },
      });

      expect(result.status).toBe('complete');
      if (result.status === 'complete') {
        expect(result.graph.nodes.length).toBeGreaterThan(0);
        // Known connection in the fixture (publisher.ts explicitly mentions
        // notification-service in its comment) — a capable model should
        // surface it, though this isn't a hard guarantee against every model.
        const mentionsNotification = result.graph.edges.some((e) =>
          e.description?.toLowerCase().includes('notification')
        );
        expect(mentionsNotification).toBe(true);
      }
    }, 300_000); // agent-driven analysis is slow — generous timeout, not the default 5s

    it('the pre-canned fixture artifact is itself schema-valid', async () => {
      const raw = JSON.parse(
        await readFile(
          join(
            __dirname,
            '..',
            'fixtures',
            'knowledge-graphs',
            'user-service.knowledge-graph.json'
          ),
          'utf8'
        )
      ) as unknown;
      const { RepositoryKnowledgeGraphSchema } = await import('../../src/graph/schema.js');
      expect(RepositoryKnowledgeGraphSchema.safeParse(raw).success).toBe(true);
    });
  }
);
