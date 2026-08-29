'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import { useWizardState } from '@/lib/import/wizard-state';
import type { WizardStep } from '@/lib/import/types';

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
  { number: 1, label: 'Load Files' },
  { number: 2, label: 'Define Systems' },
  { number: 3, label: 'Review Candidates' },
  { number: 4, label: 'Tag & Classify' },
  { number: 5, label: 'Finalize' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportWizard() {
  const [state, dispatch] = useWizardState();
  const [baseDiagram, setBaseDiagram] = useState<ArchitectureModel | null>(null);
  const router = useRouter();

  const currentStep = state.step;

  // ---- Navigation guards ----

  /** Whether each step has been completed enough to advance */
  const isStepCompleted = useCallback(
    (step: WizardStep): boolean => {
      switch (step) {
        case 1:
          return state.reviewFile !== null;
        case 2:
          // Always "completable" — repos can just remain ungrouped
          return state.reviewFile !== null;
        case 3:
          // Need at least one accepted candidate to proceed
          return state.candidates.some((c) => c.status === 'accepted');
        case 4:
          return state.elements.length > 0;
        case 5:
          return false; // terminal step
        default:
          return false;
      }
    },
    [state.reviewFile, state.candidates, state.elements]
  );

  const canGoBack = currentStep > 1;
  const canGoForward = currentStep < 5 && isStepCompleted(currentStep);

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
  // The review step needs a full-bleed layout (no padding, no overflow-y scroll)
  const mainClass = currentStep === 3 ? 'iw-main iw-main--review' : 'iw-main';

  // ---- Render current step ----

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <LoadStep
            state={state}
            dispatch={dispatch}
            baseDiagram={baseDiagram}
            onBaseDiagramLoad={setBaseDiagram}
          />
        );
      case 2:
        return <SystemsStep state={state} dispatch={dispatch} />;
      case 3:
        return <ReviewStep state={state} dispatch={dispatch} />;
      case 4:
        return <TaggingStep state={state} dispatch={dispatch} baseDiagram={baseDiagram} />;
      case 5:
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
          Step {currentStep} of 5 — {STEPS[currentStep - 1]?.label ?? ''}
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
            {currentStep !== 3 ? <div className="iw-step-panel">{renderStep()}</div> : renderStep()}
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
              {currentStep === 2 && (
                <button type="button" className="iw-btn iw-btn-ghost" onClick={handleNext}>
                  Skip (each repo = its own system)
                </button>
              )}
              {currentStep < 5 && (
                <button
                  type="button"
                  className="iw-btn iw-btn-primary"
                  onClick={handleNext}
                  disabled={!canGoForward && currentStep !== 2}
                  aria-disabled={!canGoForward && currentStep !== 2}
                >
                  {currentStep === 4 ? 'Review & Export →' : 'Next →'}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
