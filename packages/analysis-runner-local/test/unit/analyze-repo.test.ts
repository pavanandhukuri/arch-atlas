import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ContextBundle } from '@arch-atlas/llm-importer';

const chatCompleteMock = vi.fn();
vi.mock('../../src/openai-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/openai-client.js')>(
    '../../src/openai-client.js'
  );
  return { ...actual, chatComplete: chatCompleteMock };
});

const { analyzeRepoLocal } = await import('../../src/analyze-repo.js');

const VALID_JSON = JSON.stringify({
  description: 'a Go service',
  languages: ['Go'],
  frameworks: ['Gin', 'vitest'],
  served: {
    httpRoutes: [
      { method: 'GET', path: '/v1/orders' },
      { method: 'GET', path: '/health' },
    ],
    grpcServices: [],
    topics: [],
    datastores: [],
  },
  outbound: [],
});

const BUNDLE: ContextBundle = {
  schemaVersion: '1.0',
  generatedAt: '2026-08-31T00:00:00.000Z',
  repoName: 'orders',
  repoPath: '/repos/orders',
  readmes: [{ relPath: 'README.md', text: '# orders' }],
  manifests: [],
  dependencySplits: [],
  listing: ['cmd/main.go'],
  sourceExcerpts: [{ relPath: 'cmd/main.go', text: 'package main', truncated: false }],
  detected: { httpRoutes: [], topics: [] },
  totalBytes: 42,
};

beforeEach(() => chatCompleteMock.mockReset());

function opts(over: Record<string, unknown> = {}): Parameters<typeof analyzeRepoLocal>[0] {
  return {
    repoName: 'orders',
    input: { bundle: BUNDLE },
    endpoint: 'http://x/v1',
    modelId: 'm',
    temperature: 0.1,
    ...over,
  } as Parameters<typeof analyzeRepoLocal>[0];
}

describe('analyzeRepoLocal', () => {
  it('happy path: parses, sanitizes frameworks + operational routes, returns complete', async () => {
    chatCompleteMock.mockResolvedValue(VALID_JSON);
    const r = await analyzeRepoLocal(opts());
    expect(r.status).toBe('complete');
    if (r.status === 'failed') throw new Error('unexpected');
    expect(r.analysis.repository.name).toBe('orders');
    expect(r.analysis.frameworks).toEqual(['Gin']); // vitest stripped
    expect(r.analysis.served.httpRoutes.map((h) => h.path)).toEqual(['/v1/orders']); // /health stripped
    expect(chatCompleteMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on unparseable output, then succeeds', async () => {
    chatCompleteMock.mockResolvedValueOnce('not json at all').mockResolvedValueOnce(VALID_JSON);
    const r = await analyzeRepoLocal(opts());
    expect(r.status).toBe('complete');
    expect(chatCompleteMock).toHaveBeenCalledTimes(2);
  });

  it('fails after a second unusable response', async () => {
    chatCompleteMock.mockResolvedValue('still not json');
    const r = await analyzeRepoLocal(opts());
    expect(r.status).toBe('failed');
    expect(chatCompleteMock).toHaveBeenCalledTimes(2);
  });

  it('salvages a partial response and reports status "partial"', async () => {
    chatCompleteMock.mockResolvedValue(
      JSON.stringify({
        description: 'x',
        languages: ['Go'],
        frameworks: [],
        served: 'broken',
        outbound: 'broken',
      })
    );
    const r = await analyzeRepoLocal(opts());
    expect(r.status).toBe('partial');
    if (r.status === 'failed') throw new Error('unexpected');
    expect(r.analysis.analysisStatus).toBe('partial');
  });

  it('runs a grounding verify pass when verifyGrounding is set', async () => {
    chatCompleteMock.mockResolvedValueOnce(VALID_JSON).mockResolvedValueOnce(
      JSON.stringify({
        description: 'a Go service',
        languages: ['Go'],
        frameworks: ['Gin'],
        served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
        outbound: [],
      })
    );
    const r = await analyzeRepoLocal(opts({ verifyGrounding: true }));
    expect(chatCompleteMock).toHaveBeenCalledTimes(2);
    if (r.status === 'failed') throw new Error('unexpected');
    expect(r.analysis.served.httpRoutes).toEqual([]); // verify pass dropped the route
  });

  it('uses the bundle verbatim (repoPath comes from the bundle, not the fs) (LR6)', async () => {
    chatCompleteMock.mockResolvedValue(VALID_JSON);
    const r = await analyzeRepoLocal(opts({ input: { bundle: BUNDLE } }));
    if (r.status === 'failed') throw new Error('unexpected');
    expect(r.analysis.repository.path).toBe('/repos/orders'); // from BUNDLE, a path that does not exist
    expect(r.status).toBe('complete'); // BUNDLE.totalBytes > 0 → not forced to partial
  });

  it('a repoPath input to a non-existent dir yields an empty context → partial', async () => {
    chatCompleteMock.mockResolvedValue(VALID_JSON);
    const r = await analyzeRepoLocal(
      opts({ repoName: 'ghost', input: { repoPath: '/nonexistent/ghost' } })
    );
    if (r.status === 'failed') throw new Error('unexpected');
    expect(r.status).toBe('partial');
    expect(r.analysis.analysisStatus).toBe('partial');
  });
});
