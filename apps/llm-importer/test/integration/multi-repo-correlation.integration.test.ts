import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  checkLocalModelReachable,
  buildLocalModelRuntime,
} from '../../src/model-runtime/local-model-runtime.js';
import { runUnderstand } from '../../src/analysis/run-understand.js';
import { SharedLimiter } from '../../src/concurrency/shared-limiter.js';
import { correlateDeterministically } from '../../src/correlate/deterministic-correlator.js';
import {
  RepositoryKnowledgeGraphSchema,
  type RepositoryKnowledgeGraph,
} from '../../src/graph/schema.js';

const ENDPOINT = process.env.ARCH_ATLAS_TEST_MODEL_ENDPOINT ?? 'http://localhost:11434';
const MODEL_ID = process.env.ARCH_ATLAS_TEST_MODEL_ID ?? 'llama3.1:8b';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

async function loadFixtureGraph(repoName: string): Promise<RepositoryKnowledgeGraph> {
  const raw = JSON.parse(
    await readFile(
      join(FIXTURES_DIR, 'knowledge-graphs', `${repoName}.knowledge-graph.json`),
      'utf8'
    )
  ) as unknown;
  return RepositoryKnowledgeGraphSchema.parse(raw);
}

describe('multi-repo correlation against real (non-LLM-generated) fixture graphs', () => {
  // No local model required for this part — the deterministic correlator
  // (research.md D7 pass 1) is pure logic over already-produced knowledge
  // graphs. This runs in ordinary CI, unlike the agentic half below.
  it('finds the known user-service -> notification-service Kafka connection deterministically', async () => {
    const userService = await loadFixtureGraph('user-service');
    const notificationService = await loadFixtureGraph('notification-service');

    const { connections, unresolvedPairs } = correlateDeterministically([
      userService,
      notificationService,
    ]);

    expect(connections.length).toBeGreaterThan(0);
    expect(
      connections.some(
        (c) => c.sourceRepo === 'user-service' && c.targetRepo === 'notification-service'
      )
    ).toBe(true);
    expect(unresolvedPairs).toHaveLength(0);
  });

  it('finds evidence-grounded connections when the recorded repo paths are real', async () => {
    // Same graphs, but pointed at the actual fixture repositories on disk —
    // the evidence passes then read raw source, independent of graph prose.
    const userService = await loadFixtureGraph('user-service');
    const notificationService = await loadFixtureGraph('notification-service');
    userService.repository.path = join(FIXTURES_DIR, 'repos', 'user-service');
    notificationService.repository.path = join(FIXTURES_DIR, 'repos', 'notification-service');

    const { connections, passSummaries } = correlateDeterministically([
      userService,
      notificationService,
    ]);

    // The asserted evidence connection is the endpoint gateway-suffix match:
    // user-service calls /api/notifications/v1/send; notification-service
    // registers /v1/send — the uds-sdk pattern the name-mention pass misses.
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

    // Determinism: a second run over the same inputs yields identical output.
    const again = correlateDeterministically([userService, notificationService]);
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
  'multi-repo-correlation (integration, real skill + real local model, both fixture repos)',
  () => {
    it('analyzes both fixture repos with the real skill and correlates a connection between them', async (ctx) => {
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
          runUnderstand({
            repoName,
            repoPath: join(FIXTURES_DIR, 'repos', repoName),
            model,
            modelRuntime,
            limiter,
          })
        )
      );

      const graphs = results.flatMap((r) => (r.status === 'complete' ? [r.graph] : []));
      expect(graphs.length).toBe(2); // both repos should analyze successfully

      const { connections } = correlateDeterministically(graphs);
      expect(connections.length).toBeGreaterThan(0);
    }, 600_000); // two real agent sessions — generous timeout
  }
);
