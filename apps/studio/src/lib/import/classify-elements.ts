import type { Candidate, ElementConfig, CandidateType } from './types';
import type { ContainerSubtype } from '@arch-atlas/core-model';

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

const WELL_KNOWN_EXTERNALS = new Set([
  'keycloak',
  'auth0',
  'stripe',
  'twilio',
  'sendgrid',
  'okta',
  'cognito',
  'firebase',
  'launchdarkly',
  'datadog',
  'sentry',
  'pagerduty',
  'slack',
  'github',
  'gitlab',
  'bitbucket',
  'jira',
  'confluence',
]);

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
  overrideDisplayName: string | null
): ElementConfig {
  const id = slugify(name);
  const displayName = overrideDisplayName ?? name;
  const lower = name.toLowerCase();
  const inboundTypes = getInboundTypes(name, candidates);

  const sourceRepoSet = new Set(sourceRepos);

  // --- Check database keywords ---
  if (DATABASE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'database',
      isExternal: false,
      tags: [],
    };
  }

  // --- Check queue/messaging keywords ---
  if (QUEUE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'default',
      isExternal: false,
      tags: [],
    };
  }

  // --- Check if name is in source_repos ---
  if (sourceRepoSet.has(name)) {
    return {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'backend-service',
      isExternal: false,
      tags: [],
    };
  }

  // --- Check well-known externals ---
  if (WELL_KNOWN_EXTERNALS.has(lower)) {
    return {
      id,
      name,
      displayName,
      kind: 'system',
      isExternal: true,
      tags: [],
    };
  }

  // --- Connection-type-based inference ---
  // If inbound connection type is 'database' → classify as database container
  if (inboundTypes.has('database')) {
    return {
      id,
      name,
      displayName,
      kind: 'container',
      containerSubtype: 'database' as ContainerSubtype,
      isExternal: false,
      tags: [],
    };
  }

  // If inbound connection type is 'http' AND name NOT in source_repos → external system
  if (inboundTypes.has('http') && !sourceRepoSet.has(name)) {
    return {
      id,
      name,
      displayName,
      kind: 'system',
      isExternal: true,
      tags: [],
    };
  }

  // --- Default ---
  return {
    id,
    name,
    displayName,
    kind: 'system',
    isExternal: false,
    tags: [],
  };
}

/**
 * Auto-classify elements from non-rejected candidates.
 * Collects unique source and target names, then applies smart defaults.
 * If a candidate has an override_name, uses it as the displayName for the target.
 */
export function classifyElements(candidates: Candidate[], sourceRepos: string[]): ElementConfig[] {
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

  const elements: ElementConfig[] = [];
  for (const name of nameSet) {
    const overrideDisplayName = overrideMap.get(name) ?? null;
    elements.push(classifyOne(name, candidates, sourceRepos, overrideDisplayName));
  }

  return elements;
}
