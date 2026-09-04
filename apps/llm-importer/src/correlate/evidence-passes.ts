import path from 'node:path';
import type { RepositoryKnowledgeGraph } from '../graph/schema.js';
import type { CrossRepositoryConnection } from './deterministic-correlator.js';
import type { RepoEvidence, SchemaDigest } from './evidence/types.js';
import {
  isGatewayPrefixedVariant,
  parseEndpointRoute,
  pathsEqual,
  segmentCount,
  THIRD_PARTY_PATH_RE,
  type EndpointRoute,
} from './evidence/parsers/routes.js';
import { isNoiseTopic } from './evidence/parsers/topics.js';
import { normalizeServiceName, serviceNamesMatch } from './evidence/parsers/grpc.js';

/**
 * Evidence-grounded correlation passes, ported and adapted from
 * understand-everything's five deterministic linker passes (manifest,
 * endpoint, schema, compose, topic). Each pass reads only the collected
 * RepoEvidence and the per-repo graphs; none of them calls a model. Every
 * connection carries human-readable evidence naming what produced it.
 *
 * Weights are calibrated for the 'evidence-correlation' confidence mapping
 * (no bump): >=0.8 high, >=0.5 medium, else low.
 */

export interface CorrelationInput {
  repos: RepoEvidence[];
  graphsByName: Map<string, RepositoryKnowledgeGraph>;
}

export interface PassResult {
  pass: string;
  connections: CrossRepositoryConnection[];
  notes: string[];
}

export type EvidencePass = (input: CorrelationInput) => PassResult;

// --- shared helpers -------------------------------------------------------

function fileNodeId(
  graphsByName: Map<string, RepositoryKnowledgeGraph>,
  repoName: string,
  relPath: string
): string {
  const graph = graphsByName.get(repoName);
  const node = graph?.nodes.find((n) => n.filePath === relPath);
  return node?.id ?? `file:${relPath}`;
}

function moduleNodeId(
  graphsByName: Map<string, RepositoryKnowledgeGraph>,
  repoName: string
): string {
  const graph = graphsByName.get(repoName);
  if (graph) {
    const byName = graph.nodes.find(
      (n) => (n.type === 'module' || n.type === 'service') && n.name === repoName
    );
    if (byName) return byName.id;
    const anyModule = graph.nodes.find((n) => n.type === 'module' || n.type === 'service');
    if (anyModule) return anyModule.id;
  }
  return `module:${repoName}`;
}

function connection(
  partial: Omit<CrossRepositoryConnection, 'foundBy'>
): CrossRepositoryConnection {
  return { ...partial, foundBy: 'evidence' };
}

