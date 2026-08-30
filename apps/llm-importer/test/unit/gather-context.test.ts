import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  gatherContext,
  parseDependencySplit,
  detectInterfaces,
} from '../../src/analysis/gather-context.js';
import {
  MAX_README_FILES,
  MAX_README_TOTAL_BYTES,
  MAX_SOURCE_FILES,
  MAX_TOTAL_CONTEXT_BYTES,
} from '../../src/analysis/context-limits.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'repos');
const userService = join(FIXTURES, 'user-service');
const notificationService = join(FIXTURES, 'notification-service');

describe('gatherContext', () => {
  it('collects the README and package.json with content', () => {
    const ctx = gatherContext('user-service', userService);
    expect(ctx.readmes.map((r) => r.relPath)).toContain('README.md');
    expect(ctx.readmes[0]?.text).toMatch(/user accounts/i);
    expect(ctx.manifests.map((m) => m.relPath)).toContain('package.json');
    expect(ctx.manifests.find((m) => m.relPath === 'package.json')?.text).toMatch(/"pg"/);
  });

  it('lists repo-relative source paths without their content', () => {
    const ctx = gatherContext('user-service', userService);
    expect(ctx.listing).toContain('src/http.ts');
    expect(ctx.listing).toContain('src/db.ts');
    expect(ctx.listing).toContain('src/publisher.ts');
    expect(ctx.listing.every((p) => typeof p === 'string')).toBe(true);
  });

  it('NEVER reads the planted .env into any part of the context (FR-015 / SC-007)', () => {
    const ctx = gatherContext('user-service', userService);
    const blob = JSON.stringify(ctx);
    expect(blob).not.toMatch(/FAKE_API_KEY/);
    expect(ctx.listing).not.toContain('.env');
    expect(ctx.readmes.some((r) => r.relPath === '.env')).toBe(false);
    expect(ctx.manifests.some((m) => m.relPath === '.env')).toBe(false);
    expect(ctx.sourceExcerpts.some((s) => s.relPath === '.env')).toBe(false);
  });

  it('ranks entrypoint / interface-ish source files into the excerpts', () => {
    const ctx = gatherContext('notification-service', notificationService);
    const picked = ctx.sourceExcerpts.map((s) => s.relPath);
    // server.ts (entrypoint pattern) and consumer.ts (consumer pattern) should be picked.
    expect(picked).toContain('src/server.ts');
    expect(picked).toContain('src/consumer.ts');
    expect(ctx.sourceExcerpts.length).toBeLessThanOrEqual(MAX_SOURCE_FILES);
    for (const ex of ctx.sourceExcerpts) expect(ex.text.length).toBeGreaterThan(0);
  });

  it('stays within the total-context byte ceiling', () => {
    const ctx = gatherContext('user-service', userService);
    expect(ctx.totalBytes).toBeLessThanOrEqual(MAX_TOTAL_CONTEXT_BYTES);
  });

  it('carries through the description hint when given', () => {
    const ctx = gatherContext('user-service', userService, 'the accounts service');
    expect(ctx.descriptionHint).toBe('the accounts service');
  });

  it('returns empty collections for a path with nothing interesting', () => {
    const ctx = gatherContext('empty', join(FIXTURES, 'does-not-exist-xyz'));
    expect(ctx.readmes).toEqual([]);
    expect(ctx.manifests).toEqual([]);
    expect(ctx.listing).toEqual([]);
    expect(ctx.sourceExcerpts).toEqual([]);
  });
});

