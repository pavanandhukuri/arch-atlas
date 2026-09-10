import { describe, it, expect } from 'vitest';
import {
  classifyExternalTarget,
  externalSystemConnections,
} from '../../src/correlate/external-systems.js';
import type { RepositoryKnowledgeGraph, GraphNode, GraphEdge } from '../../src/graph/schema.js';
import type { CrossRepositoryConnection } from '../../src/correlate/deterministic-correlator.js';

/** Minimal graph: one module node + one `service:<target>` node + one outbound edge. */
function graphWithOutbound(
  repo: string,
  intents: Array<{ target: string; verb: GraphEdge['type']; detail?: string; weight?: number }>
): RepositoryKnowledgeGraph {
  const moduleId = `module:${repo}`;
  const nodes: GraphNode[] = [{ id: moduleId, type: 'module', name: repo, summary: '' }];
  const edges: GraphEdge[] = intents.map((i) => {
    const targetId = `service:${i.target}`;
    nodes.push({ id: targetId, type: 'service', name: i.target, summary: '' });
    return {
      source: moduleId,
      target: targetId,
      type: i.verb,
      weight: i.weight ?? 0.8,
      ...(i.detail !== undefined ? { description: i.detail } : {}),
    };
  });
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    repository: { name: repo, path: `/${repo}` },
    nodes,
    edges,
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

describe('classifyExternalTarget', () => {
  it.each([
    ['Lenovo Passport / Keycloak', 'Keycloak'],
    ['Lenovo Consumer Keycloak / Commercial Keycloak', 'Keycloak'],
    ['AWS S3', 'Amazon S3'],
    ['S3-compatible blob storage', 'Amazon S3'],
    ['AWS KMS', 'AWS KMS'],
    ['AWS STS', 'AWS STS'],
    ['Firebase Cloud Messaging', 'Firebase Cloud Messaging'],
    ['PostgreSQL', 'PostgreSQL'],
    ['a Redis cache', 'Redis'],
  ])('normalizes %j → %j', (raw, canonical) => {
    expect(classifyExternalTarget(raw)).toBe(canonical);
  });

  it('returns null for something that is not a known external system', () => {
    expect(classifyExternalTarget('the internal billing engine')).toBeNull();
    expect(classifyExternalTarget('udssdk-notification-service')).toBeNull();
  });
});

describe('externalSystemConnections', () => {
  it('promotes outbound intents to normalized external systems, carrying the detail', () => {
    const graphs = [
      graphWithOutbound('sdk-go', [
        {
          target: 'Lenovo Passport / Keycloak',
          verb: 'calls',
          detail: 'OIDC token exchange',
          weight: 0.9,
        },
        { target: 'AWS S3', verb: 'writes_to', detail: 'uploads blobs', weight: 0.5 },
      ]),
    ];
    const conns = externalSystemConnections(graphs);
    expect(conns.map((c) => `${c.sourceRepo} -> ${c.targetRepo}`).sort()).toEqual([
      'sdk-go -> Amazon S3',
      'sdk-go -> Keycloak',
    ]);
    const keycloak = conns.find((c) => c.targetRepo === 'Keycloak');
    expect(keycloak?.foundBy).toBe('external-outbound');
    expect(keycloak?.evidence).toEqual(['OIDC token exchange']);
    expect(keycloak?.weight).toBe(0.9);
  });

  it('does not emit an edge for a target that IS a workspace repo', () => {
    const graphs = [
      graphWithOutbound('sdk-go', [{ target: 'notification-service', verb: 'calls' }]),
      graphWithOutbound('notification-service', []),
    ];
    expect(externalSystemConnections(graphs)).toEqual([]);
  });

  it('collapses multiple intents to the same system into one edge per repo', () => {
    const graphs = [
      graphWithOutbound('svc', [
        { target: 'Kafka', verb: 'publishes', detail: 'produces to a topic' },
        { target: 'Kafka', verb: 'subscribes', detail: 'consumes the same topic' },
      ]),
    ];
    const conns = externalSystemConnections(graphs);
    expect(conns).toHaveLength(1);
    expect(conns[0]?.targetRepo).toBe('Kafka');
  });

  it('dedupes against connections another pass already produced', () => {
    const graphs = [graphWithOutbound('svc', [{ target: 'PostgreSQL', verb: 'writes_to' }])];
    const existing: CrossRepositoryConnection[] = [
      {
        sourceRepo: 'svc',
        sourceNodeId: 'module:svc',
        targetRepo: 'PostgreSQL',
        targetNodeId: 'external:PostgreSQL',
        type: 'writes_to',
        foundBy: 'evidence',
        evidence: ['compose file runs postgres'],
        weight: 0.7,
      },
    ];
    expect(externalSystemConnections(graphs, existing)).toEqual([]);
  });

  it('ignores non-outbound edge types and non-service target nodes', () => {
    const g = graphWithOutbound('svc', [{ target: 'Keycloak', verb: 'calls' }]);
    // flip the edge to a non-outbound type
    if (g.edges[0]) g.edges[0].type = 'imports';
    expect(externalSystemConnections([g])).toEqual([]);
  });
});
