// Lightweight diff/patch API (ChangeProposal alignment)

import type { ChangeProposal, ArchitectureModel } from './types';

export function createChangeProposal(
  id: string,
  summary: string,
  changes: ChangeProposal['changes']
): ChangeProposal {
  return { id, summary, changes };
}

export function applyChangeProposal(
  model: ArchitectureModel,
  _proposal: ChangeProposal
): ArchitectureModel {
  // TODO: Implement change application logic in a later user story
  // For now, return model unchanged
  return model;
}
