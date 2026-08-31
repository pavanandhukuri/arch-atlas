/**
 * Fail-fast endpoint probe. Relocated from the importer's former
 * `local-model-runtime.ts` (it was already pi-free — a raw `fetch`) as part of
 * 010, since the importer core no longer contacts any endpoint.
 */

export class LocalModelUnreachableError extends Error {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Local model endpoint unreachable: ${endpoint}\n` +
        '  Ensure your local model server is running (e.g. `ollama serve`) and reachable ' +
        'from this machine, then re-run.'
    );
    this.name = 'LocalModelUnreachableError';
    this.cause = cause;
  }
}

/**
 * Resolve if the endpoint answers at the HTTP level (any status, incl. 401/404
 * on the bare base URL). Reject with `LocalModelUnreachableError` on a
 * connection/timeout error. Credentials are NOT validated here.
 */
export async function checkLocalModelReachable(
  config: { endpoint: string; apiKey?: string },
  timeoutMs = 5000
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await fetch(config.endpoint, { signal: controller.signal });
  } catch (error) {
    throw new LocalModelUnreachableError(config.endpoint, error);
  } finally {
    clearTimeout(timeout);
  }
}
