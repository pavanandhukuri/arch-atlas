import { describe, it, expect } from 'vitest';
import { createChangeProposal, applyChangeProposal } from '../src/change-proposal';
import type { ArchitectureModel } from '../src/types';
import minimalModel from './fixtures/minimal-model.json';

describe('createChangeProposal', () => {
  it('returns a ChangeProposal with the given id, summary, and changes', () => {
    const proposal = createChangeProposal('cp-1', 'Add a new system', []);
    expect(proposal.id).toBe('cp-1');
    expect(proposal.summary).toBe('Add a new system');
    expect(proposal.changes).toEqual([]);
  });

  it('includes provided changes array', () => {
    const changes = [{ op: 'add' as const, path: '/elements/0', value: {} }];
    const proposal = createChangeProposal('cp-2', 'summary', changes);
    expect(proposal.changes).toBe(changes);
  });
});

describe('applyChangeProposal', () => {
  it('returns the model unchanged (stub implementation)', () => {
    const model = minimalModel as ArchitectureModel;
    const proposal = createChangeProposal('cp-1', 'no-op', []);
    const result = applyChangeProposal(model, proposal);
    expect(result).toBe(model);
  });
});
