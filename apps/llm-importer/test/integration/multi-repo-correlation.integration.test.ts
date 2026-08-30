import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkLocalModelReachable,
  buildLocalModelRuntime,
} from '../../src/model-runtime/local-model-runtime.js';
import { analyzeRepo } from '../../src/analysis/analyze-repo.js';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';
import { SharedLimiter } from '../../src/concurrency/shared-limiter.js';
import { correlateDeterministically } from '../../src/correlate/deterministic-correlator.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const ENDPOINT = process.env.ARCH_ATLAS_TEST_MODEL_ENDPOINT ?? 'http://localhost:11434';
const MODEL_ID = process.env.ARCH_ATLAS_TEST_MODEL_ID ?? 'llama3.1:8b';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

async function fixtureGraph(repoName: string, realPath = false): Promise<RepositoryKnowledgeGraph> {
  const raw = JSON.parse(
    await readFile(join(FIXTURES_DIR, 'analyses', `${repoName}.analysis.json`), 'utf8')
  ) as unknown;
  const analysis = RepoAnalysisSchema.parse(raw);
  if (realPath) analysis.repository.path = join(FIXTURES_DIR, 'repos', repoName);
  return toCorrelationGraph(analysis);
}

describe('multi-repo correlation over pre-canned analysis fixtures (no model)', () => {
  it('finds the user-service -> notification-service topic connection from graph text', async () => {
    // Fake paths → evidence passes degrade to graph-only; the adapter puts the
    // outbound intent's prose on an edge, so the name-mention pass connects them.
    const graphs = [await fixtureGraph('user-service'), await fixtureGraph('notification-service')];
    const { connections } = correlateDeterministically(graphs);
    expect(
      connections.some(
        (c) => c.sourceRepo === 'user-service' && c.targetRepo === 'notification-service'
      )
    ).toBe(true);
  });

  it('finds evidence-grounded connections when repo paths are real', async () => {
    const graphs = [
      await fixtureGraph('user-service', true),
      await fixtureGraph('notification-service', true),
    ];
    const { connections, passSummaries } = correlateDeterministically(graphs);

    // Endpoint pass: user-service calls /api/notifications/v1/send; notification-service
    // serves /v1/send (an `endpoint` node the adapter synthesised from the
    // analysis) — the gateway-prefixed match the name-mention pass misses.
    const gatewayCall = connections.find(
      (c) =>
        c.foundBy === 'evidence' &&
        c.type === 'calls' &&
        c.sourceRepo === 'user-service' &&
        c.targetRepo === 'notification-service'
    );
    expect(gatewayCall).toBeDefined();
    expect(gatewayCall?.evidence[0]).toContain('/api/notifications/v1/send');
    expect(passSummaries.some((s) => s.startsWith('endpoint:'))).toBe(true);

    // Determinism.
    const again = correlateDeterministically(graphs);
    expect(JSON.stringify(again.connections)).toBe(JSON.stringify(connections));
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
  'multi-repo-correlation (integration, real bounded call + real local model)',
  () => {
    it('analyzes both fixture repos with the bounded call and correlates a connection', async (ctx) => {
      if (!modelAvailable) {
        ctx.skip();
        return;
      }

      const { model, modelRuntime } = await buildLocalModelRuntime(
        { provider: 'ollama', endpoint: ENDPOINT, modelId: MODEL_ID },
        FIXTURES_DIR
      );
      const limiter = new SharedLimiter(2);

      const results = await Promise.all(
        ['user-service', 'notification-service'].map((repoName) =>
          analyzeRepo({
            repoName,
            repoPath: join(FIXTURES_DIR, 'repos', repoName),
            model,
            modelRuntime,
            limiter,
          })
        )
      );

      const graphs = results.flatMap((r) =>
        r.status === 'complete' ? [toCorrelationGraph(r.analysis)] : []
      );
      expect(graphs.length).toBe(2);

      const { connections } = correlateDeterministically(graphs);
      expect(connections.length).toBeGreaterThan(0);
    }, 240_000);
  }
);
