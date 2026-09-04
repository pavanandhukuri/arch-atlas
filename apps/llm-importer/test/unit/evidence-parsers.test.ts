import { describe, expect, it } from 'vitest';
import {
  parseNpmManifest,
  parseGoModManifest,
  parsePomManifest,
  parseGradleManifest,
  parseCargoManifest,
  parsePyprojectManifest,
  parseManifest,
} from '../../src/correlate/evidence/parsers/manifests.js';
import {
  extractUrlLiterals,
  isGatewayPrefixedVariant,
  normalizeRoutePath,
  parseEndpointRoute,
  pathsEqual,
  staticSegmentCount,
} from '../../src/correlate/evidence/parsers/routes.js';
import { extractSchemaDigest, isSchemaish } from '../../src/correlate/evidence/parsers/schemas.js';
import { parseComposeFile, isComposeFile } from '../../src/correlate/evidence/parsers/compose.js';
import { extractTopicRefs, isNoiseTopic } from '../../src/correlate/evidence/parsers/topics.js';

describe('manifest parsers', () => {
  it('parses npm dependencies including local file: specifiers', () => {
    const manifest = parseNpmManifest(
      'package.json',
      JSON.stringify({
        name: 'web-frontend',
        dependencies: { '@acme/shared': 'file:../shared-lib', axios: '^1.0.0' },
      })
    );
    expect(manifest?.publishedNames).toEqual(['web-frontend']);
    expect(manifest?.dependencies).toContainEqual({
      name: '@acme/shared',
      version: 'file:../shared-lib',
      localPath: '../shared-lib',
    });
  });

  it('parses go.mod module path, require block, and local replace directives', () => {
    const manifest = parseGoModManifest(
      'go.mod',
      `module lenovo.com/sdks/udsmultimodal\n\nrequire (\n\tgithub.com/pkg/errors v0.9.1\n)\nreplace lenovo.com/shared => ../shared\n`
    );
    expect(manifest.publishedNames).toEqual(['lenovo.com/sdks/udsmultimodal']);
    expect(manifest.dependencies).toContainEqual({
      name: 'github.com/pkg/errors',
      version: 'v0.9.1',
    });
    expect(manifest.dependencies).toContainEqual({
      name: 'lenovo.com/shared',
      localPath: '../shared',
    });
  });

  it('parses pom.xml published coordinates excluding parent/dependency blocks', () => {
    const manifest = parsePomManifest(
      'pom.xml',
      `<project><parent><groupId>org.spring</groupId><artifactId>parent</artifactId></parent>
       <groupId>com.lenovo</groupId><artifactId>data-service</artifactId>
       <dependencies><dependency><groupId>com.lenovo</groupId><artifactId>commons</artifactId></dependency></dependencies></project>`
    );
    expect(manifest.publishedNames).toEqual(['com.lenovo:data-service']);
    expect(manifest.dependencies).toEqual([{ name: 'com.lenovo:commons' }]);
  });

  it('parses gradle implementation strings', () => {
    const manifest = parseGradleManifest(
      'build.gradle.kts',
      `dependencies {\n  implementation("io.ktor:ktor-client:2.0.0")\n  testImplementation("junit:junit")\n}`
    );
    expect(manifest.dependencies).toContainEqual({
      name: 'io.ktor:ktor-client',
      version: '2.0.0',
    });
  });

  it('dispatches by basename and returns null for non-manifests', () => {
    expect(parseManifest('src/index.ts', 'code')).toBeNull();
    expect(parseManifest('sub/dir/go.mod', 'module m')?.ecosystem).toBe('go');
  });
});

