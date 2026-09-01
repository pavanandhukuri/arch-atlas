import { describe, expect, it } from 'vitest';
import type { RepoEvidence } from '../../src/correlate/evidence/types.js';
import { grpcPass, type CorrelationInput } from '../../src/correlate/evidence-passes.js';
import type { RepositoryKnowledgeGraph } from '../../src/graph/schema.js';

function evidence(name: string, over: Partial<RepoEvidence> = {}): RepoEvidence {
  return {
    name,
    root: `/repos/${name}`,
    manifests: [],
    composeFiles: [],
    schemaDigests: [],
    endpointNodes: [],
    topicRefs: [],
    urlLiterals: [],
    grpcServices: [],
    grpcClientRefs: [],
    ...over,
  };
}

function input(repos: RepoEvidence[], graphs: RepositoryKnowledgeGraph[] = []): CorrelationInput {
  return { repos, graphsByName: new Map(graphs.map((g) => [g.repository.name, g])) };
}

function calleeGraph(name: string, service: string): RepositoryKnowledgeGraph {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-30T00:00:00Z',
    repository: { name, path: `/repos/${name}` },
    nodes: [
      { id: `module:${name}`, type: 'module', name, summary: '' },
      { id: `endpoint:grpc:${service}`, type: 'endpoint', name: service, summary: 'gRPC service' },
    ],
    edges: [],
    analysisStatus: 'complete',
    retryCount: 0,
  };
}

