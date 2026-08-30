import { describe, it, expect, vi, beforeEach } from 'vitest';

const promptMock = vi.fn();
const disposeMock = vi.fn();

vi.mock('@earendil-works/pi-coding-agent', async () => {
  const actual = await vi.importActual<typeof import('@earendil-works/pi-coding-agent')>(
    '@earendil-works/pi-coding-agent'
  );
  return {
    ...actual,
    createAgentSession: vi.fn(() => {
      let subscriber: ((event: unknown) => void) | undefined;
      return Promise.resolve({
        session: {
          subscribe: (fn: (event: unknown) => void) => {
            subscriber = fn;
          },
          prompt: async (text: string) => {
            await promptMock(text);
            // Simulate the model streaming back a JSON array via text_delta events,
            // exactly the shape agentic-correlator.ts's subscribe callback expects.
            subscriber?.({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'text_delta',
                delta: JSON.stringify([
                  {
                    direction: 'A_TO_B',
                    type: 'calls',
                    confidence: 0.85,
                    reasoning: 'plausible naming match',
                  },
                ]),
              },
            });
          },
          dispose: disposeMock,
        },
        extensionsResult: { extensions: [], errors: [] },
      });
    }),
  };
});

const { correlateAgentically } = await import('../../src/correlate/agentic-correlator.js');
const { SharedLimiter } = await import('../../src/concurrency/shared-limiter.js');
const pi = await import('@earendil-works/pi-coding-agent');

function makeGraph(name: string) {
  return {
    schemaVersion: '1.0' as const,
    analyzedAt: '2026-01-01T00:00:00Z',
    repository: { name, path: `/${name}` },
    nodes: [],
    edges: [],
    analysisStatus: 'complete' as const,
    retryCount: 0 as const,
  };
}

beforeEach(() => {
  promptMock.mockClear();
  disposeMock.mockClear();
  vi.mocked(pi.createAgentSession).mockClear();
});

describe('correlateAgentically', () => {
  it('parses a JSON-array response into CrossRepositoryConnections', async () => {
    const graphsByName = new Map([
      ['service-a', makeGraph('service-a')],
      ['service-b', makeGraph('service-b')],
    ]);
    const limiter = new SharedLimiter(2);

    const connections = await correlateAgentically(
      [{ repoA: 'service-a', repoB: 'service-b' }],
      graphsByName,
      { id: 'llama3', provider: 'ollama' } as never,
      {} as never,
      limiter
    );

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRepo: 'service-a',
      targetRepo: 'service-b',
      type: 'calls',
      foundBy: 'agentic-fallback',
      weight: 0.85,
    });
  });

  it('returns no connections and does not throw when the model responds with []', async () => {
    vi.mocked(pi.createAgentSession).mockImplementationOnce(() => {
      let subscriber: ((event: unknown) => void) | undefined;
      return Promise.resolve({
        session: {
          subscribe: (fn: (event: unknown) => void) => {
            subscriber = fn;
          },
          prompt: (_text: string) => {
            subscriber?.({
              type: 'message_update',
              assistantMessageEvent: { type: 'text_delta', delta: '[]' },
            });
            return Promise.resolve();
          },
          dispose: disposeMock,
        },
        extensionsResult: { extensions: [], errors: [] },
      }) as never;
    });

    const graphsByName = new Map([
      ['service-a', makeGraph('service-a')],
      ['service-b', makeGraph('service-b')],
    ]);
    const connections = await correlateAgentically(
      [{ repoA: 'service-a', repoB: 'service-b' }],
      graphsByName,
      { id: 'llama3', provider: 'ollama' } as never,
      {} as never,
      new SharedLimiter(2)
    );
    expect(connections).toEqual([]);
  });

  it('drops low-confidence and thinly-reasoned proposals (research.md D14.4)', async () => {
    vi.mocked(pi.createAgentSession).mockImplementationOnce(() => {
      let subscriber: ((event: unknown) => void) | undefined;
      return Promise.resolve({
        session: {
          subscribe: (fn: (event: unknown) => void) => {
            subscriber = fn;
          },
          prompt: (_text: string) => {
            subscriber?.({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'text_delta',
                delta: JSON.stringify([
                  {
                    direction: 'A_TO_B',
                    type: 'calls',
                    confidence: 0.5,
                    reasoning: 'both are services',
                  },
                  { direction: 'A_TO_B', type: 'calls', confidence: 0.9, reasoning: 'ok' },
                  {
                    direction: 'B_TO_A',
                    type: 'publishes',
                    confidence: 0.85,
                    reasoning: 'A subscribes to the "orders.created" topic that B publishes',
                  },
                ]),
              },
            });
            return Promise.resolve();
          },
          dispose: disposeMock,
        },
        extensionsResult: { extensions: [], errors: [] },
      }) as never;
    });

    const connections = await correlateAgentically(
      [{ repoA: 'service-a', repoB: 'service-b' }],
      new Map([
        ['service-a', makeGraph('service-a')],
        ['service-b', makeGraph('service-b')],
      ]),
      { id: 'llama3', provider: 'ollama' } as never,
      {} as never,
      new SharedLimiter(2)
    );
    // only the one with confidence >= 0.8 AND a concrete, non-infra reason survives
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ type: 'publishes', weight: 0.85 });
  });

  it('drops "both repos use <shared third-party>" reasoning even at high confidence (D14.4)', async () => {
    vi.mocked(pi.createAgentSession).mockImplementationOnce(() => {
      let subscriber: ((event: unknown) => void) | undefined;
      return Promise.resolve({
        session: {
          subscribe: (fn: (event: unknown) => void) => {
            subscriber = fn;
          },
          prompt: (_text: string) => {
            subscriber?.({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'text_delta',
                delta: JSON.stringify([
                  {
                    direction: 'A_TO_B',
                    type: 'depends_on',
                    confidence: 0.9,
                    reasoning: 'Both repositories depend on Keycloak for JWT authentication',
                  },
                ]),
              },
            });
            return Promise.resolve();
          },
          dispose: disposeMock,
        },
        extensionsResult: { extensions: [], errors: [] },
      }) as never;
    });

    const connections = await correlateAgentically(
      [{ repoA: 'service-a', repoB: 'service-b' }],
      new Map([
        ['service-a', makeGraph('service-a')],
        ['service-b', makeGraph('service-b')],
      ]),
      { id: 'llama3', provider: 'ollama' } as never,
      {} as never,
      new SharedLimiter(2)
    );
    expect(connections).toEqual([]);
  });

  it('runs no sessions at all when there are no unresolved pairs', async () => {
    const connections = await correlateAgentically(
      [],
      new Map(),
      {} as never,
      {} as never,
      new SharedLimiter(2)
    );
    expect(connections).toEqual([]);
    expect(pi.createAgentSession).not.toHaveBeenCalled();
  });
});