describe('route normalization and matching', () => {
  it('collapses params of every style to *', () => {
    expect(normalizeRoutePath('/users/{id}/orders/:orderId')).toBe('/users/*/orders/*');
    expect(normalizeRoutePath('/blobs/${blobId}/data')).toBe('/blobs/*/data');
    expect(normalizeRoutePath('/users/$userId/blobs')).toBe('/users/*/blobs');
    expect(normalizeRoutePath('https://api.acme.com/v1/charge/')).toBe('/v1/charge');
  });

  it('matches gateway-prefixed variants but never identical paths', () => {
    expect(isGatewayPrefixedVariant('/api/notifications/v1/ws', '/v1/ws')).toBe(true);
    expect(isGatewayPrefixedVariant('/api/data/v1/users/*/blobs', '/v1/users/*/blobs')).toBe(true);
    expect(isGatewayPrefixedVariant('/v1/ws', '/v1/ws')).toBe(false);
    expect(isGatewayPrefixedVariant('/v1/ws', '/api/notifications/v1/ws')).toBe(false);
    expect(isGatewayPrefixedVariant('/api/other/v2/ws', '/v1/ws')).toBe(false);
  });

  it('rejects wildcard-only overlap — trailing-wildcard routes match nothing concrete', () => {
    // Observed against a real workspace: "/devices/*/*" must not suffix-match
    // arbitrary two-segment paths through pure wildcard alignment.
    expect(isGatewayPrefixedVariant('/devices/*/*', '/v1/foo')).toBe(false);
    expect(isGatewayPrefixedVariant('/devices/*/*', '/*/upload')).toBe(false);
    expect(pathsEqual('/*/upload', '/devices/*')).toBe(false);
    // Still fine when a concrete segment agrees.
    expect(pathsEqual('/devices/42', '/devices/*')).toBe(true);
    // minConcrete=2 for the literal-vs-literal fallback.
    expect(isGatewayPrefixedVariant('/api/notifications/v1/ws', '/v1/ws', 2)).toBe(true);
    expect(isGatewayPrefixedVariant('/api/x/v1/*', '/v1/*', 2)).toBe(false);
  });

  it('pathsEqual tolerates wildcards on either side', () => {
    expect(pathsEqual('/users/*/orders', '/users/{id}/orders'.replace('{id}', '*'))).toBe(true);
    expect(pathsEqual('/users/42/orders', '/users/*/orders')).toBe(true);
    expect(pathsEqual('/users/42', '/users/42/orders')).toBe(false);
  });

  it('recovers method+path from endpoint node name or id tail', () => {
    expect(
      parseEndpointRoute({
        id: 'endpoint:openapi.yaml:POST /devices/{deviceId}',
        type: 'endpoint',
        name: 'POST /devices/{deviceId}',
        summary: '',
      })
    ).toEqual({ method: 'POST', path: '/devices/*' });
  });

  it('extracts url literals with callsite and options-object method hints', () => {
    const literals = extractUrlLiterals(
      'src/api.ts',
      `await axios.get("/v1/users/42");\nawait fetch("/v1/charge", { method: "POST" });\nconst notAUrl = "hello world";`
    );
    expect(literals).toHaveLength(2);
    expect(literals[0]).toMatchObject({ path: '/v1/users/42', method: 'GET' });
    expect(literals[1]).toMatchObject({ path: '/v1/charge', method: 'POST' });
  });

  it('drops one-segment noise paths and flags template interpolation', () => {
    const literals = extractUrlLiterals(
      'src/api.ts',
      'const a = "/api"; const b = `/v1/users/${id}/orders`;'
    );
    expect(literals).toHaveLength(1);
    expect(literals[0]).toMatchObject({ path: '/v1/users/*/orders', template: true });
  });

  // --- 012: static-segment specificity ---

  it('staticSegmentCount counts only non-wildcard segments', () => {
    expect(staticSegmentCount('/product/*')).toBe(1);
    expect(staticSegmentCount('/product/*/*')).toBe(1);
    expect(staticSegmentCount('/api/v1/*')).toBe(2);
    expect(staticSegmentCount('/*/*')).toBe(0);
    expect(staticSegmentCount('/v1/charge')).toBe(2);
  });
});

describe('schema digests', () => {
  it('extracts proto package, messages, and services', () => {
    const digest = extractSchemaDigest(
      'events.proto',
      `syntax = "proto3";\npackage acme.events;\nmessage PaymentCompleted { string id = 1; }\nservice Events { }\n`
    );
    expect(digest.identifiers).toContain('package:acme.events');
    expect(digest.identifiers).toContain('message:PaymentCompleted');
    expect(digest.openapiPaths).toEqual([]);
  });

  it('extracts normalized openapi paths', () => {
    const digest = extractSchemaDigest(
      'openapi.yaml',
      `openapi: 3.0.0\ninfo:\n  title: Devices API\npaths:\n  /devices/{deviceId}:\n    get:\n      operationId: getDevice\n`
    );
    expect(digest.openapiPaths).toEqual(['/devices/*']);
    expect(digest.identifiers).toContain('title:Devices API');
    expect(digest.identifiers).toContain('operation:getDevice');
  });

  it('recognizes schema-ish file names', () => {
    expect(isSchemaish('proto/events.proto')).toBe(true);
    expect(isSchemaish('docs/openapi.yaml')).toBe(true);
    expect(isSchemaish('src/index.ts')).toBe(false);
  });
});

