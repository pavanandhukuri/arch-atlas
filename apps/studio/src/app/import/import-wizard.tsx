'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ArchitectureModel } from '@archatlas/core-model';
import { useWizardState } from '@/lib/import/wizard-state';
import type { WizardStep, WizardState } from '@/lib/import/types';
import { classifyElements } from '@/lib/import/classify-elements';
import { isElementClassified } from '@/lib/import/element-validation';

import { InstructionsStep } from '@/components/import/instructions-step';
import { LoadStep } from '@/components/import/load-step';
import { SystemsStep } from '@/components/import/systems-step';
import { ReviewStep } from '@/components/import/review-step';
import { TaggingStep } from '@/components/import/tagging-step';
import { FinalizeStep } from '@/components/import/finalize-step';

import '@/components/import/import.css';

// ---------------------------------------------------------------------------
// Step metadata
// ---------------------------------------------------------------------------

interface StepMeta {
  number: WizardStep;
  label: string;
}

const STEPS: StepMeta[] = [
  { number: 1, label: 'Instructions' },
  { number: 2, label: 'Load Files' },
  { number: 3, label: 'Define Systems' },
  { number: 4, label: 'Tag & Classify' },
  { number: 5, label: 'Review Candidates' },
  { number: 6, label: 'Finalize' },
];

// ---------------------------------------------------------------------------
// Decision gates
// ---------------------------------------------------------------------------

/**
 * Steps that present a list of items the user must explicitly decide on
 * (accept/reject candidates, review elements) before advancing. Returns
 * null for steps with no such gate (e.g. Load Files, Finalize).
 */
interface DecisionGate {
  pendingCount: number;
  itemLabel: string;
  actionLabel: string;
}

