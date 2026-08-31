import { z } from 'zod';
import {
  ModelAnalysisSchema,
  OutboundIntentSchema,
  ServedInterfacesSchema,
  type ModelAnalysis,
} from '@arch-atlas/llm-importer';

/**
 * Tolerant parsing + partial-result salvage of a model's analysis response.
 * Relocated verbatim from the importer's former `analyze-repo.ts` (008 D14) as
 * part of 010.
 */

export const EMPTY_SERVED: ModelAnalysis['served'] = {
  httpRoutes: [],
  grpcServices: [],
  topics: [],
  datastores: [],
};

export const SalvageModelAnalysisSchema = z.object({
  description: z.string().catch(''),
  languages: z.array(z.string()).catch([]),
  frameworks: z.array(z.string()).catch([]),
  served: ServedInterfacesSchema.catch(EMPTY_SERVED),
  outbound: z.array(OutboundIntentSchema).catch([]),
});

export function coerceModelAnalysis(raw: unknown): { model: ModelAnalysis; partial: boolean } {
  const strict = ModelAnalysisSchema.safeParse(raw);
  if (strict.success) return { model: strict.data, partial: false };

  const salvaged = SalvageModelAnalysisSchema.safeParse(raw);
  if (!salvaged.success) {
    throw new Error('model response was not a usable analysis object');
  }
  const s = salvaged.data;
  const hasSignal =
    s.description.trim().length > 0 || s.languages.length > 0 || s.frameworks.length > 0;
  if (!hasSignal) {
    throw new Error('model response did not contain a usable analysis');
  }
  return { model: s, partial: true };
}

/** Parse `text` as JSON, retrying once after light repair. Returns undefined on failure. */
export function parseLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to repair
  }
  const repaired = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/[^\n]*/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(repaired);
  } catch {
    return undefined;
  }
}

/**
 * Recover a JSON object from a model response tolerant of surrounding prose,
 * fences, trailing commas / comments, and a truncated (unclosed) object.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let slice: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 0) {
        slice = text.slice(start, i + 1);
        break;
      }
    }
  }
  if (slice === null) {
    const closers = stack
      .reverse()
      .map((b) => (b === '{' ? '}' : ']'))
      .join('');
    slice = text.slice(start) + closers;
  }

  const parsed = parseLenient(slice);
  return parsed !== undefined && typeof parsed === 'object' && parsed !== null ? parsed : null;
}
