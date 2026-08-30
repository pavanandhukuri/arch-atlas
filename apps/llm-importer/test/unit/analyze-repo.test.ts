import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const promptMock = vi.fn<[string], Promise<void>>();
const disposeMock = vi.fn();
const createSessionSpy = vi.fn<[unknown], unknown>();

/** Queue of response strings the fake session will stream back, one per prompt call. */
let responseQueue: string[] = [];
/** When true, a queued JSON object is delivered by "calling" the submit_analysis
 * custom tool (if the session registered one) instead of as text. */
let deliverViaTool = false;

interface FakeToolDef {
  name: string;
  execute: (id: string, params: unknown) => Promise<unknown>;
}

vi.mock('@earendil-works/pi-coding-agent', async () => {
  const actual = await vi.importActual<typeof import('@earendil-works/pi-coding-agent')>(
    '@earendil-works/pi-coding-agent'
  );
  return {
    ...actual,
    createAgentSession: vi.fn((opts: unknown) => {
      createSessionSpy(opts);
      const sessionOpts = opts as { customTools?: FakeToolDef[] } | undefined;
      let subscriber: ((event: unknown) => void) | undefined;
      return Promise.resolve({
        session: {
          subscribe: (fn: (event: unknown) => void) => {
            subscriber = fn;
          },
          prompt: async (text: string) => {
            await promptMock(text);
            const delta = responseQueue.shift() ?? '';
            const tool = sessionOpts?.customTools?.find((t) => t.name === 'submit_analysis');
            if (deliverViaTool && tool && delta.trim().startsWith('{')) {
              await tool.execute('tc1', JSON.parse(delta));
              return;
            }
            subscriber?.({
              type: 'message_update',
              assistantMessageEvent: { type: 'text_delta', delta },
            });
          },
          dispose: disposeMock,
        },
        extensionsResult: { extensions: [], errors: [] },
      });
    }),
  };
});

const { analyzeRepo, sanitizeFrameworks, sanitizeServed } =
  await import('../../src/analysis/analyze-repo.js');
const { SharedLimiter } = await import('../../src/concurrency/shared-limiter.js');
const pi = await import('@earendil-works/pi-coding-agent');

const FIXTURE_USER_SERVICE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'repos',
  'user-service'
);

const VALID_MODEL_JSON = JSON.stringify({
  description: 'A service that sends notifications.',
  languages: ['TypeScript'],
  frameworks: ['Express'],
  served: {
    httpRoutes: [{ method: 'POST', path: '/v1/send' }],
    grpcServices: [],
    topics: [{ name: 'user-created', direction: 'consume' }],
    datastores: [],
  },
  outbound: [
    { target: 'user-service', verb: 'calls', detail: 'fetches recipient', confidence: 0.6 },
  ],
});

function opts() {
  return {
    repoName: 'notification-service',
    repoPath: '/tmp/does-not-matter',
    model: { id: 'llama3', provider: 'ollama' } as never,
    modelRuntime: {} as never,
    limiter: new SharedLimiter(2),
    // gatherContext is real but the path is empty → empty context, which is fine here.
  };
}

beforeEach(() => {
  promptMock.mockClear();
  disposeMock.mockClear();
  createSessionSpy.mockClear();
  vi.mocked(pi.createAgentSession).mockClear();
  responseQueue = [];
  deliverViaTool = false;
});

describe('sanitizeFrameworks (research.md D14.2)', () => {
  it('strips test runners, linters, bundlers, type stubs, and CLI tooling', () => {
    expect(
      sanitizeFrameworks(['Express', 'vitest', 'typescript', '@types/node', 'turbo', 'esbuild'])
    ).toEqual(['Express']);
  });
  it('keeps real frameworks and dedupes case-insensitively', () => {
    expect(sanitizeFrameworks(['React', 'react', 'Spring Boot'])).toEqual(['React', 'Spring Boot']);
  });
  it('drops a trailing version suffix before matching the denylist', () => {
    expect(sanitizeFrameworks(['vitest@1.6', 'KafkaJS'])).toEqual(['KafkaJS']);
  });
});

describe('sanitizeServed (research.md D14.9)', () => {
  it('strips operational endpoints that every service exposes', () => {
    const served = {
      httpRoutes: [
        { path: '/actuator/health' },
        { path: '/healthz' },
        { path: '/metrics' },
        { path: '/v1/orders' },
        { path: '/.well-known/jwks.json' },
      ],
      grpcServices: [],
      topics: [],
      datastores: [],
    };
    expect(sanitizeServed(served).httpRoutes.map((r) => r.path)).toEqual(['/v1/orders']);
  });
});

