import { describe, expect, it } from 'vitest';
import type { RepoEvidence } from '../../src/correlate/evidence/types.js';
import {
  composePass,
  dedupeConnections,
  endpointPass,
  EVIDENCE_PASSES,
  grpcPass,
  manifestPass,
  schemaPass,
  topicPass,
  type CorrelationInput,
} from '../../src/correlate/evidence-passes.js';
import type { CrossRepositoryConnection } from '../../src/correlate/deterministic-correlator.js';

function emptyEvidence(name: string, root: string | null = `/repos/${name}`): RepoEvidence {
  return {
    name,
    root,
    manifests: [],
    composeFiles: [],
    schemaDigests: [],
    endpointNodes: [],
    topicRefs: [],
    urlLiterals: [],
    grpcServices: [],
    grpcClientRefs: [],
  };
}

function input(repos: RepoEvidence[]): CorrelationInput {
  return { repos, graphsByName: new Map() };
}

describe('manifestPass', () => {
  it('links a consumer to the unique publisher of a package name', () => {
    const lib = emptyEvidence('shared-lib');
    lib.manifests.push({
      ecosystem: 'npm',
      relPath: 'package.json',
      publishedNames: ['@acme/shared'],
      dependencies: [],
    });
    const app = emptyEvidence('web-app');
    app.manifests.push({
      ecosystem: 'npm',
      relPath: 'package.json',
      publishedNames: ['web-app'],
      dependencies: [{ name: '@acme/shared', version: '^1.0.0' }],
    });

    const { connections } = manifestPass(input([lib, app]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'web-app',
      targetRepo: 'shared-lib',
      type: 'depends_on',
      foundBy: 'evidence',
      weight: 0.6,
    });
    expect(connections[0]?.evidence[0]).toContain('@acme/shared');
  });

  it('upgrades local path specifiers resolving into another repo', () => {
    const lib = emptyEvidence('shared-lib', '/ws/shared-lib');
    const app = emptyEvidence('web-app', '/ws/web-app');
    app.manifests.push({
      ecosystem: 'npm',
      relPath: 'package.json',
      publishedNames: [],
      dependencies: [{ name: '@acme/shared', localPath: '../shared-lib' }],
    });
    const { connections } = manifestPass(input([lib, app]));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.weight).toBe(0.8);
  });

  it('skips ambiguous package names published by multiple repos, with a note', () => {
    const a = emptyEvidence('lib-a');
    const b = emptyEvidence('lib-b');
    for (const lib of [a, b]) {
      lib.manifests.push({
        ecosystem: 'npm',
        relPath: 'package.json',
        publishedNames: ['dupe'],
        dependencies: [],
      });
    }
    const c = emptyEvidence('consumer');
    c.manifests.push({
      ecosystem: 'npm',
      relPath: 'package.json',
      publishedNames: [],
      dependencies: [{ name: 'dupe' }],
    });
    const { connections, notes } = manifestPass(input([a, b, c]));
    expect(connections).toHaveLength(0);
    expect(notes[0]).toContain('ambiguous');
  });
});

