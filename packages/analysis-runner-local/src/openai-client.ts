/**
 * Minimal OpenAI-compatible chat client — the only network code in this package.
 * One streamed `POST {endpoint}/chat/completions`, SSE deltas accumulated to a
 * string. No third-party HTTP dependency (Node ≥ 22 `fetch`). Replaces the pi
 * `createAgentSession` + event-stream plumbing the importer used to carry (010).
 *
 * constitution IV: every request is time-bounded; the prompt, the response body,
 * and the apiKey are never logged in full.
 */

const DEFAULT_TIMEOUT_MS = 120_000;

export interface ChatCompleteOptions {
  endpoint: string;
  modelId: string;
  apiKey?: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  /** OpenAI `response_format` passthrough (e.g. `{ type: 'json_schema', json_schema: {...} }`). */
  responseFormat?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ChatCompletionError extends Error {
  readonly status: number;
  constructor(status: number, bodyPreview: string) {
    super(`chat completion failed: HTTP ${status} — ${bodyPreview.slice(0, 200)}`);
    this.name = 'ChatCompletionError';
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** first ~200 chars, newlines flattened — safe for a debug log line. */
function preview(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

function combinedSignal(
  timeoutMs: number,
  caller?: AbortSignal
): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onAbort = (): void => {
    controller.abort(caller?.reason);
  };
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onAbort);
    },
  };
}

export async function chatComplete(options: ChatCompleteOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal, done } = combinedSignal(timeoutMs, options.signal);

  const body: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    stream: true,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.responseFormat !== undefined ? { response_format: options.responseFormat } : {}),
  };

  let response: Response;
  try {
    response = await fetch(joinUrl(options.endpoint, 'chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } finally {
    // fetch has resolved or thrown; keep the timeout alive for the stream read below
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    done();
    throw new ChatCompletionError(response.status, errBody);
  }

  const reader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
  if (!reader) {
    done();
    // Non-streaming fallback: some servers ignore `stream: true`.
    const json = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    return json?.choices?.[0]?.message?.content ?? '';
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  try {
    for (;;) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const choice = chunk.choices?.[0];
          text += choice?.delta?.content ?? choice?.message?.content ?? '';
        } catch {
          // ignore keep-alive / non-JSON lines
        }
      }
    }
  } finally {
    done();
    reader.releaseLock();
  }

  if (process.env.ARCH_ATLAS_DEBUG) {
    console.error(`[runner] model reply (${text.length} chars): ${preview(text)}`);
  }
  return text;
}

/**
 * Hand-written JSON Schema mirroring `ModelAnalysisSchema` for the
 * `structuredOutput: 'tool'` path (research D9). No `zod-to-json-schema` dep.
 */
export const REPO_ANALYSIS_JSON_SCHEMA = {
  name: 'repo_analysis',
  strict: false,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['description', 'languages', 'frameworks', 'served', 'outbound'],
    properties: {
      description: { type: 'string' },
      languages: { type: 'array', items: { type: 'string' } },
      frameworks: { type: 'array', items: { type: 'string' } },
      served: {
        type: 'object',
        additionalProperties: false,
        required: ['httpRoutes', 'grpcServices', 'topics', 'datastores'],
        properties: {
          httpRoutes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['path'],
              properties: {
                method: {
                  type: 'string',
                  enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'],
                },
                path: { type: 'string' },
                filePath: { type: 'string' },
              },
            },
          },
          grpcServices: { type: 'array', items: { type: 'string' } },
          topics: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'direction'],
              properties: {
                name: { type: 'string' },
                direction: { type: 'string', enum: ['publish', 'consume', 'unknown'] },
                filePath: { type: 'string' },
              },
            },
          },
          datastores: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name'],
              properties: {
                name: { type: 'string' },
                kind: {
                  type: 'string',
                  enum: ['relational', 'document', 'keyvalue', 'blob', 'search', 'other'],
                },
              },
            },
          },
        },
      },
      outbound: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['target', 'verb', 'detail'],
          properties: {
            target: { type: 'string' },
            verb: {
              type: 'string',
              enum: ['calls', 'depends_on', 'publishes', 'subscribes', 'reads_from', 'writes_to'],
            },
            detail: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
    },
  },
} as const;
