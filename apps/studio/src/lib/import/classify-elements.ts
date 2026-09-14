import type { Candidate, ElementConfig, CandidateType, RepoMeta, SystemGroup } from './types';
import type { ContainerSubtype } from '@archatlas/core-model';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'elem'
  );
}

const DATABASE_KEYWORDS = [
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'cassandra',
  'elasticsearch',
  'dynamodb',
  'sqlite',
];

const QUEUE_KEYWORDS = ['kafka', 'rabbitmq', 'activemq', 'sqs', 'pubsub'];

/**
 * Collect the set of connection types pointing TO a given element name.
 * Only considers non-rejected candidates.
 */
function getInboundTypes(name: string, candidates: Candidate[]): Set<CandidateType> {
  const types = new Set<CandidateType>();
  for (const c of candidates) {
    if (c.status !== 'rejected' && c.target === name) {
      types.add(c.type);
    }
  }
  return types;
}

/**
 * Classify a single element name into an ElementConfig with smart defaults.
 */
function classifyOne(
  name: string,
  candidates: Candidate[],
  sourceRepos: string[],
  overrideDisplayName: string | null,
  systems: SystemGroup[],
  repoMetaByName: Map<string, RepoMeta>
): ElementConfig {
  const id = slugify(name);
  const displayName = overrideDisplayName ?? name;
  const lower = name.toLowerCase();
  const inboundTypes = getInboundTypes(name, candidates);

  const sourceRepoSet = new Set(sourceRepos);
  const systemId = systems.find((s) => s.repoNames.includes(name))?.id;

  let config: ElementConfig;

  // --- Check database keywords ---
  if (DATABASE_KEYWORDS.some((kw) => lower.includes(kw))) {
    config = {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'database',
      isExternal: false,
      tags: [],
    };
  } else if (QUEUE_KEYWORDS.some((kw) => lower.includes(kw))) {
    // --- Check queue/messaging keywords ---
    config = {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'default',
      isExternal: false,
      tags: [],
    };
  } else if (sourceRepoSet.has(name)) {
    // --- Check if name is in source_repos ---
    config = {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'backend-service',
      isExternal: false,
      tags: [],
      ...(systemId !== undefined && { systemId }),
    };
  } else if (inboundTypes.has('database')) {
    // --- Connection-type-based inference ---
    // If inbound connection type is 'database' → classify as database container
    config = {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'database' as ContainerSubtype,
      isExternal: false,
      tags: [],
    };
  } else {
    // --- Default ---
    // Whether something is an external system (Keycloak, Stripe, a third-party
    // API) or belongs to a system group is an architectural judgment call —
    // leave it to the human reviewer in Tag & Classify rather than guessing
    // from a keyword list or connection-type heuristics.
    // containerSubtype 'default' is displayed as "Queue" in the UI (it's the
    // subtype QUEUE_KEYWORDS above uses), so it would mislabel a generic
    // dependency like Keycloak or Vault — 'backend-service' is the more
    // honest catch-all here.
    config = {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'backend-service',
      isExternal: false,
      tags: [],
    };
  }

  // 008/this fix: pre-fill Technology / Description from the importer's
  // per-repo metadata when this element IS one of the analyzed repos — a
  // keyword/connection-inferred non-repo container (a bare "PostgreSQL"
  // target, Keycloak, …) has no such metadata to draw from.
  const meta = repoMetaByName.get(name);
  if (meta) {
    config = {
      ...config,
      ...(meta.technology !== undefined && { technology: meta.technology }),
      ...(meta.description !== undefined && { description: meta.description }),
    };
  }

  return config;
}

/**
 * Auto-classify elements from non-rejected candidates.
 * Collects unique source and target names, then applies smart defaults.
 * If a candidate has an override_name, uses it as the displayName for the target.
 * `repoMeta` (the review file's optional `repos[]`) pre-fills Technology /
 * Description for elements that are analyzed repos.
 */
export function classifyElements(
  candidates: Candidate[],
  sourceRepos: string[],
  systems: SystemGroup[] = [],
  repoMeta: RepoMeta[] = []
): ElementConfig[] {
  // Only look at candidates that are NOT rejected
  const activeCandidates = candidates.filter((c) => c.status !== 'rejected');

  // Collect unique names from source and target.
  // Track override_name keyed by the target name (last one wins if multiple overrides).
  const nameSet = new Set<string>();
  const overrideMap = new Map<string, string>();

  for (const c of activeCandidates) {
    nameSet.add(c.source);
    nameSet.add(c.target);
    if (c.override_name !== null) {
      overrideMap.set(c.target, c.override_name);
    }
  }

  const repoMetaByName = new Map(repoMeta.map((r) => [r.name, r]));

  const elements: ElementConfig[] = [];
  for (const name of nameSet) {
    const overrideDisplayName = overrideMap.get(name) ?? null;
    elements.push(
      classifyOne(name, candidates, sourceRepos, overrideDisplayName, systems, repoMetaByName)
    );
  }

  return elements;
}