describe('endpointPass', () => {
  function calleeWithEndpoint(): RepoEvidence {
    const callee = emptyEvidence('payments-api');
    callee.endpointNodes.push({
      id: 'endpoint:routes.ts:POST /v1/charge',
      type: 'endpoint',
      name: 'POST /v1/charge',
      summary: '',
    });
    return callee;
  }

  it('matches exact path+method at high weight', () => {
    const caller = emptyEvidence('web-app');
    caller.urlLiterals.push({
      relPath: 'src/api.ts',
      line: 3,
      path: '/v1/charge',
      method: 'POST',
      template: false,
    });
    const { connections } = endpointPass(input([caller, calleeWithEndpoint()]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      type: 'calls',
      weight: 0.85,
      targetRepo: 'payments-api',
    });
  });

  it('skips contradictory methods entirely', () => {
    const caller = emptyEvidence('web-app');
    caller.urlLiterals.push({
      relPath: 'src/api.ts',
      line: 3,
      path: '/v1/charge',
      method: 'GET',
      template: false,
    });
    const { connections } = endpointPass(input([caller, calleeWithEndpoint()]));
    expect(connections).toHaveLength(0);
  });

  it('matches gateway-prefixed caller paths against endpoint routes', () => {
    const caller = emptyEvidence('sdk');
    caller.urlLiterals.push({
      relPath: 'src/client.ts',
      line: 8,
      path: '/api/payments/v1/charge',
      method: 'POST',
      template: false,
    });
    const { connections } = endpointPass(input([caller, calleeWithEndpoint()]));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.weight).toBe(0.6);
    expect(connections[0]?.evidence[0]).toContain('/api/payments/v1/charge');
  });

  it('falls back to literal-vs-literal gateway-suffix matching, never equal paths', () => {
    const caller = emptyEvidence('go-sdk');
    caller.urlLiterals.push({
      relPath: 'notification/api.go',
      line: 19,
      path: '/api/notifications/v1/ws',
      template: false,
    });
    const callee = emptyEvidence('notification-service');
    callee.urlLiterals.push({ relPath: 'main.go', line: 86, path: '/v1/ws', template: false });

    const both = endpointPass(input([caller, callee]));
    expect(both.connections).toHaveLength(1);
    expect(both.connections[0]).toMatchObject({
      sourceRepo: 'go-sdk',
      targetRepo: 'notification-service',
      weight: 0.45,
    });

    // Two repos holding the identical literal are both clients — no match.
    const clientA = emptyEvidence('client-a');
    clientA.urlLiterals.push({
      relPath: 'a.ts',
      line: 1,
      path: '/auth/realms/x/token',
      template: false,
    });
    const clientB = emptyEvidence('client-b');
    clientB.urlLiterals.push({
      relPath: 'b.ts',
      line: 1,
      path: '/auth/realms/x/token',
      template: false,
    });
    expect(endpointPass(input([clientA, clientB])).connections).toHaveLength(0);
  });

  it('excludes OIDC infrastructure paths from the literal-vs-literal fallback', () => {
    // A gateway-prefixed Keycloak token path must not link two IdP *clients*.
    const sdkA = emptyEvidence('sdk-a');
    sdkA.urlLiterals.push({
      relPath: 'auth/api.go',
      line: 20,
      path: '/auth/realms/Acme/protocol/openid-connect/token',
      template: false,
    });
    const sdkB = emptyEvidence('sdk-b');
    sdkB.urlLiterals.push({
      relPath: 'transport.go',
      line: 33,
      path: '/protocol/openid-connect/token',
      template: false,
    });
    expect(endpointPass(input([sdkA, sdkB])).connections).toHaveLength(0);
  });

  it('demotes literals matching endpoints in multiple repos', () => {
    const caller = emptyEvidence('web-app');
    caller.urlLiterals.push({
      relPath: 'src/api.ts',
      line: 1,
      path: '/v1/charge',
      template: false,
    });
    const calleeA = calleeWithEndpoint();
    const calleeB = emptyEvidence('payments-api-v2');
    calleeB.endpointNodes.push({
      id: 'endpoint:routes.ts:POST /v1/charge',
      type: 'endpoint',
      name: 'POST /v1/charge',
      summary: '',
    });
    const { connections, notes } = endpointPass(input([caller, calleeA, calleeB]));
    expect(connections).toHaveLength(2);
    for (const c of connections) expect(c.weight).toBeLessThanOrEqual(0.45);
    expect(notes.some((n) => n.includes('demoted'))).toBe(true);
  });
});

describe('schemaPass', () => {
  it('links identical schema copies at high weight', () => {
    const a = emptyEvidence('producer');
    const b = emptyEvidence('consumer');
    const digest = { sha256: 'f'.repeat(64), identifiers: ['package:acme'], openapiPaths: [] };
    a.schemaDigests.push({ relPath: 'events.proto', ...digest });
    b.schemaDigests.push({ relPath: 'proto/events.proto', ...digest });
    const { connections } = schemaPass(input([a, b]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ type: 'depends_on', weight: 0.9 });
    expect(connections[0]?.evidence[0]).toContain('identical schema');
  });

  it('flags proto drift: same package + shared message, differing content', () => {
    const a = emptyEvidence('producer');
    const b = emptyEvidence('consumer');
    a.schemaDigests.push({
      relPath: 'events.proto',
      sha256: 'a'.repeat(64),
      identifiers: ['package:acme.events', 'message:PaymentCompleted'],
      openapiPaths: [],
    });
    b.schemaDigests.push({
      relPath: 'events.proto',
      sha256: 'b'.repeat(64),
      identifiers: ['package:acme.events', 'message:PaymentCompleted', 'message:Extra'],
      openapiPaths: [],
    });
    const { connections } = schemaPass(input([a, b]));
    expect(connections).toHaveLength(1);
    expect(connections[0]?.weight).toBe(0.4);
    expect(connections[0]?.evidence[0]).toContain('drift');
  });

  it('scores OpenAPI client coverage inclusively at the 50% boundary', () => {
    const api = emptyEvidence('devices-api');
    api.schemaDigests.push({
      relPath: 'openapi.yaml',
      sha256: 'c'.repeat(64),
      identifiers: [],
      openapiPaths: ['/devices/*', '/turn-credentials'],
    });
    const client = emptyEvidence('client');
    client.urlLiterals.push({ relPath: 'src/a.ts', line: 1, path: '/devices/42', template: false });
    const { connections } = schemaPass(input([api, client]));
    expect(connections).toHaveLength(1);
    // 1 of 2 paths = 50% — inclusive threshold produces the strong weight.
    expect(connections[0]).toMatchObject({
      sourceRepo: 'client',
      targetRepo: 'devices-api',
      weight: 0.7,
    });
  });
});

