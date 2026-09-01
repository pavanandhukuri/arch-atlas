import type {
  CrossRepositoryConnection,
  RepositoryKnowledgeGraph,
  UnresolvedRepoPair,
} from '@arch-atlas/llm-importer';
import { chatComplete } from './openai-client.js';

/**
 * The relocated agentic cross-repo fallback (007 D7 pass 2 / 008 D14.4). The
 * importer core no longer runs it; the runner's `resolve-pairs` command does,
 * writing `architecture.extra-connections.json` that the core merges.
 * Same prompt, same filters — pi `createAgentSession` → local `chatComplete`.
 */

const MIN_AGENTIC_CONFIDENCE = 0.8;

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

export interface ResolveUnresolvedPairsOptions {
  pairs: UnresolvedRepoPair[];
  graphsByName: Map<string, RepositoryKnowledgeGraph>;
  endpoint: string;
  modelId: string;
  apiKey?: string;
  temperature?: number;
  timeoutMs?: number;
}

async function correlatePair(
  repoA: RepositoryKnowledgeGraph,
  repoB: RepositoryKnowledgeGraph,
  o: ResolveUnresolvedPairsOptions
): Promise<CrossRepositoryConnection[]> {
  const responseText = await chatComplete({
    endpoint: o.endpoint,
    modelId: o.modelId,
    ...(o.apiKey !== undefined ? { apiKey: o.apiKey } : {}),
    ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
    ...(o.timeoutMs !== undefined ? { timeoutMs: o.timeoutMs } : {}),
    messages: [
      {
        role: 'user',
        content: [
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
        ].join('\n'),
      },
    ],
  });

  const connections: CrossRepositoryConnection[] = [];
  for (const item of extractJsonArray(responseText)) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const direction =
      obj.direction === 'A_TO_B' || obj.direction === 'B_TO_A' ? obj.direction : undefined;
    const type = obj.type;
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : undefined;
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim() : '';
    if (!direction || typeof type !== 'string' || confidence === undefined) continue;
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

export async function resolveUnresolvedPairs(
  o: ResolveUnresolvedPairsOptions
): Promise<CrossRepositoryConnection[]> {
  const results: CrossRepositoryConnection[][] = [];
  for (const pair of o.pairs) {
    const repoA = o.graphsByName.get(pair.repoA);
    const repoB = o.graphsByName.get(pair.repoB);
    if (!repoA || !repoB) {
      results.push([]);
      continue;
    }
    results.push(await correlatePair(repoA, repoB, o));
  }
  return results.flat();
}
