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
 * 007 research.md D7 pass 2: bounded fallback for repository pairs the
 * deterministic pass could not resolve, given condensed per-repo summaries.
 * research.md D14.4 tightened it: the summary now includes served interfaces,
 * the prompt demands a concrete name/path/topic match (not generic
 * similarity), and only high-confidence results are kept.
 */
const MIN_AGENTIC_CONFIDENCE = 0.8;

/**
 * research.md D14.4: the model keeps dressing up "both repos use AWS / Keycloak
 * / Postgres" as a concrete match. Drop a proposal whose reasoning rests only on
 * a shared third-party dependency and offers no repo-specific route / topic /
 * identifier.
 */
const SHARED_INFRA_RE =
  /\b(aws|s3|kms|bedrock|keycloak|okta|auth0|cognito|postgres|postgresql|mysql|redis|kafka|rabbitmq|nats|zookeeper|elasticsearch|mongodb|dynamodb|gcs|azure)\b/i;
const CONCRETE_MATCH_RE = /(["'`/][\w./{}-]+["'`/]?|\btopic\b|:\d{2,5}\b|\bendpoint\b|\broute\b)/i;

function isGenericInfraReasoning(reasoning: string): boolean {
  const lc = reasoning.toLowerCase();
  const leansOnBoth = lc.includes('both ') || lc.includes('shared') || lc.includes('same aws');
  return leansOnBoth && SHARED_INFRA_RE.test(reasoning) && !CONCRETE_MATCH_RE.test(reasoning);
}

function condenseForPrompt(graph: RepositoryKnowledgeGraph): string {
  const served = graph.nodes.filter((n) =>
    ['endpoint', 'table', 'resource', 'service'].includes(n.type)
  );
  const outbound = graph.edges
    .filter((e) => ['calls', 'depends_on', 'publishes', 'subscribes'].includes(e.type))
    .map((e) => `${e.type}: ${e.description ?? e.target}`);
  return [
    `Repository: ${graph.repository.name}`,
    graph.repository.description ? `Summary: ${graph.repository.description}` : '',
    served.length > 0
      ? `Serves / owns:\n${served.map((s) => `  - ${s.type}: ${s.name}`).join('\n')}`
      : '',
    outbound.length > 0 ? `Outbound intents:\n${outbound.map((o) => `  - ${o}`).join('\n')}` : '',
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
        'Two repository summaries follow. Propose a connection ONLY when a specific',
        "name, route path, topic string, datastore, or dependency in one repo's summary",
        'plausibly refers to something the other repo serves or owns. Do NOT propose a',
        'connection from generic similarity (e.g. "both use AWS", "both are services").',
        'When in doubt, propose nothing.',
        '',
        '--- Repository A ---',
        condenseForPrompt(repoA),
        '',
        '--- Repository B ---',
        condenseForPrompt(repoB),
        '',
        'Respond with ONLY a JSON array (no prose), each element:',
        '{ "direction": "A_TO_B" | "B_TO_A", "type": "calls"|"depends_on"|"publishes"|"subscribes"|"reads_from"|"writes_to",',
        '  "confidence": 0.0-1.0, "reasoning": "cite the specific matching name/path/topic" }',
        'If there is no concrete match, respond with [].',
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
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim() : '';
    if (!direction || typeof type !== 'string' || confidence === undefined) continue;
    // research.md D14.4: keep only confident, concretely-reasoned proposals.
    if (confidence < MIN_AGENTIC_CONFIDENCE || reasoning.length < 12) continue;
    if (isGenericInfraReasoning(reasoning)) continue;

    const [from, to] = direction === 'A_TO_B' ? [repoA, repoB] : [repoB, repoA];
    connections.push({
      sourceRepo: from.repository.name,
      sourceNodeId: `service:${from.repository.name}`,
      targetRepo: to.repository.name,
      targetNodeId: `service:${to.repository.name}`,
      type: type as CrossRepositoryConnection['type'],
      foundBy: 'agentic-fallback',
      evidence: [reasoning],
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
