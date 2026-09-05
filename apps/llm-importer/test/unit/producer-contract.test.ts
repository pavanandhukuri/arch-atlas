import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportConfig } from '../../src/config/config.schema.js';
import { runImport } from '../../src/analysis/run-import.js';
import { RepoAnalysisSchema } from '../../src/analysis/repo-analysis.schema.js';

/**
 * 010 SC-004: an independent producer, working only from the documented
 * schema, can hand-produce a {repo}.analysis.json the importer accepts and
 * correlates. Uses NO runner-package code — the object is written by hand here.
 */

let outputDir: string;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'producer-contract-'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(outputDir, { recursive: true, force: true });
});

// A hand-authored analysis artifact — the entire "producer" for this test.
const GATEWAY = {
  schemaVersion: '1.0',
  analyzedAt: '2026-08-31T00:00:00.000Z',
  repository: { name: 'gateway', path: '/repos/gateway' },
  description: 'API gateway proxying /api/orders to orders-service',
  languages: ['TypeScript'],
  frameworks: ['Express'],
  served: {
    httpRoutes: [{ method: 'POST', path: '/api/orders/v1/orders' }],
    grpcServices: [],
    topics: [],
    datastores: [],
  },
  outbound: [{ target: 'orders-service', verb: 'calls', detail: 'proxies orders traffic' }],
  analysisStatus: 'complete',
  retryCount: 0,
};

const ORDERS = {
  schemaVersion: '1.0',
  analyzedAt: '2026-08-31T00:00:00.000Z',
  repository: { name: 'orders-service', path: '/repos/orders-service' },
  description: 'Owns orders',
  languages: ['Go'],
  frameworks: ['Gin'],
  served: {
    httpRoutes: [{ method: 'POST', path: '/v1/orders', filePath: 'http.go' }],
    grpcServices: [],
    topics: [],
    datastores: [],
  },
  outbound: [],
  analysisStatus: 'complete',
  retryCount: 0,
};

function config(): ImportConfig {
  return {
    version: '2.0',
    output: { directory: outputDir, diagramFileName: 'architecture.arch.json' },
    repositories: [
      { path: '/repos/gateway', name: 'gateway' },
      { path: '/repos/orders-service', name: 'orders-service' },
    ],
  };
}

describe('analysis producer contract', () => {
  it('accepts a hand-written artifact and draws the expected connection (SC-004)', async () => {
    await writeFile(join(outputDir, 'gateway.analysis.json'), JSON.stringify(GATEWAY), 'utf8');
    await writeFile(
      join(outputDir, 'orders-service.analysis.json'),
      JSON.stringify(ORDERS),
      'utf8'
    );

    await runImport(config(), { verbose: false });

    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { candidates: Array<{ source: string; target: string }> };
    expect(
      review.candidates.some((c) => c.source === 'gateway' && c.target === 'orders-service')
    ).toBe(true);
  });

  it('rejects an artifact with a bumped schemaVersion', () => {
    expect(RepoAnalysisSchema.safeParse({ ...GATEWAY, schemaVersion: '2.0' }).success).toBe(false);
  });

  it('rejects an artifact missing `served`', () => {
    const { served: _served, ...noServed } = GATEWAY;
    expect(RepoAnalysisSchema.safeParse(noServed).success).toBe(false);
  });

  it('a bumped-version artifact on disk is named and skipped, not used', async () => {
    await writeFile(
      join(outputDir, 'gateway.analysis.json'),
      JSON.stringify({ ...GATEWAY, schemaVersion: '2.0' }),
      'utf8'
    );
    await writeFile(
      join(outputDir, 'orders-service.analysis.json'),
      JSON.stringify(ORDERS),
      'utf8'
    );
    await runImport(config(), { verbose: false });
    const review = JSON.parse(
      await readFile(join(outputDir, 'architecture.review.yaml'), 'utf8')
    ) as { source_repos: string[] };
    expect(review.source_repos).toEqual(['orders-service']);
  });
});
