import type { RepositoryKnowledgeGraph, GraphEdgeType } from '../graph/schema.js';
import type { CrossRepositoryConnection } from './deterministic-correlator.js';

/**
 * External-system pass.
 *
 * The five evidence passes and the name-mention pass only ever connect one
 * workspace repo to another. But a per-repo `RepoAnalysis.outbound` intent
 * routinely names a system that is NOT in the workspace — an identity provider,
 * an object store, a managed queue, a third-party API. `toCorrelationGraph`
 * turns each such intent into a `module -> service:<target>` edge; without this
 * pass nothing ever reads those edges and the dependency is silently dropped
 * (this is how Keycloak / S3 / KMS went missing on the uds-sdk workspace).
 *
 * This pass promotes those intents into cross-repo connections whose `targetRepo`
 * is a normalized external-system name, so Studio's classify step sees them as
 * elements to tag. Model-derived and unverified by literal evidence, so
 * `assemble-review` buckets them no higher than `medium` (see bucket-mapper).
 */

interface ExternalSystem {
  re: RegExp;
  name: string;
}

/**
 * First match wins — order specific before generic. Matched against the raw
 * `outbound.target` string the producer wrote. Canonical names line up with
 * `EXTERNAL_IMAGES` in evidence-passes.ts where they overlap, so a system named
 * in BOTH a compose file and an outbound intent dedupes to one node.
 */
export const EXTERNAL_SYSTEMS: readonly ExternalSystem[] = [
  // identity / auth
  { re: /\bkeycloak\b/i, name: 'Keycloak' },
  { re: /\bauth0\b/i, name: 'Auth0' },
  { re: /\bokta\b/i, name: 'Okta' },
  { re: /\bcognito\b/i, name: 'Amazon Cognito' },
  // AWS
  { re: /\bs3\b|simple storage service|s3[- ]compatible/i, name: 'Amazon S3' },
  { re: /\bkms\b|key management service/i, name: 'AWS KMS' },
  { re: /\bsts\b|security token service/i, name: 'AWS STS' },
  { re: /\bsqs\b/i, name: 'Amazon SQS' },
  { re: /\bsns\b/i, name: 'Amazon SNS' },
  { re: /\bdynamodb\b/i, name: 'Amazon DynamoDB' },
  { re: /secrets?\s*manager/i, name: 'AWS Secrets Manager' },
  { re: /\bcloudwatch\b/i, name: 'Amazon CloudWatch' },
  // GCP
  { re: /firebase|\bfcm\b|cloud messaging/i, name: 'Firebase Cloud Messaging' },
  { re: /google cloud storage|\bgcs\b/i, name: 'Google Cloud Storage' },
  { re: /pub\/?sub/i, name: 'Google Cloud Pub/Sub' },
  { re: /\bbigquery\b/i, name: 'Google BigQuery' },
  // third-party SaaS
  { re: /\bstripe\b/i, name: 'Stripe' },
  { re: /\btwilio\b/i, name: 'Twilio' },
  { re: /\bsendgrid\b/i, name: 'SendGrid' },
  { re: /\bdatadog\b/i, name: 'Datadog' },
  { re: /\bsentry\b/i, name: 'Sentry' },
  // data stores / brokers (may be named only in an intent, not a compose file)
  { re: /\b(elasticsearch|opensearch)\b/i, name: 'Elasticsearch' },
  { re: /\bpostgres(ql)?\b/i, name: 'PostgreSQL' },
  { re: /\bmysql\b/i, name: 'MySQL' },
  { re: /\bmariadb\b/i, name: 'MariaDB' },
  { re: /\bmongo(db)?\b/i, name: 'MongoDB' },
  { re: /\bredis\b/i, name: 'Redis' },
  { re: /\bmemcached\b/i, name: 'Memcached' },
  { re: /\bcassandra\b/i, name: 'Cassandra' },
  { re: /\bkafka\b/i, name: 'Kafka' },
  { re: /\brabbitmq\b/i, name: 'RabbitMQ' },
  { re: /\bnats\b/i, name: 'NATS' },
];

const OUTBOUND_EDGE_TYPES: ReadonlySet<GraphEdgeType> = new Set([
  'calls',
  'depends_on',
  'publishes',
  'subscribes',
  'reads_from',
  'writes_to',
]);

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ')
    .trim();

/** Canonical external-system name for a raw target string, or null if it isn't a known external. */
export function classifyExternalTarget(target: string): string | null {
  for (const sys of EXTERNAL_SYSTEMS) {
    if (sys.re.test(target)) return sys.name;
  }
  return null;
}

/**
 * @param graphs      the per-repo correlation graphs
 * @param existing    connections already found by other passes — used to dedupe
 *                    (e.g. a repo->PostgreSQL edge the compose pass already emitted)
 */
export function externalSystemConnections(
  graphs: RepositoryKnowledgeGraph[],
  existing: readonly CrossRepositoryConnection[] = []
): CrossRepositoryConnection[] {
  const repoNames = new Set(graphs.map((g) => normalize(g.repository.name)));
  // One edge per (repo -> external system), regardless of how many outbound
  // intents (publish + subscribe, calls + depends_on, …) name it. Also skips
  // anything another pass already produced (e.g. repo -> PostgreSQL from compose).
  const seen = new Set<string>();
  for (const c of existing) {
    seen.add(`${normalize(c.sourceRepo)}|${normalize(c.targetRepo)}`);
  }

  const connections: CrossRepositoryConnection[] = [];
  for (const graph of graphs) {
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const edge of graph.edges) {
      if (!OUTBOUND_EDGE_TYPES.has(edge.type)) continue;
      const targetNode = nodesById.get(edge.target);
      if (targetNode?.type !== 'service') continue;
      const rawTarget = targetNode.name;
      if (repoNames.has(normalize(rawTarget))) continue; // it's a workspace repo — other passes own it

      const canonical = classifyExternalTarget(rawTarget);
      if (!canonical) continue;

      const key = `${normalize(graph.repository.name)}|${normalize(canonical)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      connections.push({
        sourceRepo: graph.repository.name,
        sourceNodeId: edge.source,
        targetRepo: canonical,
        targetNodeId: `external:${canonical}`,
        type: edge.type,
        foundBy: 'external-outbound',
        evidence: [
          edge.description ?? `${edge.type} ${canonical} (from ${graph.repository.name} analysis)`,
        ],
        weight: edge.weight,
      });
    }
  }
  return connections;
}
