import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherContext } from '../../src/analysis/gather-context.js';
import {
  serializeContextBundle,
  readContextBundle,
  ContextBundleSchema,
  ContextBundleVersionError,
  CONTEXT_BUNDLE_VERSION,
} from '../../src/analysis/context-bundle.js';

const FIXTURE_REPOS = join(import.meta.dirname, '../fixtures/repos');

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-bundle-'));
  const path = join(dir, name);
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('context bundle', () => {
  it('round-trips gatherContext output through serialize → JSON → readContextBundle (CB4)', () => {
    const ctx = gatherContext('user-service', join(FIXTURE_REPOS, 'user-service'));
    const bundle = serializeContextBundle(ctx);

    expect(bundle.schemaVersion).toBe(CONTEXT_BUNDLE_VERSION);
    expect(bundle.repoName).toBe('user-service');
    expect(ContextBundleSchema.safeParse(bundle).success).toBe(true);

    const path = tmpFile('user-service.context.json', JSON.stringify(bundle, null, 2));
    const read = readContextBundle(path);
    rmSync(join(path, '..'), { recursive: true, force: true });

    expect(read).toEqual(bundle);
    // non-metadata fields deep-equal the AnalysisContext
    expect(read.readmes).toEqual(ctx.readmes);
    expect(read.manifests).toEqual(ctx.manifests);
    expect(read.sourceExcerpts).toEqual(ctx.sourceExcerpts);
    expect(read.detected).toEqual(ctx.detected);
    expect(read.listing).toEqual(ctx.listing);
    expect(read.totalBytes).toBe(ctx.totalBytes);
  });

  it('never carries a secret-path file — user-service has a planted .env (CB1)', () => {
    const ctx = gatherContext('user-service', join(FIXTURE_REPOS, 'user-service'));
    const bundle = serializeContextBundle(ctx);
    const everyPath = [
      ...bundle.readmes.map((f) => f.relPath),
      ...bundle.manifests.map((f) => f.relPath),
      ...bundle.dependencySplits.map((d) => d.relPath),
      ...bundle.sourceExcerpts.map((e) => e.relPath),
      ...bundle.listing,
    ];
    expect(everyPath.some((p) => p.includes('.env'))).toBe(false);
  });

  it('rejects a version-mismatched bundle with an actionable error (CB5)', () => {
    const ctx = gatherContext('user-service', join(FIXTURE_REPOS, 'user-service'));
    const bundle = { ...serializeContextBundle(ctx), schemaVersion: '9.9' };
    const path = tmpFile('bad.context.json', JSON.stringify(bundle));
    try {
      expect(() => readContextBundle(path)).toThrow(ContextBundleVersionError);
      expect(() => readContextBundle(path)).toThrow(/gather-context/);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });

  it('rejects a structurally invalid bundle', () => {
    const path = tmpFile(
      'junk.context.json',
      JSON.stringify({ schemaVersion: CONTEXT_BUNDLE_VERSION })
    );
    try {
      expect(() => readContextBundle(path)).toThrow();
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });

  it('handles a repo whose path does not exist — empty bundle, still valid', () => {
    const ctx = gatherContext('ghost', '/nonexistent/ghost-repo');
    const bundle = serializeContextBundle(ctx);
    expect(ContextBundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.sourceExcerpts).toEqual([]);
  });
});