describe('analyzeRepo', () => {
  it('happy path: one prompt, valid JSON, status complete, retryCount 0', async () => {
    responseQueue = [VALID_MODEL_JSON];
    const result = await analyzeRepo(opts());

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.retryCount).toBe(0);
    expect(result.analysis.schemaVersion).toBe('1.0');
    expect(result.analysis.repository.name).toBe('notification-service');
    expect(result.analysis.served.httpRoutes[0]?.path).toBe('/v1/send');
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it('extracts JSON from a fenced, prose-wrapped response', async () => {
    responseQueue = [
      'Sure! Here is the analysis:\n```json\n' + VALID_MODEL_JSON + '\n```\nHope that helps.',
    ];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('complete');
  });

  it('retries exactly once on unparseable output, then succeeds (retryCount 1)', async () => {
    responseQueue = ['I could not analyze this repository.', VALID_MODEL_JSON];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.retryCount).toBe(1);
    expect(promptMock).toHaveBeenCalledTimes(2);
  });

  it('fails after the retry also produces invalid output', async () => {
    responseQueue = ['nope', 'still nope'];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('unreachable');
    expect(result.retryCount).toBe(1);
    expect(promptMock).toHaveBeenCalledTimes(2);
  });

  it('salvages a response missing `served` (has a description) as a partial analysis', async () => {
    const missingServed = JSON.stringify({
      description: 'A notification fan-out service.',
      languages: ['Go'],
      frameworks: [],
      outbound: [],
    });
    responseQueue = [missingServed];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.analysisStatus).toBe('partial');
    expect(result.analysis.description).toBe('A notification fan-out service.');
    expect(result.analysis.served).toEqual({
      httpRoutes: [],
      grpcServices: [],
      topics: [],
      datastores: [],
    });
  });

  it('salvages a malformed `served` (keeps the good fields, empties served)', async () => {
    const badServed = JSON.stringify({
      description: 'x service',
      languages: ['TypeScript'],
      frameworks: ['Express'],
      served: { httpRoutes: 'not-an-array' },
      outbound: [{ target: 'db', verb: 'reads_from', detail: 'reads users' }],
    });
    responseQueue = [badServed];
    const result = await analyzeRepo(opts());
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.analysisStatus).toBe('partial');
    expect(result.analysis.frameworks).toEqual(['Express']);
    expect(result.analysis.served.httpRoutes).toEqual([]);
  });

  it('still fails when a parsed object carries no usable signal', async () => {
    const noSignal = JSON.stringify({ foo: 1, bar: [] });
    responseQueue = [noSignal, noSignal];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('failed');
    expect(promptMock).toHaveBeenCalledTimes(2);
  });

  it('recovers JSON with trailing commas and // comments', async () => {
    const dirty =
      '{\n  "description": "svc", // a service\n  "languages": ["Go",],\n' +
      '  "frameworks": [],\n  "served": {"httpRoutes":[],"grpcServices":[],"topics":[],"datastores":[]},\n' +
      '  "outbound": [],\n}';
    responseQueue = [dirty];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.languages).toEqual(['Go']);
  });

  it('recovers a truncated (unclosed) response by synthesising the missing closers', async () => {
    const truncated =
      '{"description":"a service","languages":["Go"],"frameworks":["Gin"],' +
      '"served":{"httpRoutes":[{"method":"GET","path":"/health"'; // cut off mid-object
    responseQueue = [truncated];
    const result = await analyzeRepo(opts());
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    // served couldn't be fully recovered -> salvaged partial, good fields kept
    expect(result.analysis.analysisStatus).toBe('partial');
    expect(result.analysis.frameworks).toEqual(['Gin']);
  });

  it('the retry attempt prepends a stricter "JSON only" instruction', async () => {
    responseQueue = ['not json at all', VALID_MODEL_JSON];
    await analyzeRepo(opts());
    expect(promptMock).toHaveBeenCalledTimes(2);
    const firstPrompt = promptMock.mock.calls[0]?.[0] ?? '';
    const retryPrompt = promptMock.mock.calls[1]?.[0] ?? '';
    expect(firstPrompt).not.toMatch(/previous attempt/i);
    expect(retryPrompt).toMatch(/previous attempt|ONLY the JSON object/i);
  });

  it('never sends a "continue" / "keep going" nudge and calls prompt at most twice', async () => {
    responseQueue = ['garbage', 'garbage'];
    await analyzeRepo(opts());
    expect(promptMock.mock.calls.length).toBeLessThanOrEqual(2);
    for (const [text] of promptMock.mock.calls) {
      expect(text.toLowerCase()).not.toMatch(/continue|keep going|not complete/);
    }
  });

  it('creates the agent session with no tools', async () => {
    responseQueue = [VALID_MODEL_JSON];
    await analyzeRepo(opts());
    const passed = createSessionSpy.mock.calls[0]?.[0] as { tools?: unknown[] } | undefined;
    expect(passed?.tools).toEqual([]);
  });

  it('marks analysisStatus "complete" when real context was gathered', async () => {
    responseQueue = [VALID_MODEL_JSON];
    const result = await analyzeRepo({ ...opts(), repoPath: FIXTURE_USER_SERVICE });
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.analysisStatus).toBe('complete');
    expect(result.analysis.repository.path).toBe(FIXTURE_USER_SERVICE);
  });

  it('marks analysisStatus "partial" when the context is empty', async () => {
    responseQueue = [VALID_MODEL_JSON];
    const result = await analyzeRepo(opts());
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.analysisStatus).toBe('partial');
  });

  it('strips non-framework deps from the model output (D14.2)', async () => {
    responseQueue = [
      JSON.stringify({
        description: 'x',
        languages: ['TypeScript'],
        frameworks: ['Express', 'vitest', 'eslint', 'typescript'],
        served: { httpRoutes: [], grpcServices: [], topics: [], datastores: [] },
        outbound: [],
      }),
    ];
    const result = await analyzeRepo(opts());
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.frameworks).toEqual(['Express']);
  });

  it('verifyGrounding: a second call prunes ungrounded interfaces (D14.8)', async () => {
    const draft = {
      description: 'x',
      languages: ['Go'],
      frameworks: ['Gin'],
      served: {
        httpRoutes: [
          { method: 'GET', path: '/real' },
          { method: 'GET', path: '/hallucinated' },
        ],
        grpcServices: [],
        topics: [],
        datastores: [],
      },
      outbound: [],
    };
    const verified = {
      ...draft,
      served: { ...draft.served, httpRoutes: [{ method: 'GET', path: '/real' }] },
    };
    responseQueue = [JSON.stringify(draft), JSON.stringify(verified)];
    const result = await analyzeRepo({
      ...opts(),
      repoPath: FIXTURE_USER_SERVICE,
      verifyGrounding: true,
    });
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(promptMock).toHaveBeenCalledTimes(2);
    expect(result.analysis.served.httpRoutes.map((r) => r.path)).toEqual(['/real']);
  });

  it('verifyGrounding: an unparseable verify response leaves the draft unchanged', async () => {
    responseQueue = [VALID_MODEL_JSON, 'the verification could not be completed'];
    const result = await analyzeRepo({
      ...opts(),
      repoPath: FIXTURE_USER_SERVICE,
      verifyGrounding: true,
    });
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.served.httpRoutes[0]?.path).toBe('/v1/send');
  });

  it("structuredOutput 'tool': captures params from the submit_analysis tool call (D14.6)", async () => {
    deliverViaTool = true;
    responseQueue = [VALID_MODEL_JSON];
    const result = await analyzeRepo({ ...opts(), structuredOutput: 'tool' });
    if (result.status !== 'complete') throw new Error('unreachable');
    expect(result.analysis.served.httpRoutes[0]?.path).toBe('/v1/send');
    const passed = createSessionSpy.mock.calls[0]?.[0] as
      | { customTools?: Array<{ name: string }>; tools?: string[] }
      | undefined;
    expect(passed?.customTools?.[0]?.name).toBe('submit_analysis');
    expect(passed?.tools).toEqual(['submit_analysis']);
  });

  it("structuredOutput 'tool': falls back to text when the model replies without calling the tool", async () => {
    deliverViaTool = false; // model streams JSON text instead of a tool call
    responseQueue = [VALID_MODEL_JSON];
    const result = await analyzeRepo({ ...opts(), structuredOutput: 'tool' });
    expect(result.status).toBe('complete');
  });
});
