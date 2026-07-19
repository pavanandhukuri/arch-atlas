import { load as yamlLoad } from 'js-yaml';
import type {
  ReviewFile,
  Candidate,
  CandidateType,
  CandidateConfidence,
  CandidateStatus,
} from './types';

const VALID_TYPES: CandidateType[] = ['database', 'http', 'kafka', 'queue', 'grpc'];
const VALID_CONFIDENCES: CandidateConfidence[] = ['high', 'medium', 'low'];
const VALID_STATUSES: CandidateStatus[] = ['pending', 'accepted', 'rejected'];

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function parseReviewYaml(text: string): { file: ReviewFile; candidates: Candidate[] } {
  let raw: unknown;
  try {
    raw = yamlLoad(text);
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Review file must be a YAML object');
  }

  const obj = raw as Record<string, unknown>;

  if (!isString(obj['version'])) {
    throw new Error('Missing or invalid "version" field');
  }
  if (!isString(obj['generated_at'])) {
    throw new Error('Missing or invalid "generated_at" field');
  }
  if (!isArray(obj['source_repos'])) {
    throw new Error('Missing or invalid "source_repos" field (must be an array)');
  }
  const sourceRepos = obj['source_repos'].map((r, i) => {
    if (!isString(r)) throw new Error(`source_repos[${i}] must be a string`);
    return r;
  });

  const parsedSystems: Array<{ name: string; repositories: string[] }> = [];
  if (isArray(obj['systems'])) {
    for (const sg of obj['systems']) {
      if (!sg || typeof sg !== 'object') continue;
      const s = sg as Record<string, unknown>;
      if (!isString(s['name'])) continue;
      const repos = isArray(s['repositories']) ? s['repositories'].filter(isString) : [];
      parsedSystems.push({ name: s['name'], repositories: repos });
    }
  }

  if (!isArray(obj['candidates'])) {
    throw new Error('Missing or invalid "candidates" field (must be an array)');
  }

  const candidates: Candidate[] = obj['candidates'].map((rawItem, i) => {
    if (!rawItem || typeof rawItem !== 'object') {
      throw new Error(`candidates[${i}] must be an object`);
    }
    const c = rawItem as Record<string, unknown>;
    if (!isString(c['id'])) throw new Error(`candidates[${i}].id must be a string`);
    if (!isString(c['source'])) throw new Error(`candidates[${i}].source must be a string`);
    if (!isString(c['target'])) throw new Error(`candidates[${i}].target must be a string`);
    if (!isString(c['type']) || !VALID_TYPES.includes(c['type'] as CandidateType)) {
      throw new Error(`candidates[${i}].type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (!isString(c['reasoning'])) throw new Error(`candidates[${i}].reasoning must be a string`);
    if (
      !isString(c['confidence']) ||
      !VALID_CONFIDENCES.includes(c['confidence'] as CandidateConfidence)
    ) {
      throw new Error(
        `candidates[${i}].confidence must be one of: ${VALID_CONFIDENCES.join(', ')}`
      );
    }

    const rawStatus = c['status'];
    const status: CandidateStatus =
      isString(rawStatus) && VALID_STATUSES.includes(rawStatus as CandidateStatus)
        ? (rawStatus as CandidateStatus)
        : 'pending';

    const overrideName = c['override_name'];
    const overrideType = c['override_type'];

    return {
      id: c['id'],
      source: c['source'],
      target: c['target'],
      type: c['type'] as CandidateType,
      reasoning: c['reasoning'],
      confidence: c['confidence'] as CandidateConfidence,
      status,
      override_name: isString(overrideName) ? overrideName : null,
      override_type: isString(overrideType) ? overrideType : null,
    };
  });

  const file: ReviewFile = {
    version: obj['version'],
    generated_at: obj['generated_at'],
    source_repos: sourceRepos,
    systems: parsedSystems,
    candidates,
  };

  return { file, candidates };
}
