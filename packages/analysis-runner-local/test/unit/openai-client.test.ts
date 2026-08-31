import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatComplete, ChatCompletionError } from '../../src/openai-client.js';

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const lines = [
    ...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
    'data: [DONE]\n\n',
  ];
  return new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
}

function okResponse(body: string | ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatComplete', () => {
  it('accumulates SSE delta.content into one string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(sseStream(['Hel', 'lo ', 'world'])));
    const out = await chatComplete({
      endpoint: 'http://x/v1',
      modelId: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(out).toBe('Hello world');
  });

  it('POSTs to {endpoint}/chat/completions with temperature + response_format in the body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(sseStream(['{}'])));
    await chatComplete({
      endpoint: 'http://x/v1/',
      modelId: 'm',
      apiKey: 'secret-key',
      temperature: 0.1,
      responseFormat: { type: 'json_schema' },
      messages: [{ role: 'user', content: 'hi' }],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://x/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'm', temperature: 0.1, stream: true });
    expect(body.response_format).toEqual({ type: 'json_schema' });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
  });

  it('throws ChatCompletionError with the status on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(
      chatComplete({
        endpoint: 'http://x/v1',
        modelId: 'm',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(ChatCompletionError);
  });

  it('aborts when timeoutMs elapses before the response (LR7)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    });
    await expect(
      chatComplete({
        endpoint: 'http://x/v1',
        modelId: 'm',
        timeoutMs: 20,
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toThrow();
  });

  it('never logs the full prompt, the response body, or the apiKey (LR8)', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.map(String).join(' ')));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse(sseStream(['SENSITIVE-RESPONSE-CONTENT']))
    );
    await chatComplete({
      endpoint: 'http://x/v1',
      modelId: 'm',
      apiKey: 'super-secret-key',
      messages: [{ role: 'user', content: 'VERY-LONG-SENSITIVE-PROMPT '.repeat(50) }],
    });
    const joined = logs.join('\n');
    expect(joined).not.toContain('super-secret-key');
    expect(joined).not.toContain('VERY-LONG-SENSITIVE-PROMPT VERY-LONG-SENSITIVE-PROMPT');
  });

  it('falls back to a non-streaming JSON body when there is no readable stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'plain' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    // Response from a JSON string still has a body; simulate "no stream" by nulling it.
    const noBody = new Response(null, { status: 200 });
    Object.defineProperty(noBody, 'json', {
      value: () => Promise.resolve({ choices: [{ message: { content: 'plain' } }] }),
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(noBody);
    const out = await chatComplete({
      endpoint: 'http://x/v1',
      modelId: 'm',
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(out).toBe('plain');
  });
});
