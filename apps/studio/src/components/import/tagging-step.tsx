'use client';

import { useEffect } from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { WizardState, WizardAction, ElementConfig } from '@/lib/import/types';
import { ElementEditorPanel } from '@/components/import/element-editor';
import { classifyElements } from '@/lib/import/classify-elements';

interface TaggingStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  baseDiagram?: ArchitectureModel | null;
}

const KIND_ICONS: Record<ElementConfig['kind'], string> = {
  system: '🏛️',
  container: '📦',
  person: '👤',
};

const KIND_LABELS: Record<ElementConfig['kind'], string> = {
  system: 'System',
  container: 'Container',
  person: 'Person',
};

export function TaggingStep({ state, dispatch, baseDiagram }: TaggingStepProps) {
  // Auto-initialize elements when entering this step
  useEffect(() => {
    if (state.elements.length === 0 && state.candidates.length > 0) {
      const sourceRepos = state.reviewFile?.source_repos ?? [];
      const elements = classifyElements(state.candidates, sourceRepos);
      dispatch({ type: 'INIT_ELEMENTS', elements });
    }
  }, [state.elements.length, state.candidates, state.reviewFile, dispatch]);

  function handleSelectElement(id: string): void {
    dispatch({ type: 'SELECT_ELEMENT', id });
  }

  function handleUpdateElement(config: ElementConfig): void {
    dispatch({ type: 'UPDATE_ELEMENT', config });
  }

  const selectedElement =
    state.selectedElementId !== null
      ? (state.elements.find((el) => el.id === state.selectedElementId) ?? null)
      : null;

  return (
    <div className="iw-tagging-layout">
      {/* Left: element list */}
      <div className="iw-element-list">
        <h2 className="iw-panel-heading">Detected Elements</h2>

        {state.elements.length === 0 ? (
          <p className="iw-panel-empty">No elements detected yet.</p>
        ) : (
          <ul className="iw-element-items">
            {state.elements.map((el) => (
              <li
                key={el.id}
                className={`iw-element-item${state.selectedElementId === el.id ? ' iw-element-item--selected' : ''}`}
                onClick={() => handleSelectElement(el.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelectElement(el.id);
                }}
              >
                <span className="iw-element-icon" aria-hidden="true">
                  {KIND_ICONS[el.kind]}
                </span>
                <span className="iw-element-display-name">{el.displayName}</span>
                <div className="iw-element-badges">
                  <span className="iw-badge iw-badge--kind">{KIND_LABELS[el.kind]}</span>
                  {el.isExternal && <span className="iw-badge iw-badge--external">ext</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: editor panel */}
      <div className="iw-element-editor">
        {selectedElement === null ? (
          <div className="iw-editor-placeholder">← Select an element to classify it</div>
        ) : (
          <ElementEditorPanel
            element={selectedElement}
            systems={state.systems}
            onChange={handleUpdateElement}
            baseDiagram={baseDiagram}
          />
        )}
      </div>
    </div>
  );
}
