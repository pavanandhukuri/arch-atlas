import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';
import type { RepositoryKnowledgeGraph } from '../graph/schema.js';
import type { SharedLimiter } from '../concurrency/shared-limiter.js';
import type { CrossRepositoryConnection, UnresolvedRepoPair } from './deterministic-correlator.js';

/**
 * research.md D7 pass 2: bounded fallback for repository pairs the
 * deterministic pass could not resolve, given condensed per-repo summaries
 * (node/edge counts + names — not full graphs, to keep this cheap on a local
 * model). This is our own correlation logic, not part of UA's vendored
 * skill (D2/D4) — it runs no-tools, single-turn, purely as a text-reasoning
 * call, so it doesn't need the resource loader or vendored skill at all.
 */
function condenseForPrompt(graph: RepositoryKnowledgeGraph): string {
  const services = graph.nodes.filter(
    (n) => n.type === 'service' || n.type === 'endpoint' || n.type === 'config'
  );
  const outbound = graph.edges
    .filter((e) => ['calls', 'depends_on', 'publishes', 'subscribes'].includes(e.type))
    .map((e) => `${e.type}: ${e.description ?? e.target}`);
  return [
    `Repository: ${graph.repository.name}`,
    services.length > 0 ? `Key components: ${services.map((s) => s.name).join(', ')}` : '',
    outbound.length > 0
      ? `Outbound connections:\n${outbound.map((o) => `  - ${o}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractJsonArray(text: string): unknown[] {
  const match = /\[[\s\S]*\]/.exec(text);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function correlatePair(
  repoA: RepositoryKnowledgeGraph,
  repoB: RepositoryKnowledgeGraph,
  model: Model<Api>,
  modelRuntime: ModelRuntime
): Promise<CrossRepositoryConnection[]> {
  const agentDir = await mkdtemp(join(tmpdir(), 'arch-atlas-correlate-'));
  const { session } = await createAgentSession({
    agentDir,
    model,
    modelRuntime,
    tools: [], // pure reasoning over the two summaries below, no file access needed or wanted
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({}),
  });

  let responseText = '';
  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      responseText += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(
      [
        'Two repository summaries follow. Identify likely connections between them',
        '(one calling the other, publishing/subscribing to a shared topic, sharing a',
        'database, etc.) based on naming and described behavior alone.',
        '',
        '--- Repository A ---',
        condenseForPrompt(repoA),
        '',
        '--- Repository B ---',
        condenseForPrompt(repoB),
        '',
        'Respond with ONLY a JSON array (no prose), each element:',
        '{ "direction": "A_TO_B" | "B_TO_A", "type": "calls"|"depends_on"|"publishes"|"subscribes"|"reads_from"|"writes_to",',
        '  "confidence": 0.0-1.0, "reasoning": "one sentence" }',
        'If there is no likely connection, respond with [].',
      ].join('\n')
    );
  } finally {
    session.dispose();
  }

  const raw = extractJsonArray(responseText);
  const connections: CrossRepositoryConnection[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const direction =
      obj.direction === 'A_TO_B' || obj.direction === 'B_TO_A' ? obj.direction : undefined;
    const type = obj.type;
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : undefined;
    if (!direction || typeof type !== 'string' || confidence === undefined) continue;

    const [from, to] = direction === 'A_TO_B' ? [repoA, repoB] : [repoB, repoA];
    connections.push({
      sourceRepo: from.repository.name,
      sourceNodeId: `service:${from.repository.name}`,
      targetRepo: to.repository.name,
      targetNodeId: `service:${to.repository.name}`,
      type: type as CrossRepositoryConnection['type'],
      foundBy: 'agentic-fallback',
      evidence: typeof obj.reasoning === 'string' ? [obj.reasoning] : [],
      weight: Math.max(0, Math.min(1, confidence)),
    });
  }
  return connections;
}

export async function correlateAgentically(
  unresolvedPairs: UnresolvedRepoPair[],
  graphsByName: Map<string, RepositoryKnowledgeGraph>,
  model: Model<Api>,
  modelRuntime: ModelRuntime,
  limiter: SharedLimiter
): Promise<CrossRepositoryConnection[]> {
  const results = await Promise.all(
    unresolvedPairs.map((pair) =>
      limiter.run(async () => {
        const repoA = graphsByName.get(pair.repoA);
        const repoB = graphsByName.get(pair.repoB);
        if (!repoA || !repoB) return [];
        return correlatePair(repoA, repoB, model, modelRuntime);
      })
    )
  );
  return results.flat();
}