describe('composePass', () => {
  it('maps images to repos and surfaces well-known external systems', () => {
    const infra = emptyEvidence('infra');
    infra.composeFiles.push({
      relPath: 'docker-compose.yml',
      services: [
        {
          name: 'api',
          image: 'registry.acme.com/payments-api:1.2',
          environment: {},
          dependsOn: ['db'],
        },
        { name: 'db', image: 'postgres:16', environment: {}, dependsOn: [] },
        { name: 'broker', image: 'kafka:3', environment: {}, dependsOn: [] },
      ],
    });
    const api = emptyEvidence('payments-api');

    const { connections } = composePass(input([infra, api]));
    const deploys = connections.find((c) => c.type === 'deploys');
    expect(deploys).toMatchObject({ sourceRepo: 'infra', targetRepo: 'payments-api', weight: 0.6 });
    const externals = connections.filter((c) => c.targetNodeId.startsWith('external:'));
    expect(externals.map((c) => c.targetRepo).sort()).toEqual(['Kafka', 'PostgreSQL']);
  });

  it('wires depends_on and env URLs between repo-mapped services', () => {
    const infra = emptyEvidence('infra');
    infra.composeFiles.push({
      relPath: 'compose.yml',
      services: [
        {
          name: 'web-frontend',
          environment: { PAYMENTS_URL: 'http://payments-api:8080' },
          dependsOn: ['payments-api'],
        },
        { name: 'payments-api', environment: {}, dependsOn: [] },
      ],
    });
    const web = emptyEvidence('web-frontend');
    const api = emptyEvidence('payments-api');

    const { connections } = composePass(input([infra, web, api]));
    const dependsOn = connections.filter(
      (c) =>
        c.sourceRepo === 'web-frontend' &&
        c.targetRepo === 'payments-api' &&
        c.type === 'depends_on'
    );
    expect(dependsOn).toHaveLength(1);
    // depends_on and env-URL evidence merge into the deduped connection.
    expect(dependsOn[0]?.evidence.length).toBeGreaterThanOrEqual(1);
  });
});

describe('topicPass', () => {
  it('links cross-repo pub/sub on the same topic and skips noise words', () => {
    const producer = emptyEvidence('user-service');
    producer.topicRefs.push(
      { relPath: 'src/publisher.ts', line: 8, topic: 'user-created', role: 'pub' },
      { relPath: 'src/noise.ts', line: 1, topic: 'data', role: 'pub' }
    );
    const consumer = emptyEvidence('notification-service');
    consumer.topicRefs.push(
      { relPath: 'src/consumer.ts', line: 8, topic: 'user-created', role: 'sub' },
      { relPath: 'src/noise.ts', line: 1, topic: 'data', role: 'sub' }
    );
    const { connections, notes } = topicPass(input([producer, consumer]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'user-service',
      targetRepo: 'notification-service',
      type: 'publishes',
      weight: 0.65,
    });
    expect(notes.some((n) => n.includes('noise'))).toBe(true);
  });

  it('pairs unknown-role refs with a definite opposite at low weight', () => {
    const producer = emptyEvidence('user-service');
    producer.topicRefs.push({ relPath: 'src/p.ts', line: 1, topic: 'user-created', role: 'pub' });
    const maybe = emptyEvidence('worker');
    maybe.topicRefs.push({ relPath: 'src/w.ts', line: 1, topic: 'user-created', role: 'unknown' });
    const { connections } = topicPass(input([producer, maybe]));
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'user-service',
      targetRepo: 'worker',
      weight: 0.4,
    });
  });
});

describe('grpcPass registration & additivity (009)', () => {
  it('runs immediately after endpointPass in the fixed pass order', () => {
    const names = EVIDENCE_PASSES.map((p) => p({ repos: [], graphsByName: new Map() }).pass);
    expect(names).toEqual(['manifest', 'endpoint', 'grpc', 'schema', 'compose', 'topic']);
  });

  it('is a no-op for evidence with no gRPC services and no gRPC client refs', () => {
    const a = emptyEvidence('web');
    a.urlLiterals.push({ relPath: 'a.ts', line: 1, path: '/v1/things', template: false });
    const b = emptyEvidence('api');
    b.endpointNodes.push({
      id: 'endpoint:GET /v1/things',
      type: 'endpoint',
      name: 'GET /v1/things',
      summary: '',
    });
    const { connections, notes } = grpcPass(input([a, b]));
    expect(connections).toEqual([]);
    expect(notes).toEqual([]);
    // endpointPass still finds the HTTP link — grpcPass did not disturb it.
    expect(endpointPass(input([a, b])).connections).toHaveLength(1);
  });
});

describe('dedupeConnections', () => {
  it('keeps the best weight per (source, target, type) and merges evidence', () => {
    const base: Omit<CrossRepositoryConnection, 'weight' | 'evidence'> = {
      sourceRepo: 'a',
      sourceNodeId: 'n1',
      targetRepo: 'b',
      targetNodeId: 'n2',
      type: 'calls',
      foundBy: 'evidence',
    };
    const out = dedupeConnections([
      { ...base, weight: 0.5, evidence: ['first'] },
      { ...base, weight: 0.8, evidence: ['second'] },
      { ...base, weight: 0.3, evidence: ['third'] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.weight).toBe(0.8);
    expect(out[0]?.evidence).toContain('second');
    expect(out[0]?.evidence.length).toBeLessThanOrEqual(3);
  });
});
