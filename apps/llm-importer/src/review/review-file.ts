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

export interface ReviewFile {
  version: string;
  generated_at: string;
  source_repos: string[];
  systems: Array<{ name: string; repositories: string[] }>;
  candidates: Candidate[];
}