/** Keep the best connection per (source, target, type); merge evidence (max 3 lines). */
export function dedupeConnections(
  connections: CrossRepositoryConnection[]
): CrossRepositoryConnection[] {
  const byKey = new Map<string, CrossRepositoryConnection>();
  for (const c of connections) {
    const key = `${c.sourceRepo}|${c.targetRepo}|${c.type}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c, evidence: [...c.evidence] });
      continue;
    }
    if (c.weight > existing.weight) {
      byKey.set(key, {
        ...c,
        evidence: [...new Set([...c.evidence, ...existing.evidence])].slice(0, 3),
      });
    } else {
      existing.evidence = [...new Set([...existing.evidence, ...c.evidence])].slice(0, 3);
    }
  }
  return [...byKey.values()];
}

// --- manifest pass --------------------------------------------------------

/** A repo consumes a package name another repo publishes (or points a local
 * path specifier into it) → depends_on. */
export const manifestPass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  const publishers = new Map<string, RepoEvidence[]>();
  for (const repo of repos) {
    for (const manifest of repo.manifests) {
      for (const name of manifest.publishedNames) {
        const list = publishers.get(name) ?? [];
        if (!list.includes(repo)) list.push(repo);
        publishers.set(name, list);
      }
    }
  }

  for (const repo of repos) {
    for (const manifest of repo.manifests) {
      for (const dep of manifest.dependencies) {
        // Local path specifier resolving into another repo's tree: strongest signal.
        if (dep.localPath && repo.root) {
          const resolved = path.resolve(repo.root, path.dirname(manifest.relPath), dep.localPath);
          const target = repos.find(
            (r) =>
              r !== repo &&
              r.root !== null &&
              (resolved === r.root || resolved.startsWith(`${r.root}/`))
          );
          if (target) {
            connections.push(
              connection({
                sourceRepo: repo.name,
                sourceNodeId: fileNodeId(graphsByName, repo.name, manifest.relPath),
                targetRepo: target.name,
                targetNodeId: moduleNodeId(graphsByName, target.name),
                type: 'depends_on',
                evidence: [
                  `${repo.name}/${manifest.relPath} declares "${dep.name}" via local path "${dep.localPath}" resolving into ${target.name}`,
                ],
                weight: 0.8,
              })
            );
            continue;
          }
        }

        const publishingRepos = (publishers.get(dep.name) ?? []).filter((r) => r !== repo);
        if (publishingRepos.length === 0) continue;
        if (publishingRepos.length > 1) {
          notes.push(
            `ambiguous package name "${dep.name}" published by ${publishingRepos.map((r) => r.name).join(', ')} — skipped`
          );
          continue;
        }
        const target = publishingRepos[0];
        if (!target) continue;
        connections.push(
          connection({
            sourceRepo: repo.name,
            sourceNodeId: fileNodeId(graphsByName, repo.name, manifest.relPath),
            targetRepo: target.name,
            targetNodeId: moduleNodeId(graphsByName, target.name),
            type: 'depends_on',
            evidence: [
              `${repo.name}/${manifest.relPath} depends on "${dep.name}", published by ${target.name}`,
            ],
            weight: 0.6,
          })
        );
      }
    }
  }

  return { pass: 'manifest', connections: dedupeConnections(connections), notes };
};

// --- endpoint pass --------------------------------------------------------

interface CalleeRoute {
  route: EndpointRoute;
  nodeId: string;
}

/** URL literals in one repo matched against endpoint routes (agent-extracted
 * nodes) in another — exact, then gateway-prefixed suffix, then raw
 * literal-vs-literal suffix as a low-confidence fallback. */
export const endpointPass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  const routesByRepo = new Map<string, CalleeRoute[]>();
  for (const repo of repos) {
    const routes: CalleeRoute[] = [];
    for (const node of repo.endpointNodes) {
      const route = parseEndpointRoute(node);
      if (route) routes.push({ route, nodeId: node.id });
    }
    routesByRepo.set(repo.name, routes);
  }

  for (const caller of repos) {
    for (const literal of caller.urlLiterals) {
      // Endpoint-node matching, with multi-repo ambiguity demotion.
      const matches: Array<{ callee: RepoEvidence; match: CalleeRoute; weight: number }> = [];
      for (const callee of repos) {
        if (callee === caller) continue;
        for (const calleeRoute of routesByRepo.get(callee.name) ?? []) {
          const { route } = calleeRoute;
          const methodsContradict =
            literal.method !== undefined &&
            route.method !== undefined &&
            literal.method !== route.method;
          if (methodsContradict) continue;
          if (pathsEqual(literal.path, route.path)) {
            const exactMethod = literal.method !== undefined && literal.method === route.method;
            let weight = exactMethod ? 0.85 : 0.7;
            if (literal.template) weight = Math.min(weight, 0.55);
            matches.push({ callee, match: calleeRoute, weight });
          } else if (isGatewayPrefixedVariant(literal.path, route.path)) {
            matches.push({ callee, match: calleeRoute, weight: literal.template ? 0.5 : 0.6 });
          }
        }
      }
      const matchedRepos = new Set(matches.map((m) => m.callee.name));
      for (const { callee, match, weight } of matches) {
        const demoted = matchedRepos.size > 1 ? Math.min(weight, 0.45) : weight;
        if (matchedRepos.size > 1) {
          notes.push(
            `"${literal.path}" (${caller.name}/${literal.relPath}:${literal.line}) matches endpoints in ${matchedRepos.size} repos — demoted`
          );
        }
        connections.push(
          connection({
            sourceRepo: caller.name,
            sourceNodeId: fileNodeId(graphsByName, caller.name, literal.relPath),
            targetRepo: callee.name,
            targetNodeId: match.nodeId,
            type: 'calls',
            evidence: [
              `${caller.name}/${literal.relPath}:${literal.line} references ${literal.method ?? ''} ${literal.path} matching ${callee.name}'s endpoint ${match.route.method ?? ''} ${match.route.path}`.replace(
                /\s+/g,
                ' '
              ),
            ],
            weight: demoted,
          })
        );
      }
      if (matches.length > 0) continue;

      // Literal-vs-literal gateway-suffix fallback: the caller's path is a
      // strictly longer, prefix-extended variant of a path literal in the
      // callee's own source (e.g. "/api/notifications/v1/ws" vs "/v1/ws").
      // Identical paths are deliberately NOT matched — two repos holding the
      // same literal are typically both clients of a third system — and OIDC
      // infrastructure paths are excluded for the same reason. Two concrete
      // aligned segments are required, so wildcard-heavy routes can't match.
      if (segmentCount(literal.path) < 3) continue;
      if (THIRD_PARTY_PATH_RE.test(literal.path)) continue;
      for (const callee of repos) {
        if (callee === caller) continue;
        const suffixHit = callee.urlLiterals.find(
          (v) =>
            segmentCount(v.path) >= 2 &&
            !THIRD_PARTY_PATH_RE.test(v.path) &&
            isGatewayPrefixedVariant(literal.path, v.path, 2)
        );
        if (!suffixHit) continue;
        connections.push(
          connection({
            sourceRepo: caller.name,
            sourceNodeId: fileNodeId(graphsByName, caller.name, literal.relPath),
            targetRepo: callee.name,
            targetNodeId: fileNodeId(graphsByName, callee.name, suffixHit.relPath),
            type: 'calls',
            evidence: [
              `${caller.name}/${literal.relPath}:${literal.line} references ${literal.path}, a gateway-prefixed variant of ${suffixHit.path} in ${callee.name}/${suffixHit.relPath}:${suffixHit.line}`,
            ],
            weight: 0.45,
          })
        );
      }
    }
  }

  return { pass: 'endpoint', connections: dedupeConnections(connections), notes };
};

