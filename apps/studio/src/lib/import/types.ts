// All TypeScript types for the import wizard

import type { ContainerSubtype } from '@arch-atlas/core-model';

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
  candidates: Candidate[];
}

export interface SystemGroup {
  id: string;
  name: string;
  repoNames: string[];
}

export interface ElementConfig {
  /** Unique id (slug of canonical name) */
  id: string;
  /** Canonical name from the candidate graph */
  name: string;
  /** Display name (user-editable) */
  displayName: string;
  kind: 'system' | 'container' | 'person';
  containerSubtype?: ContainerSubtype;
  isExternal: boolean;
  technology?: string;
  /** Which SystemGroup this element belongs to (for containers) */
  systemId?: string;
  description?: string;
  tags: string[];
  /**
   * Explicit mapping to an existing element in the base diagram.
   * Set by the user during the Tag & Classify step when a base diagram is loaded.
   * null = user confirmed "new element"; undefined = not yet resolved.
   */
  baseElementId?: string | null;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardState {
  step: WizardStep;
  reviewFile: ReviewFile | null;
  parseError: string | null;
  baseDiagramError: string | null;
  candidates: Candidate[];
  systems: SystemGroup[];
  elements: ElementConfig[];
  selectedElementId: string | null;
  reviewFilter: 'all' | 'pending' | 'accepted' | 'rejected';
  editingCandidateId: string | null;
}

export type WizardAction =
  | { type: 'LOAD_REVIEW'; file: ReviewFile; candidates: Candidate[] }
  | { type: 'SET_PARSE_ERROR'; error: string }
  | { type: 'SET_BASE_DIAGRAM_ERROR'; error: string }
  | { type: 'CLEAR_BASE_DIAGRAM_ERROR' }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'CREATE_SYSTEM'; id: string; name: string }
  | { type: 'DELETE_SYSTEM'; systemId: string }
  | { type: 'RENAME_SYSTEM'; systemId: string; name: string }
  | { type: 'ASSIGN_REPO_TO_SYSTEM'; repoName: string; systemId: string }
  | { type: 'UNASSIGN_REPO'; repoName: string }
  | { type: 'SET_CANDIDATE_STATUS'; id: string; status: CandidateStatus }
  | {
      type: 'SET_CANDIDATE_OVERRIDE';
      id: string;
      overrideName: string | null;
      overrideType: string | null;
    }
  | { type: 'ACCEPT_ALL_HIGH_CONFIDENCE' }
  | { type: 'SET_REVIEW_FILTER'; filter: WizardState['reviewFilter'] }
  | { type: 'SET_EDITING_CANDIDATE'; id: string | null }
  | { type: 'INIT_ELEMENTS'; elements: ElementConfig[] }
  | { type: 'UPDATE_ELEMENT'; config: ElementConfig }
  | { type: 'SELECT_ELEMENT'; id: string | null };
