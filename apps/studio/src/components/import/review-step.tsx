'use client';

import { useMemo, useEffect, useCallback, useRef } from 'react';
import type { WizardState, WizardAction, Candidate, CandidateStatus } from '@/lib/import/types';
import { CandidateCard } from '@/components/import/candidate-card';
import { DiagramPreview } from '@/components/import/diagram-preview';
import { buildModel } from '@/lib/import/build-model';

interface ReviewStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

type FilterValue = WizardState['reviewFilter'];

const FILTER_LABELS: Record<FilterValue, string> = {
  all: 'All',
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export function ReviewStep({ state, dispatch }: ReviewStepProps) {
  const focusedCandidateIdRef = useRef<string | null>(null);

  // Count candidates per status
  const counts = useMemo(() => {
    const result = { pending: 0, accepted: 0, rejected: 0 };
    for (const c of state.candidates) {
      result[c.status]++;
    }
    return result;
  }, [state.candidates]);

  // Group by source name
  const groups = useMemo(() => {
    const filtered = state.candidates.filter((c) => {
      if (state.reviewFilter === 'all') return true;
      return c.status === state.reviewFilter;
    });

    const groupMap = new Map<string, Candidate[]>();
    for (const c of filtered) {
      const existing = groupMap.get(c.source);
      if (existing) {
        existing.push(c);
      } else {
        groupMap.set(c.source, [c]);
      }
    }
    return groupMap;
  }, [state.candidates, state.reviewFilter]);

  // Build partial model for preview (memoised on candidates array reference)
  const previewModel = useMemo(() => buildModel(state), [state]);

  function handleSetStatus(id: string, status: CandidateStatus): void {
    dispatch({ type: 'SET_CANDIDATE_STATUS', id, status });
  }

  function handleToggleEdit(id: string): void {
    dispatch({
      type: 'SET_EDITING_CANDIDATE',
      id: state.editingCandidateId === id ? null : id,
    });
  }

  function handleCancelEdit(): void {
    dispatch({ type: 'SET_EDITING_CANDIDATE', id: null });
  }

  function handleSaveEdit(
    id: string,
    overrideName: string | null,
    overrideType: string | null
  ): void {
    dispatch({ type: 'SET_CANDIDATE_OVERRIDE', id, overrideName, overrideType });
    dispatch({ type: 'SET_EDITING_CANDIDATE', id: null });
  }

  function handleAcceptAllHigh(): void {
    dispatch({ type: 'ACCEPT_ALL_HIGH_CONFIDENCE' });
  }

  function handleFilterChange(filter: FilterValue): void {
    dispatch({ type: 'SET_REVIEW_FILTER', filter });
  }

  // Keyboard handler: 'a' accepts, 'r' rejects the focused candidate
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Don't fire shortcuts when typing in inputs
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const focusedId = focusedCandidateIdRef.current;
      if (!focusedId) return;

      if (e.key === 'a') {
        dispatch({ type: 'SET_CANDIDATE_STATUS', id: focusedId, status: 'accepted' });
      } else if (e.key === 'r') {
        dispatch({ type: 'SET_CANDIDATE_STATUS', id: focusedId, status: 'rejected' });
      }
    },
    [dispatch]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filterTabs: FilterValue[] = ['all', 'pending', 'accepted', 'rejected'];

  return (
    <div className="iw-review-layout">
      {/* Left panel — candidate list */}
      <div className="iw-review-left">
        {/* Toolbar */}
        <div className="iw-review-toolbar">
          <div className="iw-filter-tabs" role="tablist">
            {filterTabs.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={state.reviewFilter === f}
                className={`iw-filter-tab${state.reviewFilter === f ? ' iw-filter-tab--active' : ''}`}
                onClick={() => handleFilterChange(f)}
              >
                {FILTER_LABELS[f]}
                {f !== 'all' && <span className="iw-filter-tab-count">{counts[f]}</span>}
                {f === 'all' && (
                  <span className="iw-filter-tab-count">{state.candidates.length}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="iw-btn iw-btn--secondary iw-btn--sm"
            onClick={handleAcceptAllHigh}
          >
            Accept All High
          </button>
        </div>

        {/* Candidate groups */}
        <div className="iw-candidate-groups">
          {groups.size === 0 ? (
            <p className="iw-panel-empty">No candidates match the current filter.</p>
          ) : (
            Array.from(groups.entries()).map(([source, candidates]) => (
              <div key={source} className="iw-candidate-group">
                <h3 className="iw-candidate-group-label">{source}</h3>
                <div className="iw-candidate-list">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      onFocus={() => {
                        focusedCandidateIdRef.current = candidate.id;
                      }}
                      onMouseEnter={() => {
                        focusedCandidateIdRef.current = candidate.id;
                      }}
                    >
                      <CandidateCard
                        candidate={candidate}
                        isEditing={state.editingCandidateId === candidate.id}
                        onAccept={() => handleSetStatus(candidate.id, 'accepted')}
                        onReject={() => handleSetStatus(candidate.id, 'rejected')}
                        onToggleEdit={() => handleToggleEdit(candidate.id)}
                        onSaveEdit={(overrideName, overrideType) =>
                          handleSaveEdit(candidate.id, overrideName, overrideType)
                        }
                        onCancelEdit={handleCancelEdit}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="iw-keyboard-hint">Keyboard: a = accept, r = reject</p>
      </div>

      {/* Right panel — live diagram preview */}
      <div className="iw-review-right">
        <h3 className="iw-panel-heading">Live Preview</h3>
        <DiagramPreview model={previewModel} placeholder="Classify elements to see the diagram" />
      </div>
    </div>
  );
}