// --- grpc pass ----------------------------------------------------------

/** Resolve the `endpoint:grpc:<service>` node id in a callee's graph, if present. */
function grpcEndpointNodeId(
  graphsByName: Map<string, RepositoryKnowledgeGraph>,
  repoName: string,
  serviceName: string
): string | null {
  const graph = graphsByName.get(repoName);
  const node = graph?.nodes.find(
    (n) => n.type === 'endpoint' && n.id === `endpoint:grpc:${serviceName}`
  );
  return node?.id ?? null;
}

function stripServiceWord(s: string): string {
  return s.length > 'service'.length && s.endsWith('service') ? s.slice(0, -'service'.length) : s;
}

/**
 * The set of gRPC services a repo credibly *serves* — normalized-name → a
 * human-readable raw name. Three sources, each a strong signal on its own:
 *
 *  1. **Implicit from the repo name** (D11): a repo named `<x>-service` is
 *     presumed to serve `<X>Service`. This is what lets a real callee be
 *     matched even when the analysis step failed to report its served gRPC
 *     service (008 eval `grpcServicesF1 ≈ 0.72`, and it is often 0 for the
 *     orchestrator services).
 *  2. **A sole-service `.proto`** in the repo's tree — a dedicated contract.
 *     A vendored multi-service `demo.proto` is deliberately ignored: holding
 *     the shared contract is not evidence of serving every service in it.
 *  3. **`analysis.served.grpcServices`**, but only entries whose name relates
 *     to the repo name (exact, or containment ≥ 3 chars). Without this filter a
 *     single over-broad analysis result turns one repo into a false callee for
 *     the whole workspace.
 */