describe('compose parsing', () => {
  it('parses services with build context, image, env, and depends_on', () => {
    const compose = parseComposeFile(
      'docker-compose.yml',
      `services:\n  api:\n    build: ./payments-api\n    environment:\n      DB_URL: postgres://db:5432/x\n    depends_on:\n      - db\n  db:\n    image: postgres:16\n`
    );
    expect(compose?.services).toHaveLength(2);
    expect(compose?.services[0]).toMatchObject({
      name: 'api',
      buildContext: './payments-api',
      dependsOn: ['db'],
    });
    expect(compose?.services[1]).toMatchObject({ name: 'db', image: 'postgres:16' });
  });

  it('recognizes compose file names', () => {
    expect(isComposeFile('docker-compose.prod.yaml')).toBe(true);
    expect(isComposeFile('compose.yml')).toBe(true);
    expect(isComposeFile('src/compose-thing.ts')).toBe(false);
  });
});

describe('parser edge cases', () => {
  it('returns null for invalid npm JSON and unparseable compose YAML', () => {
    expect(parseNpmManifest('package.json', '{not json')).toBeNull();
    expect(parseComposeFile('compose.yml', ':\n  - bad\n :')).toBeNull();
    expect(parseComposeFile('compose.yml', 'just-a-string')).toBeNull();
  });

  it('parses cargo package name and path dependencies', () => {
    const manifest = parseCargoManifest(
      'Cargo.toml',
      `[package]\nname = "my-crate"\n[dependencies]\nshared = { path = "../shared" }\nserde = "1.0"\n`
    );
    expect(manifest.publishedNames).toEqual(['my-crate']);
    expect(manifest.dependencies).toContainEqual({ name: 'shared', localPath: '../shared' });
  });

  it('parses pyproject PEP 621 and poetry dependencies', () => {
    const manifest = parsePyprojectManifest(
      'pyproject.toml',
      `[project]\nname = "svc"\ndependencies = ["requests>=2", "pydantic"]\n[tool.poetry.dependencies]\npython = "^3.11"\nhttpx = "*"\n`
    );
    expect(manifest.publishedNames).toEqual(['svc']);
    const names = manifest.dependencies.map((d) => d.name);
    expect(names).toContain('requests');
    expect(names).toContain('httpx');
    expect(names).not.toContain('python');
  });

  it('hashes unknown schema formats and extracts graphql type names', () => {
    const unknown = extractSchemaDigest('schema.avsc', '{"type":"record"}');
    expect(unknown.identifiers).toEqual([]);
    expect(unknown.sha256).toHaveLength(64);
    const gql = extractSchemaDigest('schema.graphql', 'type User { id: ID! }\nenum Role { ADMIN }');
    expect(gql.identifiers).toEqual(['type:User', 'type:Role']);
  });

  it('resolves chained multi-line callsite method hints', () => {
    const literals = extractUrlLiterals('src/api.ts', 'await axios.post(\n  "/v1/charge")');
    expect(literals[0]).toMatchObject({ path: '/v1/charge', method: 'POST' });
  });

  it('rejects non-path strings in normalizeRoutePath', () => {
    expect(normalizeRoutePath('not-a-path')).toBe('');
    expect(normalizeRoutePath('  ')).toBe('');
  });
});

describe('topic extraction', () => {
  it('extracts pub, sub, and unknown-role kafka topic refs', () => {
    const refs = extractTopicRefs(
      'src/events.ts',
      `producer.send({ topic: 'user-created', messages: [] });\nconsumer.subscribe({ topic: 'user-created' });\nbus.publish("payment.completed", data);\n`
    );
    const topics = refs.map((r) => `${r.topic}:${r.role}`);
    expect(topics).toContain('user-created:unknown');
    expect(topics).toContain('payment.completed:pub');
  });

  it('classifies noise topics', () => {
    expect(isNoiseTopic('data')).toBe(true);
    expect(isNoiseTopic('abc')).toBe(true);
    expect(isNoiseTopic('user-created')).toBe(false);
  });
});
