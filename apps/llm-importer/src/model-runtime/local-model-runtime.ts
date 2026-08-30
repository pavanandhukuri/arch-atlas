import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai/compat';
import type { LocalModelConfig } from '../config/config.schema.js';

/**
 * research.md D9: translate our config's `localModel` block into pi's own
 * models.json shape (confirmed against pi's real docs — packages/coding-agent/docs/models.md
 * — before writing this) rather than requiring the user to hand-author pi's
 * native config format.
 *
 * All three of our supported provider kinds (ollama, mlx, openai-compatible)
 * speak the same OpenAI chat-completions-style protocol, so all map to pi's
 * "openai-completions" api type — only the endpoint and provider id differ.
 */
function buildModelsJson(config: LocalModelConfig): Record<string, unknown> {
  return {
    providers: {
      [config.provider]: {
        baseUrl: config.endpoint,
        api: 'openai-completions',
        // Local servers generally ignore the key, but pi requires a non-empty
        // value before a model is treated as "authenticated" — see models.md.
        // Some local servers (e.g. oMLX) actually enforce it.
        apiKey: config.apiKey ?? 'not-required',
        // pi does not send `Authorization: Bearer <apiKey>` by default for
        // openai-completions providers (authHeader defaults to false) — set
        // explicitly so real API keys (not just pi's own auth bookkeeping)
        // actually reach the server. Harmless when the server ignores auth.
        authHeader: true,
        models: [{ id: config.modelId }],
      },
    },
  };
}

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
 * US4 acceptance scenario 2: fail fast, before any repository analysis begins,
 * if the configured local model endpoint isn't reachable. Implemented as a
 * direct network probe rather than relying on pi's own (lazily-validated)
 * model resolution, since "before any repository analysis begins" requires
 * an eager check.
 */
export async function checkLocalModelReachable(
  config: LocalModelConfig,
  timeoutMs = 5000
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await fetch(config.endpoint, { signal: controller.signal });
    // Any HTTP response (including 404/405 on the bare base URL) means the
    // server is up and answering — we only need a TCP+HTTP-level reachability
    // signal here, not a semantically valid response.
  } catch (error) {
    throw new LocalModelUnreachableError(config.endpoint, error);
  } finally {
    clearTimeout(timeout);
  }
}

export interface BuiltLocalModelRuntime {
  modelRuntime: ModelRuntime;
  model: Model<Api>;
}

/**
 * research.md D14.1: pi's `AgentSession.prompt` exposes no sampling knob, and
 * models.json carries no `temperature` field — but `ModelRuntime.stream/complete`
 * accept it in their options arg. Wrap the runtime so every generation call it
 * makes defaults to our (low) temperature, unless a caller passes one explicitly.
 */
const SAMPLING_METHODS = new Set(['stream', 'complete', 'streamSimple', 'completeSimple']);

export function withSamplingDefaults(runtime: ModelRuntime, temperature: number): ModelRuntime {
  return new Proxy(runtime, {
    get(target, prop, receiver): unknown {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (typeof prop === 'string' && SAMPLING_METHODS.has(prop)) {
        return (model: unknown, context: unknown, options?: Record<string, unknown>) =>
          fn.call(target, model, context, { temperature, ...(options ?? {}) });
      }
      return fn.bind(target);
    },
  });
}

/**
 * Writes a temporary models.json describing the configured local endpoint,
 * then builds a pi ModelRuntime from it. Call checkLocalModelReachable()
 * first — this function does not itself validate reachability.
 */
export async function buildLocalModelRuntime(
  config: LocalModelConfig,
  workDir: string,
  temperature = 0.1
): Promise<BuiltLocalModelRuntime> {
  const modelsPath = join(workDir, 'models.json');
  await writeFile(modelsPath, JSON.stringify(buildModelsJson(config), null, 2), 'utf8');

  const rawRuntime = await ModelRuntime.create({
    modelsPath,
    // We never want ModelRuntime.create() reaching out to a network catalog
    // (FR-017 — no path in this package should ever touch a hosted service).
    allowModelNetwork: false,
  });

  const model = rawRuntime.getModel(config.provider, config.modelId);
  if (!model) {
    throw new Error(
      `Model "${config.modelId}" was not found on provider "${config.provider}" after registering ` +
        `${modelsPath} — this indicates a bug in buildModelsJson(), not a user configuration error.`
    );
  }

  return { modelRuntime: withSamplingDefaults(rawRuntime, temperature), model };
}