function servedGrpcServices(repo: RepoEvidence): Map<string, string> {
  const repoNorm = stripServiceWord(repo.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const soleProtoNorms = new Set<string>();
  for (const digest of repo.schemaDigests) {
    const svcIds = digest.identifiers.filter((id) => id.startsWith('service:'));
    if (svcIds.length === 1 && svcIds[0]) {
      soleProtoNorms.add(normalizeServiceName(svcIds[0].slice('service:'.length)));
    }
  }

  const byNorm = new Map<string, string>();
  const add = (norm: string, raw: string): void => {
    if (norm.length >= 2 && !byNorm.has(norm)) byNorm.set(norm, raw);
  };

  // Analysis-reported names first, so a real (possibly package-qualified) name
  // wins the raw-label slot over the implicit repo-name fallback. Accept an
  // analysis entry only when it *exactly* matches the repo name or a
  // sole-service proto — a looser containment test lets a chatty run's stray
  // near-name ("CatalogService" in productcatalogservice) through.
  for (const raw of repo.grpcServices) {
    const norm = normalizeServiceName(raw);
    if (norm.length < 2) continue;
    if (norm === repoNorm || soleProtoNorms.has(norm)) add(norm, raw);
  }
  for (const norm of soleProtoNorms) add(norm, `${repo.name} .proto`);
  if (repoNorm.length >= 2) {
    const guessed = `${repoNorm[0]?.toUpperCase() ?? ''}${repoNorm.slice(1)}Service`;
    add(repoNorm, `${guessed} (inferred from repo name)`);
  }
  return byNorm;
}

/**
 * gRPC client-stub construction sites in one repo matched against the gRPC
 * services another repo serves (from `analysis.served.grpcServices` and/or
 * `.proto` `service` declarations). Directed caller→callee `calls`, with the
 * same multi-target ambiguity demotion `endpointPass` applies. Every
 * connection is tagged `transport: 'grpc'`.
 */
export const grpcPass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  const served = repos.map((repo) => ({ repo, byNorm: servedGrpcServices(repo) }));

  for (const caller of repos) {
    for (const ref of caller.grpcClientRefs) {
      const norm = normalizeServiceName(ref.service);
      if (norm.length < 2) continue;

      const hits = served.filter((s) => s.repo !== caller && s.byNorm.has(norm));
      if (hits.length === 0) continue;

      const baseWeight = ref.form === 'generic' ? 0.7 : 0.8;
      const ambiguous = hits.length > 1;
      const weight = ambiguous ? Math.min(baseWeight, 0.45) : baseWeight;
      if (ambiguous) {
        notes.push(
          `${caller.name}/${ref.relPath}:${ref.line} constructs a "${ref.service}" gRPC client matching services in ${hits.length} repos (${hits
            .map((h) => h.repo.name)
            .join(', ')}) — demoted`
        );
      }

      for (const hit of hits) {
        const rawServed = hit.byNorm.get(norm) ?? ref.service;
        const targetNodeId =
          grpcEndpointNodeId(graphsByName, hit.repo.name, rawServed) ??
          moduleNodeId(graphsByName, hit.repo.name);
        connections.push(
          connection({
            sourceRepo: caller.name,
            sourceNodeId: fileNodeId(graphsByName, caller.name, ref.relPath),
            targetRepo: hit.repo.name,
            targetNodeId,
            type: 'calls',
            transport: 'grpc',
            evidence: [
              `${caller.name}/${ref.relPath}:${ref.line} constructs a ${ref.form} gRPC client for "${ref.service}", matching ${hit.repo.name}'s served gRPC service "${rawServed}"`,
            ],
            weight,
          })
        );
      }
    }
  }

  return { pass: 'grpc', connections: dedupeConnections(connections), notes };
};

// --- schema pass ----------------------------------------------------------

/**
 * A `.proto` that declares ≥ this many services is an aggregate / shared
 * contract: holding a copy of it is not evidence of depending on the other
 * holders. `demo.proto` in Online Boutique declares ~10. (011)
 */
const AGGREGATE_CONTRACT_MIN_SERVICES = 2;
/**
 * A proto `package` name declared in ≥ this many repos is a workspace-wide
 * namespace, not a bilateral contract — its drift signal is suppressed. A
 * genuine bilateral contract lives in ≤ 2 repos (producer + a consumer, or two
 * peers). (011)
 */
const SHARED_NAMESPACE_MIN_REPOS = 3;

/** Service names declared inside a schema digest (`.proto` `service:<Name>`). */
function serviceIdsOf(digest: SchemaDigest): string[] {
  return digest.identifiers
    .filter((id) => id.startsWith('service:'))
    .map((id) => id.slice('service:'.length));
}