describe('grpcPass', () => {
  it('draws a directed calls connection from a stub construction to the served service', () => {
    const caller = evidence('storefront', {
      grpcClientRefs: [
        { relPath: 'internal/catalog/client.go', line: 21, service: 'CatalogService', form: 'go' },
      ],
    });
    const callee = evidence('catalog-service', { grpcServices: ['shop.CatalogService'] });
    const graph = calleeGraph('catalog-service', 'shop.CatalogService');

    const { pass, connections, notes } = grpcPass(input([caller, callee], [graph]));

    expect(pass).toBe('grpc');
    expect(notes).toEqual([]);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'storefront',
      targetRepo: 'catalog-service',
      type: 'calls',
      foundBy: 'evidence',
      transport: 'grpc',
      weight: 0.8,
      targetNodeId: 'endpoint:grpc:shop.CatalogService',
    });
    expect(connections[0]?.evidence[0]).toContain('internal/catalog/client.go:21');
    expect(connections[0]?.evidence[0]).toContain('CatalogService');
    expect(connections[0]?.evidence[0]).toContain('catalog-service');
  });

  it('falls back to the callee module node when the served name has no grpc endpoint node', () => {
    const caller = evidence('storefront', {
      grpcClientRefs: [{ relPath: 'client.go', line: 3, service: 'CatalogService', form: 'go' }],
    });
    // served name only from a .proto `service:` id — no graphsByName entry
    const callee = evidence('catalog-service', { grpcServices: ['CatalogService'] });
    const { connections } = grpcPass(input([caller, callee]));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.targetNodeId).toBe('module:catalog-service');
  });

  it('weights a generic-form match lower (0.7) than a specific-form match', () => {
    const caller = evidence('client-repo', {
      grpcClientRefs: [{ relPath: 'c.rb', line: 1, service: 'CatalogService', form: 'generic' }],
    });
    const callee = evidence('catalog-service', { grpcServices: ['CatalogService'] });
    const { connections } = grpcPass(input([caller, callee]));
    expect(connections[0]?.weight).toBe(0.7);
  });

  it('never produces a self-connection when the caller also serves the service', () => {
    const repo = evidence('catalog-service', {
      grpcServices: ['CatalogService'],
      grpcClientRefs: [
        { relPath: 'internal/test.go', line: 9, service: 'CatalogService', form: 'go' },
      ],
    });
    const { connections } = grpcPass(input([repo]));
    expect(connections).toEqual([]);
  });

  it('produces nothing (and no note) when no repo serves the referenced service', () => {
    const caller = evidence('storefront', {
      grpcClientRefs: [{ relPath: 'c.go', line: 1, service: 'MysteryService', form: 'go' }],
    });
    const other = evidence('catalog-service', { grpcServices: ['CatalogService'] });
    const { connections, notes } = grpcPass(input([caller, other]));
    expect(connections).toEqual([]);
    expect(notes).toEqual([]);
  });

  it('demotes and annotates when two repos serve a matching service', () => {
    const caller = evidence('gateway', {
      grpcClientRefs: [{ relPath: 'rpc.go', line: 4, service: 'PaymentService', form: 'go' }],
    });
    const protoDigest = {
      relPath: 'api/payment.proto',
      sha256: 'x',
      identifiers: ['service:PaymentService'],
      openapiPaths: [] as string[],
    };
    const a = evidence('payments-primary', {
      grpcServices: ['shop.PaymentService'],
      schemaDigests: [protoDigest],
    });
    const b = evidence('payments-fallback', {
      grpcServices: ['other.PaymentService'],
      schemaDigests: [protoDigest],
    });
    const { connections, notes } = grpcPass(input([caller, a, b]));
    expect(connections).toHaveLength(2);
    for (const c of connections) expect(c.weight).toBeLessThanOrEqual(0.45);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('payments-primary');
    expect(notes[0]).toContain('payments-fallback');
  });

  it('collapses repeated client refs for the same pair into one connection', () => {
    const caller = evidence('storefront', {
      grpcClientRefs: [
        { relPath: 'a.go', line: 1, service: 'CatalogService', form: 'go' },
        { relPath: 'b.go', line: 2, service: 'shop.CatalogService', form: 'go' },
        { relPath: 'c.go', line: 3, service: 'CatalogService', form: 'generic' },
      ],
    });
    const callee = evidence('catalog-service', { grpcServices: ['CatalogService'] });
    const { connections } = grpcPass(input([caller, callee]));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.evidence.length).toBeLessThanOrEqual(3);
  });

  it('matches a package-qualified served name against a bare Go stub capture', () => {
    const caller = evidence('checkoutservice', {
      grpcClientRefs: [{ relPath: 'main.go', line: 5, service: 'CartService', form: 'go' }],
    });
    const callee = evidence('cartservice', { grpcServices: ['hipstershop.CartService'] });
    const { connections } = grpcPass(input([caller, callee]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'checkoutservice',
      targetRepo: 'cartservice',
    });
  });

  it('is deterministic: identical input yields an identical ordered result', () => {
    const caller = evidence('a', {
      grpcClientRefs: [
        { relPath: 'x.go', line: 2, service: 'CartService', form: 'go' },
        { relPath: 'y.go', line: 1, service: 'ShippingService', form: 'go' },
      ],
    });
    const c1 = evidence('cartservice', { grpcServices: ['CartService'] });
    const c2 = evidence('shippingservice', { grpcServices: ['ShippingService'] });
    const run = (): string => JSON.stringify(grpcPass(input([caller, c1, c2])).connections);
    expect(run()).toBe(run());
  });

  it('only accepts a repo as callee when the served name relates to its name (garbage-list defense)', () => {
    // `frontend` is really a pure client; the analysis over-reported it as
    // serving CartService. `currencyservice` vendored the whole .proto and
    // "serves" every service. Neither should become a callee for CartService.
    const frontend = evidence('frontend', {
      grpcServices: ['hipstershop.CartService'],
      grpcClientRefs: [{ relPath: 'rpc.go', line: 3, service: 'CartService', form: 'go' }],
    });
    const currency = evidence('currencyservice', {
      grpcServices: ['CartService', 'AdService', 'CurrencyService', 'PaymentService'],
    });
    const cart = evidence('cartservice', { grpcServices: ['hipstershop.CartService'] });
    const checkout = evidence('checkoutservice', {
      grpcClientRefs: [{ relPath: 'main.go', line: 7, service: 'CartService', form: 'go' }],
    });

    const { connections } = grpcPass(input([frontend, currency, cart, checkout]));
    // Only the real server (name-related) is reached — one connection per caller,
    // at full weight (no ambiguity demotion).
    expect(connections.map((c) => `${c.sourceRepo}->${c.targetRepo}`).sort()).toEqual([
      'checkoutservice->cartservice',
      'frontend->cartservice',
    ]);
    expect(connections.every((c) => c.weight === 0.8)).toBe(true);
  });

  it('accepts a callee whose served name is proto-declared even if unrelated to the repo name', () => {
    const caller = evidence('web', {
      grpcClientRefs: [{ relPath: 'c.go', line: 1, service: 'LedgerService', form: 'go' }],
    });
    const backend = evidence('backend-svc', {
      grpcServices: ['fin.LedgerService'],
      schemaDigests: [
        {
          relPath: 'api/ledger.proto',
          sha256: 'x',
          identifiers: ['service:LedgerService'],
          openapiPaths: [],
        },
      ],
    });
    const { connections } = grpcPass(input([caller, backend]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'web',
      targetRepo: 'backend-svc',
      weight: 0.8,
    });
  });

  it('returns an empty result when no repo has gRPC evidence at all', () => {
    const a = evidence('a');
    const b = evidence('b');
    expect(grpcPass(input([a, b]))).toEqual({ pass: 'grpc', connections: [], notes: [] });
  });
});
