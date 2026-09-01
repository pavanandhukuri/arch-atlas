import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { collectRepoEvidence } from '../../src/correlate/evidence/collect.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

const FIXTURE_REPOS = path.resolve(import.meta.dirname, '../fixtures/repos');

function graphFor(name: string, repoPath: string): RepositoryKnowledgeGraph {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-22T00:00:00Z',
    repository: { name, path: repoPath },
    nodes: [],
    edges: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

describe('collectRepoEvidence', () => {
  it('walks a real repo collecting manifests, url literals, and topic refs', () => {
    const evidence = collectRepoEvidence(
      graphFor('user-service', path.join(FIXTURE_REPOS, 'user-service'))
    );
    expect(evidence.root).not.toBeNull();
    expect(evidence.manifests).toHaveLength(1);
    expect(evidence.manifests[0]?.publishedNames).toEqual(['user-service']);

    const topics = evidence.topicRefs.map((t) => t.topic);
    expect(topics).toContain('user-created');

    const urls = evidence.urlLiterals.map((u) => u.path);
    expect(urls).toContain('/api/notifications/v1/send');
    const send = evidence.urlLiterals.find((u) => u.path === '/api/notifications/v1/send');
    expect(send?.method).toBe('POST');
  });

  it('never reads files matching the FR-015 secret exclusions', () => {
    const evidence = collectRepoEvidence(
      graphFor('user-service', path.join(FIXTURE_REPOS, 'user-service'))
    );
    const everyPath = [
      ...evidence.urlLiterals.map((u) => u.relPath),
      ...evidence.topicRefs.map((t) => t.relPath),
      ...evidence.manifests.map((m) => m.relPath),
      ...evidence.schemaDigests.map((s) => s.relPath),
    ];
    expect(everyPath.some((p) => p.includes('.env'))).toBe(false);
  });

  it('degrades to graph-only evidence when the recorded repo path is gone', () => {
    const evidence = collectRepoEvidence(graphFor('ghost', '/nonexistent/ghost-repo'));
    expect(evidence.root).toBeNull();
    expect(evidence.manifests).toHaveLength(0);
    expect(evidence.urlLiterals).toHaveLength(0);
  });

  it('still exposes endpoint nodes from the graph when the path is gone', () => {
    const graph = graphFor('ghost', '/nonexistent/ghost-repo');
    graph.nodes.push({
      id: 'endpoint:routes.ts:GET /v1/things',
      type: 'endpoint',
      name: 'GET /v1/things',
      summary: '',
    });
    const evidence = collectRepoEvidence(graph);
    expect(evidence.endpointNodes).toHaveLength(1);
  });

  // 009-grpc-cross-repo-correlation
  it('collects served gRPC services as the union of grpc endpoint nodes and .proto service ids', () => {
    const graph = graphFor('catalog-service', path.join(FIXTURE_REPOS, 'catalog-service'));
    graph.nodes.push({
      id: 'endpoint:grpc:shop.CatalogService',
      type: 'endpoint',
      name: 'shop.CatalogService',
      summary: 'gRPC service',
    });
    const evidence = collectRepoEvidence(graph);
    // 'shop.CatalogService' from the graph node; 'CatalogService' from catalog.proto
    expect(evidence.grpcServices).toEqual(['CatalogService', 'shop.CatalogService']);
    expect(evidence.grpcClientRefs).toEqual([]);
  });

  it('collects gRPC client construction sites from repo source', () => {
    const evidence = collectRepoEvidence(
      graphFor('storefront', path.join(FIXTURE_REPOS, 'storefront'))
    );
    expect(evidence.grpcClientRefs).toHaveLength(1);
    expect(evidence.grpcClientRefs[0]).toMatchObject({
      relPath: 'internal/catalog/client.go',
      service: 'CatalogService',
      form: 'go',
    });
    expect(evidence.grpcServices).toEqual([]);
  });

  it('leaves both gRPC fields as empty arrays for a repo with no gRPC', () => {
    const evidence = collectRepoEvidence(
      graphFor('user-service', path.join(FIXTURE_REPOS, 'user-service'))
    );
    expect(evidence.grpcServices).toEqual([]);
    expect(evidence.grpcClientRefs).toEqual([]);
  });

  it('keeps the graph grpc-service contribution when the repo path is gone', () => {
    const graph = graphFor('ghost', '/nonexistent/ghost-repo');
    graph.nodes.push({
      id: 'endpoint:grpc:pkg.GhostService',
      type: 'endpoint',
      name: 'pkg.GhostService',
      summary: 'gRPC service',
    });
    const evidence = collectRepoEvidence(graph);
    expect(evidence.grpcClientRefs).toEqual([]);
    expect(evidence.grpcServices).toEqual(['pkg.GhostService']);
  });
});