/** Identical schema copies, proto-package drift, and OpenAPI client coverage. */
export const schemaPass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  // Workspace pre-scan: which repos declare each proto `package:` identifier.
  const pkgHolders = new Map<string, Set<string>>();
  for (const repo of repos) {
    for (const digest of repo.schemaDigests) {
      for (const id of digest.identifiers) {
        if (!id.startsWith('package:')) continue;
        const set = pkgHolders.get(id) ?? new Set<string>();
        set.add(repo.name);
        pkgHolders.set(id, set);
      }
    }
  }

  // --- Signal 1: identical schema copy (content hash shared across repos) ---
  // Grouped workspace-wide so an aggregate contract vendored by N repos is seen
  // as one shared artifact rather than N·(N-1)/2 pairwise "dependencies".
  const digestHolders = new Map<string, Array<{ repo: RepoEvidence; digest: SchemaDigest }>>();
  for (const repo of repos) {
    for (const digest of repo.schemaDigests) {
      const list = digestHolders.get(digest.sha256) ?? [];
      list.push({ repo, digest });
      digestHolders.set(digest.sha256, list);
    }
  }
  for (const group of digestHolders.values()) {
    // One entry per repo (first digest wins the slot), in `repos` order.
    const byRepo = new Map<string, { repo: RepoEvidence; digest: SchemaDigest }>();
    for (const entry of group) if (!byRepo.has(entry.repo.name)) byRepo.set(entry.repo.name, entry);
    if (byRepo.size < 2) continue;
    const holders = [...byRepo.values()];
    const first = holders[0];
    if (!first) continue;
    const svcIds = serviceIdsOf(first.digest);

    if (svcIds.length === 0) {
      // Service-less schema (message library, GraphQL SDL, JSON Schema): a
      // shared copy is still a usable bilateral signal. Unchanged behaviour —
      // pairwise depends_on @ 0.9, earlier repo → later repo.
      for (const [i, a] of holders.entries()) {
        for (const b of holders.slice(i + 1)) {
          connections.push(
            connection({
              sourceRepo: a.repo.name,
              sourceNodeId: fileNodeId(graphsByName, a.repo.name, a.digest.relPath),
              targetRepo: b.repo.name,
              targetNodeId: fileNodeId(graphsByName, b.repo.name, b.digest.relPath),
              type: 'depends_on',
              evidence: [
                `identical schema content in ${a.repo.name}/${a.digest.relPath} and ${b.repo.name}/${b.digest.relPath} (sha256 ${a.digest.sha256.slice(0, 12)}…)`,
              ],
              weight: 0.9,
            })
          );
        }
      }
      continue;
    }

    // The copy declares ≥ 1 service. It is a dependency signal only if exactly
    // one holder actually serves every service it names — that repo owns the
    // contract and the others vendor it. Otherwise (no owner, or several) it is
    // a shared contract and links nothing.
    const owners = holders.filter(({ repo }) =>
      svcIds.every((svc) => repo.grpcServices.some((served) => serviceNamesMatch(served, svc)))
    );
    const owner = owners.length === 1 ? owners[0] : undefined;
    if (owner) {
      for (const h of holders) {
        if (h.repo.name === owner.repo.name) continue;
        connections.push(
          connection({
            sourceRepo: h.repo.name,
            sourceNodeId: fileNodeId(graphsByName, h.repo.name, h.digest.relPath),
            targetRepo: owner.repo.name,
            targetNodeId: fileNodeId(graphsByName, owner.repo.name, owner.digest.relPath),
            type: 'depends_on',
            evidence: [
              `${h.repo.name}/${h.digest.relPath} is an identical copy of the contract ${owner.repo.name} serves (${svcIds.join(', ')}, sha256 ${h.digest.sha256.slice(0, 12)}…)`,
            ],
            weight: 0.9,
          })
        );
      }
    } else if (svcIds.length >= AGGREGATE_CONTRACT_MIN_SERVICES) {
      notes.push(
        `${holders.map((h) => h.repo.name).join(', ')} vendor an identical copy of ${first.digest.relPath} ` +
          `(declares ${svcIds.length} services, no single owner) — treated as a shared contract, not a dependency`
      );
    }
  }

  // --- Signal 2: proto-package drift (same package + shared message, differing content) ---
  for (let i = 0; i < repos.length; i++) {
    for (let j = i + 1; j < repos.length; j++) {
      const a = repos[i];
      const b = repos[j];
      if (!a || !b) continue;
      for (const da of a.schemaDigests) {
        for (const db of b.schemaDigests) {
          if (da.sha256 === db.sha256) continue; // handled by signal 1
          const pkgA = da.identifiers.find((id) => id.startsWith('package:'));
          const pkgB = db.identifiers.find((id) => id.startsWith('package:'));
          if (!pkgA || pkgA !== pkgB) continue;
          // A package name shared by ≥ 3 repos is a workspace namespace, not a
          // bilateral contract — drift between two of its many users is noise.
          if ((pkgHolders.get(pkgA)?.size ?? 0) >= SHARED_NAMESPACE_MIN_REPOS) continue;
          const messagesA = new Set(da.identifiers.filter((id) => id.startsWith('message:')));
          const shared = db.identifiers.some(
            (id) => id.startsWith('message:') && messagesA.has(id)
          );
          if (!shared) continue;
          connections.push(
            connection({
              sourceRepo: a.name,
              sourceNodeId: fileNodeId(graphsByName, a.name, da.relPath),
              targetRepo: b.name,
              targetNodeId: fileNodeId(graphsByName, b.name, db.relPath),
              type: 'depends_on',
              evidence: [
                `${a.name}/${da.relPath} and ${b.name}/${db.relPath} share proto ${pkgA} with differing content (possible contract drift)`,
              ],
              weight: 0.4,
            })
          );
        }
      }
    }
  }

  // OpenAPI client coverage: repo B's code references a meaningful share of
  // the paths declared in repo A's OpenAPI document → B calls A.
  for (const a of repos) {
    for (const digest of a.schemaDigests) {
      if (digest.openapiPaths.length === 0) continue;
      for (const b of repos) {
        if (b === a) continue;
        const matched = digest.openapiPaths.filter((p) =>
          b.urlLiterals.some((u) => pathsEqual(u.path, p) || isGatewayPrefixedVariant(u.path, p))
        );
        const coverage = matched.length / digest.openapiPaths.length;
        if (matched.length === 0) continue;
        const weight = coverage >= 0.5 ? 0.7 : coverage >= 0.25 ? 0.45 : 0;
        if (weight === 0) continue;
        connections.push(
          connection({
            sourceRepo: b.name,
            sourceNodeId: moduleNodeId(graphsByName, b.name),
            targetRepo: a.name,
            targetNodeId: fileNodeId(graphsByName, a.name, digest.relPath),
            type: 'calls',
            evidence: [
              `${b.name}'s code references ${matched.length} of ${digest.openapiPaths.length} paths declared in ${a.name}/${digest.relPath}`,
            ],
            weight,
          })
        );
      }
    }
  }

  return { pass: 'schema', connections: dedupeConnections(connections), notes };
};

