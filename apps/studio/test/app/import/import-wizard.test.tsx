import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { Dispatch } from 'react';
import type { WizardAction, WizardState } from '../../../src/lib/import/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../../../src/components/import/instructions-step', () => ({
  InstructionsStep: () => <div data-testid="step-1" />,
}));
vi.mock('../../../src/components/import/load-step', () => ({
  LoadStep: ({ dispatch }: { dispatch: Dispatch<WizardAction> }) => (
    <div data-testid="step-2">
      <button
        onClick={() =>
          dispatch({
            type: 'LOAD_REVIEW',
            file: {
              version: '2.0',
              generated_at: '',
              source_repos: ['repo-a'],
              systems: [],
              candidates: [],
            },
            candidates: [
              {
                id: 'cand-1',
                source: 'repo-a',
                target: 'repo-b',
                type: 'http',
                reasoning: '',
                confidence: 'low',
                status: 'pending',
                override_name: null,
                override_type: null,
              },
            ],
          })
        }
      >
        mock-load-review
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/systems-step', () => ({
  SystemsStep: () => <div data-testid="step-3" />,
}));
vi.mock('../../../src/components/import/tagging-step', () => ({
  TaggingStep: ({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) => (
    <div data-testid="step-4">
      <button
        onClick={() =>
          state.elements.forEach((el) =>
            // isElementClassified requires systemId for containers and isExternal for systems —
            // set both so this works regardless of how classifyElements categorized the element.
            dispatch({
              type: 'UPDATE_ELEMENT',
              config: { ...el, reviewed: true, isExternal: true, systemId: 'sys-mock' },
            })
          )
        }
      >
        mock-review-all-elements
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/review-step', () => ({
  ReviewStep: ({ dispatch }: { dispatch: Dispatch<WizardAction> }) => (
    <div data-testid="step-5">
      <button
        onClick={() => dispatch({ type: 'SET_CANDIDATE_STATUS', id: 'cand-1', status: 'accepted' })}
      >
        mock-accept-candidate
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/finalize-step', () => ({
  FinalizeStep: ({ onOpenInStudio }: { onOpenInStudio: (model: unknown) => void }) => (
    <div data-testid="step-6">
      <button onClick={() => onOpenInStudio({ schemaVersion: '0.1.0' })}>
        mock-open-in-studio
      </button>
    </div>
  ),
}));

import { ImportWizard } from '../../../src/app/import/import-wizard';

function sessionStorageSetItemSpy() {
  return vi.spyOn(Storage.prototype, 'setItem');
}

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled;
}

describe('ImportWizard', () => {
  beforeEach(() => {
    push.mockClear();
    sessionStorage.clear();
  });

  it('starts on step 1 with Back disabled and Next blocked only when the decision gate requires it', () => {
    render(<ImportWizard />);
    expect(screen.getByTestId('step-1')).toBeDefined();
    expect(screen.queryByRole('button', { name: '← Back' })).toBeNull();
    expect(isDisabled(screen.getByRole('button', { name: 'Next →' }))).toBe(false);
  });

  it('cannot advance past step 2 until a review file is loaded', async () => {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByTestId('step-2')).toBeDefined();
    expect(isDisabled(screen.getByRole('button', { name: 'Next →' }))).toBe(true);

    await userEvent.click(screen.getByText('mock-load-review'));
    expect(isDisabled(screen.getByRole('button', { name: 'Next →' }))).toBe(false);
  });

  async function loadReviewAndReachStep4() {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 2
    await userEvent.click(screen.getByText('mock-load-review'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 3
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 4 (auto-classifies)
  }

  it('step 4 blocks Next with a pending-review hint until every element is reviewed', async () => {
    await loadReviewAndReachStep4();
    expect(screen.getByTestId('step-4')).toBeDefined();
    expect(screen.getByText(/still pending/i)).toBeDefined();
    expect(isDisabled(screen.getByRole('button', { name: 'Next →' }))).toBe(true);

    await userEvent.click(screen.getByText('mock-review-all-elements'));
    expect(isDisabled(screen.getByRole('button', { name: 'Next →' }))).toBe(false);
  });

  it('step 5 gates on every candidate being decided, then step 6 is terminal', async () => {
    await loadReviewAndReachStep4();
    await userEvent.click(screen.getByText('mock-review-all-elements'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 5

    expect(isDisabled(screen.getByRole('button', { name: /Review & Export/i }))).toBe(true);
    await userEvent.click(screen.getByText('mock-accept-candidate'));
    expect(isDisabled(screen.getByRole('button', { name: /Review & Export/i }))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Review & Export/i })); // -> step 6
    expect(screen.getByTestId('step-6')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Next|Review & Export/i })).toBeNull();
  });

  it('clicking a completed step in the sidebar navigates back to it', async () => {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 2
    await userEvent.click(screen.getByText('mock-load-review'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 3

    await userEvent.click(screen.getByRole('button', { name: /Step 1: Instructions/i }));
    expect(screen.getByTestId('step-1')).toBeDefined();
  });

  it('Skip on step 3 advances without requiring any grouping', async () => {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(screen.getByText('mock-load-review'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 3

    await userEvent.click(screen.getByRole('button', { name: /Skip/i }));
    expect(screen.getByTestId('step-4')).toBeDefined();
  });

  it('Back navigates to the previous step', async () => {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); // -> step 2
    await userEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByTestId('step-1')).toBeDefined();
  });

  it('"Back to Studio" navigates to the studio root', async () => {
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: /Back to Studio/i }));
    expect(push).toHaveBeenCalledWith('/');
  });

  it('opening in Studio stashes the model in sessionStorage and navigates home', async () => {
    const setItemSpy = sessionStorageSetItemSpy();
    render(<ImportWizard />);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(screen.getByText('mock-load-review'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(screen.getByRole('button', { name: /Skip/i }));
    await userEvent.click(screen.getByText('mock-review-all-elements'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(screen.getByText('mock-accept-candidate'));
    await userEvent.click(screen.getByRole('button', { name: /Review & Export/i }));

    await userEvent.click(screen.getByText('mock-open-in-studio'));

    expect(setItemSpy).toHaveBeenCalledWith(
      'import_model',
      JSON.stringify({ schemaVersion: '0.1.0' })
    );
    expect(push).toHaveBeenCalledWith('/');
  });
});
