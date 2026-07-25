import type { CandidateConfidence } from '../review/review-file.js';

/**
 * research.md D11: monotonic weight→bucket mapping, then adjusted by *how*
 * the connection was found — a deterministic, literal-evidence match is more
 * trustworthy than a local model's best guess, mirroring the retired static
 * pipeline's confidence philosophy (manifest declarations outranked
 * LLM-only inferences).
 */
export type ConnectionSource =
  | 'agent-analysis'
  | 'deterministic-correlation'
  | 'agentic-correlation-fallback';

const BUCKET_ORDER: CandidateConfidence[] = ['low', 'medium', 'high'];

function weightToBucket(weight: number): CandidateConfidence {
  if (weight >= 0.8) return 'high';
  if (weight >= 0.5) return 'medium';
  return 'low';
}

function bump(bucket: CandidateConfidence, steps: number): CandidateConfidence {
  const index = BUCKET_ORDER.indexOf(bucket);
  const next = Math.min(BUCKET_ORDER.length - 1, Math.max(0, index + steps));
  return BUCKET_ORDER[next] ?? bucket;
}

function cap(bucket: CandidateConfidence, max: CandidateConfidence): CandidateConfidence {
  return BUCKET_ORDER.indexOf(bucket) > BUCKET_ORDER.indexOf(max) ? max : bucket;
}

export function mapToConfidenceBucket(
  weight: number,
  source: ConnectionSource
): CandidateConfidence {
  const base = weightToBucket(weight);
  if (source === 'deterministic-correlation') return bump(base, 1);
  if (source === 'agentic-correlation-fallback') return cap(base, 'medium');
  return base;
}