// --- compose pass ---------------------------------------------------------

const EXTERNAL_IMAGES: Record<string, { name: string; type: CrossRepositoryConnection['type'] }> = {
  postgres: { name: 'PostgreSQL', type: 'writes_to' },
  mysql: { name: 'MySQL', type: 'writes_to' },
  mariadb: { name: 'MariaDB', type: 'writes_to' },
  mongo: { name: 'MongoDB', type: 'writes_to' },
  mongodb: { name: 'MongoDB', type: 'writes_to' },
  redis: { name: 'Redis', type: 'writes_to' },
  cassandra: { name: 'Cassandra', type: 'writes_to' },
  influxdb: { name: 'InfluxDB', type: 'writes_to' },
  clickhouse: { name: 'ClickHouse', type: 'writes_to' },
  elasticsearch: { name: 'Elasticsearch', type: 'writes_to' },
  minio: { name: 'MinIO', type: 'writes_to' },
  kafka: { name: 'Kafka', type: 'publishes' },
  rabbitmq: { name: 'RabbitMQ', type: 'publishes' },
  nats: { name: 'NATS', type: 'publishes' },
  keycloak: { name: 'Keycloak', type: 'depends_on' },
  memcached: { name: 'Memcached', type: 'writes_to' },
};

function imageBasename(image: string): string {
  const noTag = image.split(':')[0] ?? image;
  return (noTag.split('/').pop() ?? noTag).toLowerCase();
}

/** Compose files wiring services to repos (build context / image name),
 * service-level depends_on and env URLs between mapped repos, and well-known
 * external system images (databases, brokers, auth). */
