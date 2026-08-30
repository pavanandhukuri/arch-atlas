import { describe, it, expect } from 'vitest';
import { toCorrelationGraph } from '../../src/analysis/to-correlation-graph.js';
import { RepositoryKnowledgeGraphSchema } from '../../src/graph/schema.js';
import { parseEndpointRoute } from '../../src/correlate/evidence/parsers/routes.js';
import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';

function baseAnalysis(overrides: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-30T00:00:00.000Z',
    repository: { name: 'notification-service', path: '/abs/notification-service' },
    description: 'Delivers notifications.',
    languages: ['TypeScript'],
    frameworks: ['Express'],
    served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
    outbound: [],
    analysisStatus: 'complete',
    retryCount: 0,
    ...overrides,
  };
}

describe('toCorrelationGraph', () => {
  it('produces a schema-valid graph', () => {
    const graph = toCorrelationGraph(baseAnalysis());
    expect(() => RepositoryKnowledgeGraphSchema.parse(graph)).not.toThrow();
  });

  it('emits exactly one module node, anchored on the repo name', () => {
    const graph = toCorrelationGraph(baseAnalysis());
    const modules = graph.nodes.filter((n) => n.type === 'module');
    expect(modules).toHaveLength(1);
    expect(modules[0]?.id).toBe('module:notification-service');
  });

  it('emits one endpoint node per http route, each round-tripping through parseEndpointRoute', () => {
    const graph = toCorrelationGraph(
      baseAnalysis({
        served: {
          httpRoutes: [
            { method: 'POST', path: '/v1/send', filePath: 'src/server.ts' },
            { path: '/v1/health' },
          ],
          grpcServices: [],
          topics: [],
          datastores: [],
        },
      })
    );
    const endpoints = graph.nodes.filter((n) => n.type === 'endpoint');
    expect(endpoints).toHaveLength(2);

    const withMethod = endpoints.find((n) => n.name.startsWith('POST'));
    if (!withMethod) throw new Error('expected a POST endpoint node');
    expect(parseEndpointRoute(withMethod)).toEqual({ method: 'POST', path: '/v1/send' });
    expect(withMethod.filePath).toBe('src/server.ts');

    const noMethod = endpoints.find((n) => !n.name.startsWith('POST'));
    if (!noMethod) throw new Error('expected a path-only endpoint node');
    expect(parseEndpointRoute(noMethod)).toEqual({ path: '/v1/health' });
  });

  it('maps grpc services, datastores and topics to nodes', () => {
    const graph = toCorrelationGraph(
      baseAnalysis({
        served: {
          httpRoutes: [],
          grpcServices: ['notifications.v1.NotificationService'],
          topics: [{ name: 'user-created', direction: 'consume' }],
          datastores: [{ name: 'notifications', kind: 'relational' }],
        },
      })
    );
    expect(
      graph.nodes.some((n) => n.type === 'endpoint' && n.name.includes('NotificationService'))
    ).toBe(true);
    expect(graph.nodes.some((n) => n.type === 'table' && n.name === 'notifications')).toBe(true);
    expect(graph.nodes.some((n) => n.type === 'resource' && n.name === 'user-created')).toBe(true);
  });

  it('maps outbound intents to edges from the module node, adding the target node', () => {
    const graph = toCorrelationGraph(
      baseAnalysis({
        outbound: [
          { target: 'user-service', verb: 'calls', detail: 'fetches profile', confidence: 0.7 },
          { target: 'billing', verb: 'depends_on', detail: 'shared lib' },
        ],
      })
    );
    const edges = graph.edges;
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.source).toBe('module:notification-service');
      expect(graph.nodes.some((n) => n.id === edge.target)).toBe(true); // no dangling edges
    }
    const called = edges.find((e) => e.type === 'calls');
    expect(called?.weight).toBe(0.7);
    expect(called?.description).toBe('fetches profile');
    const dep = edges.find((e) => e.type === 'depends_on');
    expect(dep?.weight).toBe(0.5); // default when confidence absent
  });

  it('an analysis with no interfaces yields a module-only graph with no edges', () => {
    const graph = toCorrelationGraph(baseAnalysis());
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it('is deterministic: identical input -> identical output', () => {
    const a = toCorrelationGraph(
      baseAnalysis({ outbound: [{ target: 't', verb: 'calls', detail: 'd' }] })
    );
    const b = toCorrelationGraph(
      baseAnalysis({ outbound: [{ target: 't', verb: 'calls', detail: 'd' }] })
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('passes repository / status / retryCount straight through', () => {
    const graph = toCorrelationGraph(
      baseAnalysis({
        repository: { name: 'r', path: '/p', description: 'hint' },
        analysisStatus: 'partial',
        retryCount: 1,
      })
    );
    expect(graph.repository).toEqual({ name: 'r', path: '/p', description: 'hint' });
    expect(graph.analysisStatus).toBe('partial');
    expect(graph.retryCount).toBe(1);
  });
});
