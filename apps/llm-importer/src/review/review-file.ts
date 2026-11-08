/**
 * Field-for-field port of the review-artifact types Studio's import wizard
 * already consumes (apps/studio/src/lib/import/types.ts). Schema unchanged
 * by this revision — spec.md "Explicitly out of scope" — this file exists so
 * the producing side (this package) and the consuming side (Studio) both
 * have a typed contract without a cross-package import (constitution
 * Principle I: no reaching into another package's internals).
 */

export type CandidateType = 'database' | 'http' | 'kafka' | 'queue' | 'grpc';
export type CandidateConfidence = 'high' | 'medium' | 'low';
export type CandidateStatus = 'pending' | 'accepted' | 'rejected';

export interface Candidate {
  id: string;
  source: string;
  target: string;
  type: CandidateType;
  reasoning: string;
  confidence: CandidateConfidence;
  status: CandidateStatus;
  override_name: string | null;
  override_type: string | null;
}

/** 015-component-analysis-default: one repository's internal component,
 * carried on `RepoMeta.components` — same shape as `ComponentAnalysis`'s own
 * `components[]`, duplicated here per this file's field-for-field-port
 * convention (no cross-package import). */
export interface RepoComponent {
  name: string;
  kind: string;
  description: string;
}

/** 015: a relationship between two of that same repository's `components`. */
export interface RepoComponentRelationship {
  source: string;
  target: string;
  description: string;
}

/**
 * 008: per-repository metadata for the Studio classify step to pre-fill.
 * Optional and ignored by Studio's current `parseReviewYaml` (which reads only
 * known top-level keys) — see 008 research.md D7.
 *
 * 015-component-analysis-default: `components`/`componentRelationships` are
 * the repository's internal-structure analysis, folded in by `runImport` when
 * a `{repo}.components.json` exists alongside its `.analysis.json` — the same
 * data 014 put in a second artifact now rides along in this one file, so
 * `architecture.review.yaml` is still the only file a human ever uploads into
 * Studio.
 */
export interface RepoMeta {
  name: string;
  description?: string;
  technology?: string;
  components?: RepoComponent[];
  componentRelationships?: RepoComponentRelationship[];
}

export interface ReviewFile {
  version: string;
  generated_at: string;
  source_repos: string[];
  systems: Array<{ name: string; repositories: string[] }>;
  candidates: Candidate[];
  repos?: RepoMeta[];
}
