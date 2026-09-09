import { describe, it, expect } from 'vitest';
import { correlateDeterministically } from '../../src/correlate/deterministic-correlator.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

function makeGraph(overrides: Partial<RepositoryKnowledgeGraph>): RepositoryKnowledgeGraph {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-01-01T00:00:00Z',
    repository: { name: 'repo', path: '/repo' },
    nodes: [],
    edges: [],
    analysisStatus: 'complete',
    retryCount: 0,
    ...overrides,
  };
}

describe('correlateDeterministically', () => {
  it('finds a connection when an outbound edge mentions another repository by name (Kafka-topic-style pattern)', () => {
    const userService = makeGraph({
      repository: { name: 'user-service', path: '/user-service' },
      nodes: [
        {
          id: 'file:publisher.ts',
          type: 'file',
          name: 'publisher.ts',
          summary: 'publishes user-created events',
        },
        {
          id: 'topic:user-created',
          type: 'endpoint',
          name: 'user-created',
          summary: 'Kafka topic',
        },
      ],
      edges: [
        {
          source: 'file:publisher.ts',
          target: 'topic:user-created',
          type: 'publishes',
          weight: 0.9,
          description: 'publishes to a topic consumed by notification-service',
        },
      ],
    });
    const notificationService = makeGraph({
      repository: { name: 'notification-service', path: '/notification-service' },
      nodes: [
        {
          id: 'service:notification-service',
          type: 'service',
          name: 'notification-service',
          summary: 'consumes user-created events',
        },
      ],
      edges: [],
    });

    const { connections, unresolvedPairs } = correlateDeterministically([
      userService,
      notificationService,
    ]);

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'user-service',
      targetRepo: 'notification-service',
      type: 'publishes',
      foundBy: 'deterministic',
    });
    // The connection carries the full outbound detail (edge.description), not
    // just the bare repo-name substring that matched — so a reviewer sees why.
    expect(connections[0]?.evidence).toEqual([
      'publishes to a topic consumed by notification-service',
    ]);
    expect(unresolvedPairs).toHaveLength(0);
  });

  it('promotes an outbound intent to an external system not in the workspace', () => {
    const svc = makeGraph({
      repository: { name: 'sdk', path: '/sdk' },
      nodes: [
        { id: 'module:sdk', type: 'module', name: 'sdk', summary: '' },
        {
          id: 'service:Lenovo Passport / Keycloak',
          type: 'service',
          name: 'Lenovo Passport / Keycloak',
          summary: '',
        },
      ],
      edges: [
        {
          source: 'module:sdk',
          target: 'service:Lenovo Passport / Keycloak',
          type: 'calls',
          weight: 0.9,
          description: 'OIDC token exchange against /auth/realms/…/token',
        },
      ],
    });
    const other = makeGraph({ repository: { name: 'other', path: '/other' } });

    const { connections } = correlateDeterministically([svc, other]);
    const kc = connections.find((c) => c.targetRepo === 'Keycloak');
    expect(kc).toMatchObject({ sourceRepo: 'sdk', type: 'calls', foundBy: 'external-outbound' });
    expect(kc?.evidence).toEqual(['OIDC token exchange against /auth/realms/…/token']);
  });

  it('reports an unresolved pair when neither repo mentions the other', () => {
    const a = makeGraph({ repository: { name: 'service-a', path: '/a' } });
    const b = makeGraph({ repository: { name: 'service-b', path: '/b' } });

    const { connections, unresolvedPairs } = correlateDeterministically([a, b]);
    expect(connections).toHaveLength(0);
    expect(unresolvedPairs).toHaveLength(1);
    expect(unresolvedPairs[0]).toEqual({ repoA: 'service-a', repoB: 'service-b' });
  });

  it('ignores intra-repo structural edge types (imports, configures) when correlating', () => {
    const a = makeGraph({
      repository: { name: 'service-a', path: '/a' },
      nodes: [
        { id: 'file:x.ts', type: 'file', name: 'x.ts', summary: '' },
        {
          id: 'file:y.ts',
          type: 'file',
          name: 'y.ts',
          summary: 'mentions service-b in a comment, but via "imports"',
        },
      ],
      edges: [
        {
          source: 'file:x.ts',
          target: 'file:y.ts',
          type: 'imports',
          weight: 0.8,
          description: 'imports service-b helper',
        },
      ],
    });
    const b = makeGraph({ repository: { name: 'service-b', path: '/b' } });

    const { connections } = correlateDeterministically([a, b]);
    expect(connections).toHaveLength(0); // 'imports' isn't in OUTBOUND_EDGE_TYPES
  });

  it('does not correlate a repository against itself', () => {
    const a = makeGraph({ repository: { name: 'service-a', path: '/a' } });
    const { connections } = correlateDeterministically([a]);
    expect(connections).toHaveLength(0);
  });

  it('handles an outbound edge with no description and a target node with no summary (all-undefined text)', () => {
    const a = makeGraph({
      repository: { name: 'service-a', path: '/a' },
      nodes: [{ id: 'file:x.ts', type: 'file', name: 'x.ts', summary: '' }],
      // No description on the edge, and the target id doesn't resolve to any
      // node in this repo's own node list — exercises the `!text` branch in
      // graphMentionsRepoName rather than always having text to search.
      edges: [{ source: 'file:x.ts', target: 'unresolved:target', type: 'calls', weight: 0.5 }],
    });
    const b = makeGraph({ repository: { name: 'service-b', path: '/b' } });

    const { connections } = correlateDeterministically([a, b]);
    expect(connections).toHaveLength(0);
  });
});
