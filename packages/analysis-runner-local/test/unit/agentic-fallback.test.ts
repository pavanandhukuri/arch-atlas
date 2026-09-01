import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryKnowledgeGraph } from '@arch-atlas/llm-importer';

const chatCompleteMock = vi.fn();
vi.mock('../../src/openai-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/openai-client.js')>(
    '../../src/openai-client.js'
  );
  return { ...actual, chatComplete: chatCompleteMock };
});
const { resolveUnresolvedPairs } = await import('../../src/agentic-fallback.js');

function graph(
  name: string,
  extra: Partial<RepositoryKnowledgeGraph> = {}
): RepositoryKnowledgeGraph {
  return {
    schemaVersion: '1.0',
    analyzedAt: '2026-08-31T00:00:00.000Z',
    repository: { name, path: `/${name}` },
    nodes: [{ id: `module:${name}`, type: 'module', name, summary: '' }],
    edges: [],
    analysisStatus: 'complete',
    retryCount: 0,
    ...extra,
  };
}

beforeEach(() => chatCompleteMock.mockReset());

describe('resolveUnresolvedPairs', () => {
  it('keeps a confident, concretely-reasoned proposal and tags it agentic-fallback', async () => {
    chatCompleteMock.mockResolvedValue(
      JSON.stringify([
        {
          direction: 'A_TO_B',
          type: 'calls',
          confidence: 0.9,
          reasoning: 'A calls route "/v1/pay" that B serves',
        },
      ])
    );
    const conns = await resolveUnresolvedPairs({
      pairs: [{ repoA: 'a', repoB: 'b' }],
      graphsByName: new Map([
        ['a', graph('a')],
        ['b', graph('b')],
      ]),
      endpoint: 'http://x/v1',
      modelId: 'm',
    });
    expect(conns).toHaveLength(1);
    expect(conns[0]).toMatchObject({
      sourceRepo: 'a',
      targetRepo: 'b',
      type: 'calls',
      foundBy: 'agentic-fallback',
      weight: 0.9,
    });
  });

  it('drops a low-confidence proposal and a generic "both use X" one', async () => {
    chatCompleteMock.mockResolvedValue(
      JSON.stringify([
        {
          direction: 'A_TO_B',
          type: 'calls',
          confidence: 0.5,
          reasoning: 'A calls route "/x" B serves',
        },
        {
          direction: 'B_TO_A',
          type: 'depends_on',
          confidence: 0.95,
          reasoning: 'both repos use keycloak and share auth',
        },
      ])
    );
    const conns = await resolveUnresolvedPairs({
      pairs: [{ repoA: 'a', repoB: 'b' }],
      graphsByName: new Map([
        ['a', graph('a')],
        ['b', graph('b')],
      ]),
      endpoint: 'http://x/v1',
      modelId: 'm',
    });
    expect(conns).toEqual([]);
  });

  it('returns [] for a pair whose graphs are missing', async () => {
    const conns = await resolveUnresolvedPairs({
      pairs: [{ repoA: 'a', repoB: 'ghost' }],
      graphsByName: new Map([['a', graph('a')]]),
      endpoint: 'http://x/v1',
      modelId: 'm',
    });
    expect(conns).toEqual([]);
    expect(chatCompleteMock).not.toHaveBeenCalled();
  });

  it('condenses served nodes, outbound edges and a description into the prompt, and accepts B_TO_A', async () => {
    chatCompleteMock.mockResolvedValue(
      JSON.stringify([
        {
          direction: 'B_TO_A',
          type: 'reads_from',
          confidence: 0.88,
          reasoning: 'B reads table "orders" that A owns',
        },
      ])
    );
    const rich = graph('a', {
      repository: { name: 'a', path: '/a', description: 'owns the orders table' },
      nodes: [
        { id: 'table:orders', type: 'table', name: 'orders', summary: '' },
        { id: 'endpoint:a', type: 'endpoint', name: 'GET /v1/orders', summary: '' },
      ],
      edges: [
        {
          source: 'module:a',
          target: 'ext',
          type: 'calls',
          weight: 0.5,
          description: 'calls billing /charge',
        },
      ],
    });
    const conns = await resolveUnresolvedPairs({
      pairs: [{ repoA: 'a', repoB: 'b' }],
      graphsByName: new Map([
        ['a', rich],
        ['b', graph('b')],
      ]),
      endpoint: 'http://x/v1',
      modelId: 'm',
    });
    const calls = chatCompleteMock.mock.calls as unknown as unknown[][];
    const sentPrompt = (calls[0]?.[0] as { messages: Array<{ content: string }> }).messages[0]
      ?.content;
    expect(sentPrompt).toContain('Summary: owns the orders table');
    expect(sentPrompt).toContain('table: orders');
    expect(sentPrompt).toContain('Outbound intents:');
    // B_TO_A → the connection points from b to a
    expect(conns).toHaveLength(1);
    expect(conns[0]).toMatchObject({ sourceRepo: 'b', targetRepo: 'a', type: 'reads_from' });
  });

  it('returns [] when the model reply is a malformed JSON array', async () => {
    chatCompleteMock.mockResolvedValue('here: [ {direction: A_TO_B, oops} ] done');
    const conns = await resolveUnresolvedPairs({
      pairs: [{ repoA: 'a', repoB: 'b' }],
      graphsByName: new Map([
        ['a', graph('a')],
        ['b', graph('b')],
      ]),
      endpoint: 'http://x/v1',
      modelId: 'm',
    });
    expect(conns).toEqual([]);
  });
});
