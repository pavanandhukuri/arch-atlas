import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const FAKE_CANDIDATE = {
  id: 'c1',
  source: 'a',
  target: 'b',
  type: 'http',
  reasoning: 'x',
  confidence: 'high',
  status: 'pending',
  override_name: null,
  override_type: null,
};

vi.mock('../../../src/components/import/load-step', () => ({
  LoadStep: ({
    dispatch,
  }: {
    dispatch: (a: { type: string; file: unknown; candidates: unknown[] }) => void;
  }) => (
    <div>
      <span>load-step</span>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: 'LOAD_REVIEW',
            file: {
              version: '1.0',
              generated_at: '',
              source_repos: ['a'],
              candidates: [FAKE_CANDIDATE],
            },
            candidates: [FAKE_CANDIDATE],
          })
        }
      >
        simulate-load-review
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/systems-step', () => ({
  SystemsStep: () => <div>systems-step</div>,
}));
vi.mock('../../../src/components/import/review-step', () => ({
  ReviewStep: ({
    dispatch,
  }: {
    dispatch: (a: { type: string; id: string; status: string }) => void;
  }) => (
    <div>
      <span>review-step</span>
      <button
        type="button"
        onClick={() => dispatch({ type: 'SET_CANDIDATE_STATUS', id: 'c1', status: 'accepted' })}
      >
        simulate-accept-candidate
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/tagging-step', () => ({
  TaggingStep: ({ dispatch }: { dispatch: (a: { type: string; elements: unknown[] }) => void }) => (
    <div>
      <span>tagging-step</span>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: 'INIT_ELEMENTS',
            elements: [
              {
                id: 'e1',
                name: 'a',
                displayName: 'a',
                kind: 'system',
                isExternal: false,
                tags: [],
              },
            ],
          })
        }
      >
        simulate-init-elements
      </button>
    </div>
  ),
}));
vi.mock('../../../src/components/import/finalize-step', () => ({
  FinalizeStep: ({
    onOpenInStudio,
  }: {
    onOpenInStudio: (model: { schemaVersion: string }) => void;
  }) => (
    <div>
      <span>finalize-step</span>
      <button type="button" onClick={() => onOpenInStudio({ schemaVersion: '1.0.0' })}>
        simulate-open-in-studio
      </button>
    </div>
  ),
}));

import { ImportWizard } from '../../../src/app/import/import-wizard';

describe('ImportWizard', () => {
  beforeEach(() => {
    pushMock.mockClear();
    sessionStorage.clear();
  });

  it('starts on step 1 (Load Files)', () => {
    render(<ImportWizard />);
    expect(screen.getByText('load-step')).toBeDefined();
    expect(screen.getByText(/Step 1 of 5/)).toBeDefined();
  });

  it('disables Next on step 1 until a review file is loaded', () => {
    render(<ImportWizard />);
    const next = screen.getByRole('button', { name: 'Next →' });
    expect(next.hasAttribute('disabled')).toBe(true);
  });

  it('advances past step 1 once a review file is loaded, and shows Back afterward', async () => {
    const user = userEvent.setup();
    render(<ImportWizard />);

    await user.click(screen.getByRole('button', { name: 'simulate-load-review' }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    expect(screen.getByText('systems-step')).toBeDefined();
    expect(screen.getByRole('button', { name: '← Back' })).toBeDefined();
  });

  it('allows skipping step 2 (Define Systems) regardless of completion state', async () => {
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.click(screen.getByRole('button', { name: 'simulate-load-review' }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    await user.click(screen.getByRole('button', { name: 'Skip (each repo = its own system)' }));

    expect(screen.getByText('review-step')).toBeDefined();
  });

  it('navigates back to a previous step via Back', async () => {
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.click(screen.getByRole('button', { name: 'simulate-load-review' }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: '← Back' }));

    expect(screen.getByText('load-step')).toBeDefined();
  });

  it('allows jumping back to an earlier step via the sidebar, but not forward past the current step', async () => {
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.click(screen.getByRole('button', { name: 'simulate-load-review' }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    // Jump forward to step 4 (Tag & Classify) — should be blocked since step 3 isn't completed.
    await user.click(screen.getByRole('button', { name: /Step 4: Tag & Classify/ }));
    expect(screen.getByText('systems-step')).toBeDefined();

    // Jump back to step 1 — allowed.
    await user.click(screen.getByRole('button', { name: /Step 1: Load Files/ }));
    expect(screen.getByText('load-step')).toBeDefined();
  });

  it('routes to Studio with the built model in sessionStorage when Open in Studio is clicked', async () => {
    const user = userEvent.setup();
    render(<ImportWizard />);

    await user.click(screen.getByRole('button', { name: 'simulate-load-review' }));
    await user.click(screen.getByRole('button', { name: 'Next →' })); // -> step 2
    await user.click(screen.getByRole('button', { name: 'Skip (each repo = its own system)' })); // -> step 3

    await user.click(screen.getByRole('button', { name: 'simulate-accept-candidate' }));
    await user.click(screen.getByRole('button', { name: 'Next →' })); // -> step 4

    await user.click(screen.getByRole('button', { name: 'simulate-init-elements' }));
    await user.click(screen.getByRole('button', { name: 'Review & Export →' })); // -> step 5

    expect(screen.getByText('finalize-step')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'simulate-open-in-studio' }));

    expect(pushMock).toHaveBeenCalledWith('/');
    expect(sessionStorage.getItem('import_model')).toBe(JSON.stringify({ schemaVersion: '1.0.0' }));
  });
});
