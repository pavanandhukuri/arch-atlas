'use client';

import { useMemo } from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { WizardState } from '@/lib/import/types';
import { DiagramPreview } from '@/components/import/diagram-preview';
import { buildModel } from '@/lib/import/build-model';
import { mergeModels } from '@/lib/import/merge-model';
import { exportModel } from '@/services/import-export';

interface FinalizeStepProps {
  state: WizardState;
  baseDiagram: ArchitectureModel | null;
  onOpenInStudio: (model: ArchitectureModel) => void;
}

export function FinalizeStep({ state, baseDiagram, onOpenInStudio }: FinalizeStepProps) {
  const builtModel = useMemo(() => buildModel(state, 'Imported Architecture'), [state]);

  const finalModel = useMemo(
    () =>
      baseDiagram !== null ? mergeModels(baseDiagram, builtModel, state.elements) : builtModel,
    [baseDiagram, builtModel, state.elements]
  );

  const elementCount = state.elements.length;
  const connectionCount = state.candidates.filter((c) => c.status === 'accepted').length;
  const systemCount =
    state.systems.length > 0
      ? state.systems.length
      : new Set(state.candidates.map((c) => c.source)).size;

  function handleDownload(): void {
    exportModel(finalModel);
  }

  function handleOpenInStudio(): void {
    onOpenInStudio(finalModel);
  }

  return (
    <div className="iw-step-content">
      <h2 className="iw-step-title">Finalize &amp; Export</h2>

      {/* Summary stats */}
      <div className="iw-summary-card">
        <div className="iw-summary-stat">
          <span className="iw-summary-value">{elementCount}</span>
          <span className="iw-summary-label">Elements</span>
        </div>
        <div className="iw-summary-divider" />
        <div className="iw-summary-stat">
          <span className="iw-summary-value">{connectionCount}</span>
          <span className="iw-summary-label">Connections</span>
        </div>
        <div className="iw-summary-divider" />
        <div className="iw-summary-stat">
          <span className="iw-summary-value">{systemCount}</span>
          <span className="iw-summary-label">Systems</span>
        </div>
      </div>

      {/* Full diagram preview */}
      <div className="iw-finalize-diagram">
        <DiagramPreview model={finalModel} />
      </div>

      {/* Action buttons */}
      <div className="iw-finalize-actions">
        <button type="button" className="iw-btn iw-btn--secondary" onClick={handleDownload}>
          Download .arch.json
        </button>
        <button type="button" className="iw-btn iw-btn--primary" onClick={handleOpenInStudio}>
          Open in Studio
        </button>
      </div>
    </div>
  );
}
