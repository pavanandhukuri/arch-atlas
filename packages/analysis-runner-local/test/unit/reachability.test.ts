import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLocalModelReachable, LocalModelUnreachableError } from '../../src/reachability.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkLocalModelReachable', () => {
  it('resolves when the endpoint answers at all (even 404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(checkLocalModelReachable({ endpoint: 'http://x/v1' })).resolves.toBeUndefined();
  });

  it('resolves on a 401 — credentials are not validated here', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(checkLocalModelReachable({ endpoint: 'http://x/v1' })).resolves.toBeUndefined();
  });

  it('rejects with LocalModelUnreachableError on a connection error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(checkLocalModelReachable({ endpoint: 'http://x/v1' })).rejects.toBeInstanceOf(
      LocalModelUnreachableError
    );
  });

  it('rejects on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_u, init) =>
        new Promise((_res, rej) => {
          (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => {
            rej(new Error('aborted'));
          });
        })
    );
    await expect(checkLocalModelReachable({ endpoint: 'http://x/v1' }, 15)).rejects.toBeInstanceOf(
      LocalModelUnreachableError
    );
  });
});