export const composePass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  for (const owner of repos) {
    for (const compose of owner.composeFiles) {
      const serviceToRepo = new Map<string, RepoEvidence>();

      for (const service of compose.services) {
        // Build context resolving into another repo.
        if (service.buildContext && owner.root) {
          const resolved = path.resolve(
            owner.root,
            path.dirname(compose.relPath),
            service.buildContext
          );
          const target = repos.find(
            (r) => r.root !== null && (resolved === r.root || resolved.startsWith(`${r.root}/`))
          );
          if (target) {
            serviceToRepo.set(service.name, target);
            if (target !== owner) {
              connections.push(
                connection({
                  sourceRepo: owner.name,
                  sourceNodeId: fileNodeId(graphsByName, owner.name, compose.relPath),
                  targetRepo: target.name,
                  targetNodeId: moduleNodeId(graphsByName, target.name),
                  type: 'deploys',
                  evidence: [
                    `${owner.name}/${compose.relPath} service "${service.name}" builds from ${target.name} (context "${service.buildContext}")`,
                  ],
                  weight: 0.7,
                })
              );
            }
            continue;
          }
        }
        // Image name matching a repo (exact last-segment match only).
        if (service.image) {
          const base = imageBasename(service.image);
          const target = repos.find((r) => r.name.toLowerCase() === base);
          if (target) {
            serviceToRepo.set(service.name, target);
            if (target !== owner) {
              connections.push(
                connection({
                  sourceRepo: owner.name,
                  sourceNodeId: fileNodeId(graphsByName, owner.name, compose.relPath),
                  targetRepo: target.name,
                  targetNodeId: moduleNodeId(graphsByName, target.name),
                  type: 'deploys',
                  evidence: [
                    `${owner.name}/${compose.relPath} service "${service.name}" runs image "${service.image}" matching ${target.name}`,
                  ],
                  weight: 0.6,
                })
              );
            }
            continue;
          }
          // Well-known external system.
          const external = EXTERNAL_IMAGES[base];
          if (external) {
            connections.push(
              connection({
                sourceRepo: owner.name,
                sourceNodeId: fileNodeId(graphsByName, owner.name, compose.relPath),
                targetRepo: external.name,
                targetNodeId: `external:${external.name}`,
                type: external.type,
                evidence: [
                  `${owner.name}/${compose.relPath} runs ${external.name} (image "${service.image}") alongside the service stack`,
                ],
                weight: 0.6,
              })
            );
          }
          continue;
        }
        // Bare service named exactly like a repo.
        const byName = repos.find((r) => r.name.toLowerCase() === service.name.toLowerCase());
        if (byName) serviceToRepo.set(service.name, byName);
      }

      // Service-level depends_on and env URLs between repo-mapped services.
      for (const service of compose.services) {
        const sourceRepo = serviceToRepo.get(service.name);
        if (!sourceRepo) continue;
        for (const dep of service.dependsOn) {
          const targetRepo = serviceToRepo.get(dep);
          if (!targetRepo || targetRepo === sourceRepo) continue;
          connections.push(
            connection({
              sourceRepo: sourceRepo.name,
              sourceNodeId: moduleNodeId(graphsByName, sourceRepo.name),
              targetRepo: targetRepo.name,
              targetNodeId: moduleNodeId(graphsByName, targetRepo.name),
              type: 'depends_on',
              evidence: [
                `${owner.name}/${compose.relPath}: service "${service.name}" depends_on "${dep}"`,
              ],
              weight: 0.6,
            })
          );
        }
        for (const [key, value] of Object.entries(service.environment)) {
          for (const [otherService, targetRepo] of serviceToRepo) {
            if (targetRepo === sourceRepo || otherService === service.name) continue;
            const referencesService =
              value.includes(`//${otherService}`) ||
              new RegExp(`(^|[^\\w-])${otherService}:\\d`).test(value);
            if (!referencesService) continue;
            connections.push(
              connection({
                sourceRepo: sourceRepo.name,
                sourceNodeId: moduleNodeId(graphsByName, sourceRepo.name),
                targetRepo: targetRepo.name,
                targetNodeId: moduleNodeId(graphsByName, targetRepo.name),
                type: 'depends_on',
                evidence: [
                  `${owner.name}/${compose.relPath}: "${service.name}" env ${key} points at service "${otherService}" (${targetRepo.name})`,
                ],
                weight: 0.6,
              })
            );
          }
        }
      }
    }
  }

  return { pass: 'compose', connections: dedupeConnections(connections), notes };
};