function getDecisionGate(step: WizardStep, state: WizardState): DecisionGate | null {
  switch (step) {
    case 4:
      return {
        pendingCount: state.elements.filter((e) => e.reviewed !== true || !isElementClassified(e))
          .length,
        itemLabel: 'element',
        actionLabel: 'review',
      };
    case 5:
      return {
        pendingCount: state.candidates.filter((c) => c.status === 'pending').length,
        itemLabel: 'candidate',
        actionLabel: 'accept or reject',
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportWizard() {
  const [state, dispatch] = useWizardState();
  const [baseDiagram, setBaseDiagram] = useState<ArchitectureModel | null>(null);
  const router = useRouter();

  const currentStep = state.step;

  // Auto-classify elements once the user has moved past the Systems step, rather than
  // waiting for them to visit Tag & Classify. Earlier steps (e.g. the Review Candidates
  // live preview) need state.elements populated to render containers nested inside their
  // parent systems. Gated on step > 3 so manual system grouping (Define Systems) has a chance to
  // finish first — otherwise containers could get classified before systems exist.
  useEffect(() => {
    if (state.step > 3 && state.elements.length === 0 && state.candidates.length > 0) {
      const sourceRepos = state.reviewFile?.source_repos ?? [];
      const elements = classifyElements(state.candidates, sourceRepos, state.systems);
      dispatch({ type: 'INIT_ELEMENTS', elements });
    }
  }, [
    state.step,
    state.elements.length,
    state.candidates,
    state.reviewFile,
    state.systems,
    dispatch,
  ]);

  // ---- Navigation guards ----

  /** Whether each step has been completed enough to advance */
  const isStepCompleted = useCallback(
    (step: WizardStep): boolean => {
      switch (step) {
        case 1:
          return true; // informational — nothing to gate on
        case 2:
          return state.reviewFile !== null;
        case 3:
          // Always "completable" — repos can just remain ungrouped
          return state.reviewFile !== null;
        case 4:
          return state.elements.length > 0 && getDecisionGate(4, state)?.pendingCount === 0;
        case 5:
          return state.candidates.length > 0 && getDecisionGate(5, state)?.pendingCount === 0;
        case 6:
          return false; // terminal step
        default:
          return false;
      }
    },
    [state]
  );

  const canGoBack = currentStep > 1;
  const canGoForward = currentStep < 6 && isStepCompleted(currentStep);

  const handleBack = () => {
    dispatch({ type: 'PREV_STEP' });
  };

  const handleNext = () => {
    if (canGoForward) {
      dispatch({ type: 'NEXT_STEP' });
    }
  };

  const handleStepClick = (step: WizardStep) => {
    // Allow navigating to already-completed steps (or current step)
    if (step < currentStep || step === currentStep) {
      dispatch({ type: 'GO_TO_STEP', step });
    } else if (step === currentStep + 1 && isStepCompleted(currentStep)) {
      dispatch({ type: 'GO_TO_STEP', step });
    }
  };

  const handleOpenInStudio = (model: ArchitectureModel) => {
    try {
      sessionStorage.setItem('import_model', JSON.stringify(model));
    } catch {
      // sessionStorage unavailable — navigate anyway
    }
    router.push('/');
  };

  // ---- Step classification for sidebar ----

  const getStepClass = (step: WizardStep): string => {
    const classes: string[] = ['iw-step-item'];
    if (step === currentStep) {
      classes.push('iw-step-item--active');
    } else if (step < currentStep || isStepCompleted(step)) {
      classes.push('iw-step-item--completed');
    } else {
      classes.push('iw-step-item--disabled');
    }
    return classes.join(' ');
  };

  const getStepNumberDisplay = (step: WizardStep): string => {
    if (step < currentStep) return '✓';
    return String(step);
  };

  // ---- Main area class ----
  // Tag & Classify and Review Candidates both use a split-pane, full-bleed
  // layout (list + live preview) with no padding / no outer scroll.
  const isSplitPaneStep = currentStep === 4 || currentStep === 5;
  const mainClass = isSplitPaneStep ? 'iw-main iw-main--review' : 'iw-main';

  // ---- Render current step ----

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <InstructionsStep />;
      case 2:
        return (
          <LoadStep
            state={state}
            dispatch={dispatch}
            baseDiagram={baseDiagram}
            onBaseDiagramLoad={setBaseDiagram}
          />
        );
      case 3:
        return <SystemsStep state={state} dispatch={dispatch} />;
      case 4:
        return <TaggingStep state={state} dispatch={dispatch} baseDiagram={baseDiagram} />;
      case 5:
        return <ReviewStep state={state} dispatch={dispatch} />;
      case 6:
        return (
          <FinalizeStep
            state={state}
            baseDiagram={baseDiagram}
            onOpenInStudio={handleOpenInStudio}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="iw-layout">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="iw-header">
        <div className="iw-header-left">
          <button
            type="button"
            className="iw-back-link"
            onClick={() => router.push('/')}
            aria-label="Back to Studio"
          >
            ← Studio
          </button>
          <h1>Import Wizard</h1>
        </div>
        <span style={{ fontSize: '0.8rem', color: '#bdc3c7' }}>
          Step {currentStep} of 6 — {STEPS[currentStep - 1]?.label ?? ''}
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Body                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="iw-content">
        {/* Sidebar: step progress */}
        <nav className="iw-sidebar" aria-label="Wizard steps">
          <h3>Steps</h3>
          <ul className="iw-step-list">
            {STEPS.map((step) => (
              <li key={step.number}>
                <button
                  type="button"
                  className={getStepClass(step.number)}
                  onClick={() => handleStepClick(step.number)}
                  aria-current={step.number === currentStep ? 'step' : undefined}
                  aria-label={`Step ${step.number}: ${step.label}${step.number < currentStep ? ' (completed)' : ''}`}
                >
                  <span className="iw-step-number">{getStepNumberDisplay(step.number)}</span>
                  {step.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content area + nav footer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Step content */}
          <div className={mainClass}>
            {!isSplitPaneStep ? <div className="iw-step-panel">{renderStep()}</div> : renderStep()}
          </div>

          {/* Navigation footer */}
          <footer className="iw-nav">
            <div>
              {canGoBack && (
                <button type="button" className="iw-btn iw-btn-secondary" onClick={handleBack}>
                  ← Back
                </button>
              )}
            </div>

            <div className="iw-nav-right">
              {currentStep === 3 && (
                <button type="button" className="iw-btn iw-btn-ghost" onClick={handleNext}>
                  Skip (each repo = its own system)
                </button>
              )}
              {(() => {
                const gate = getDecisionGate(currentStep, state);
                if (!gate || canGoForward || gate.pendingCount === 0) return null;
                return (
                  <span className="iw-nav-hint">
                    {gate.pendingCount} {gate.itemLabel}
                    {gate.pendingCount === 1 ? '' : 's'} still pending — {gate.actionLabel} all to
                    continue
                  </span>
                );
              })()}
              {currentStep < 6 && (
                <button
                  type="button"
                  className="iw-btn iw-btn-primary"
                  onClick={handleNext}
                  disabled={!canGoForward && currentStep !== 3}
                  aria-disabled={!canGoForward && currentStep !== 3}
                >
                  {currentStep === 5 ? 'Review & Export →' : 'Next →'}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