describe('gatherContext — budgeting (reliability fix)', () => {
  let tmp: string;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('caps README count and byte budget so a README-heavy repo still gets source excerpts', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gc-budget-'));
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), '{"name":"big","dependencies":{"express":"*"}}');
    // 12 READMEs at various depths, each ~10 KB — far more than the budget allows.
    writeFileSync(join(tmp, 'README.md'), '# root\n' + 'x'.repeat(10_000));
    for (let i = 0; i < 11; i++) {
      const d = join(tmp, `mod${i}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'README.md'), `# mod${i}\n` + 'y'.repeat(10_000));
    }
    // A handful of interface-ish source files.
    for (const name of ['server.ts', 'routes.ts', 'consumer.ts', 'index.ts']) {
      writeFileSync(join(tmp, 'src', name), `// ${name}\nexport const x = 1;\n`);
    }

    const ctx = gatherContext('big', tmp);

    expect(ctx.readmes.length).toBeLessThanOrEqual(MAX_README_FILES);
    const readmeBytes = ctx.readmes.reduce((n, r) => n + r.text.length, 0);
    expect(readmeBytes).toBeLessThanOrEqual(MAX_README_TOTAL_BYTES);
    // The root README wins the shallowest-first ordering.
    expect(ctx.readmes[0]?.relPath).toBe('README.md');
    // Source excerpts are NOT starved.
    expect(ctx.sourceExcerpts.length).toBeGreaterThan(0);
    expect(ctx.sourceExcerpts.map((s) => s.relPath)).toContain('src/server.ts');
    expect(ctx.totalBytes).toBeLessThanOrEqual(MAX_TOTAL_CONTEXT_BYTES);
  });

  it('does not treat every markdown file under docs/ as a README', () => {
    tmp = mkdtempSync(join(tmpdir(), 'gc-docs-'));
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'README.md'), '# docs index');
    writeFileSync(join(tmp, 'docs', 'adr-0001-something.md'), '# an ADR, not a readme');
    writeFileSync(join(tmp, 'docs', 'changelog.md'), '# changelog');

    const ctx = gatherContext('d', tmp);
    const paths = ctx.readmes.map((r) => r.relPath);
    expect(paths).toContain('docs/README.md');
    expect(paths).not.toContain('docs/adr-0001-something.md');
    expect(paths).not.toContain('docs/changelog.md');
  });
});

describe('parseDependencySplit (research.md D14.2)', () => {
  it('separates dependencies from devDependencies for package.json', () => {
    const split = parseDependencySplit(
      'package.json',
      JSON.stringify({
        dependencies: { express: '^4', pg: '^8' },
        devDependencies: { vitest: '^1', typescript: '^5' },
      })
    );
    expect(split?.dependencies).toEqual(['express', 'pg']);
    expect(split?.devDependencies).toEqual(['typescript', 'vitest']);
  });
  it('returns null for a non-JSON manifest (go.mod) and for empty package.json', () => {
    expect(parseDependencySplit('go.mod', 'module x\n\ngo 1.22\n')).toBeNull();
    expect(parseDependencySplit('package.json', '{"name":"x"}')).toBeNull();
  });
});

describe('detectInterfaces (research.md D14.5)', () => {
  it('pulls route + topic literals out of the source excerpts', () => {
    const detected = detectInterfaces([
      {
        relPath: 'src/routes.ts',
        truncated: false,
        text: `app.post('/api/orders/v1/create', h);\nconsumer.subscribe('orders.created');`,
      },
    ]);
    expect(detected.httpRoutes.some((r) => r.path === '/api/orders/v1/create')).toBe(true);
    expect(detected.topics.some((t) => t.name === 'orders.created')).toBe(true);
  });
  it('ignores non-code excerpts', () => {
    const detected = detectInterfaces([
      { relPath: 'README.md', truncated: false, text: 'curl http://x/api/v1/thing' },
    ]);
    expect(detected.httpRoutes).toEqual([]);
  });
});

describe('gatherContext — D14 additions on the fixture repos', () => {
  it('populates dependencySplits and detected interfaces for user-service', () => {
    const ctx = gatherContext('user-service', userService);
    const pkg = ctx.dependencySplits.find((d) => d.relPath === 'package.json');
    expect(pkg?.dependencies).toContain('pg');
    // publisher.ts publishes the user-created topic
    expect(ctx.detected.topics.some((t) => t.name === 'user-created')).toBe(true);
  });
});