// --- topic pass -----------------------------------------------------------

/** Cross-repo pub/sub on the same literal topic string. */
export const topicPass: EvidencePass = ({ repos, graphsByName }) => {
  const notes: string[] = [];
  const connections: CrossRepositoryConnection[] = [];

  const byTopic = new Map<
    string,
    Array<{ repo: RepoEvidence; ref: RepoEvidence['topicRefs'][number] }>
  >();
  for (const repo of repos) {
    for (const ref of repo.topicRefs) {
      const list = byTopic.get(ref.topic) ?? [];
      list.push({ repo, ref });
      byTopic.set(ref.topic, list);
    }
  }

  for (const [topic, refs] of byTopic) {
    const reposInvolved = new Set(refs.map((r) => r.repo.name));
    if (reposInvolved.size < 2) continue;
    if (isNoiseTopic(topic)) {
      notes.push(
        `topic "${topic}" spans ${reposInvolved.size} repos but is a noise word — skipped`
      );
      continue;
    }
    const pubs = refs.filter((r) => r.ref.role === 'pub');
    const subs = refs.filter((r) => r.ref.role === 'sub');
    const unknowns = refs.filter((r) => r.ref.role === 'unknown');

    for (const pub of pubs) {
      for (const sub of subs) {
        if (pub.repo === sub.repo) continue;
        connections.push(
          connection({
            sourceRepo: pub.repo.name,
            sourceNodeId: fileNodeId(graphsByName, pub.repo.name, pub.ref.relPath),
            targetRepo: sub.repo.name,
            targetNodeId: fileNodeId(graphsByName, sub.repo.name, sub.ref.relPath),
            type: 'publishes',
            evidence: [
              `topic "${topic}" published in ${pub.repo.name}/${pub.ref.relPath}:${pub.ref.line}, consumed in ${sub.repo.name}/${sub.ref.relPath}:${sub.ref.line}`,
            ],
            weight: 0.65,
          })
        );
      }
    }
    // Unknown-role refs pair only with a definite opposite, at low weight.
    for (const unknown of unknowns) {
      for (const pub of pubs) {
        if (pub.repo === unknown.repo) continue;
        connections.push(
          connection({
            sourceRepo: pub.repo.name,
            sourceNodeId: fileNodeId(graphsByName, pub.repo.name, pub.ref.relPath),
            targetRepo: unknown.repo.name,
            targetNodeId: fileNodeId(graphsByName, unknown.repo.name, unknown.ref.relPath),
            type: 'publishes',
            evidence: [
              `topic "${topic}" published in ${pub.repo.name}/${pub.ref.relPath}:${pub.ref.line}, referenced in ${unknown.repo.name}/${unknown.ref.relPath}:${unknown.ref.line} (direction unconfirmed)`,
            ],
            weight: 0.4,
          })
        );
      }
      for (const sub of subs) {
        if (sub.repo === unknown.repo) continue;
        connections.push(
          connection({
            sourceRepo: unknown.repo.name,
            sourceNodeId: fileNodeId(graphsByName, unknown.repo.name, unknown.ref.relPath),
            targetRepo: sub.repo.name,
            targetNodeId: fileNodeId(graphsByName, sub.repo.name, sub.ref.relPath),
            type: 'publishes',
            evidence: [
              `topic "${topic}" referenced in ${unknown.repo.name}/${unknown.ref.relPath}:${unknown.ref.line} (direction unconfirmed), consumed in ${sub.repo.name}/${sub.ref.relPath}:${sub.ref.line}`,
            ],
            weight: 0.4,
          })
        );
      }
    }
  }

  return { pass: 'topic', connections: dedupeConnections(connections), notes };
};

/** Fixed pass order — deterministic output requires deterministic ordering. */
export const EVIDENCE_PASSES: EvidencePass[] = [
  manifestPass,
  endpointPass,
  grpcPass,
  schemaPass,
  composePass,
  topicPass,
];
