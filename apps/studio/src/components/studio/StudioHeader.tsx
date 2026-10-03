'use client';

import type { Breadcrumb, DiagramLevel } from '../../services/diagram-context';
import type { SaveStatus } from '../../hooks/useStudioDocument';

export interface StudioHeaderProps {
  breadcrumbs: Breadcrumb[];
  onNavigate: (level: DiagramLevel, focusId: string | null) => void;
  saveStatus: SaveStatus;
  saveStatusMessage: string;
  hasModel: boolean;
  hasHandle: boolean;
  isDirty: boolean;
  onImportRepos: () => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onManualSave: () => void;
  onExport: () => void;
}

/** The top bar: title, breadcrumb trail, save status, and the New/Open/Save/Export actions. */
export function StudioHeader({
  breadcrumbs,
  onNavigate,
  saveStatus,
  saveStatusMessage,
  hasModel,
  hasHandle,
  isDirty,
  onImportRepos,
  onNewFile,
  onOpenFile,
  onManualSave,
  onExport,
}: StudioHeaderProps) {
  return (
    <header className="studio-header">
      <div className="header-left">
        <h1>Arch Atlas Studio</h1>
        <nav className="breadcrumb" aria-label="Diagram navigation">
          {breadcrumbs.map((crumb, i) => {
            const isCurrent = i === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.level}-${crumb.focusId}`} className="breadcrumb-item">
                {i > 0 && <span className="breadcrumb-sep">›</span>}
                {isCurrent ? (
                  <span className="breadcrumb-current">{crumb.label}</span>
                ) : (
                  <button
                    className="breadcrumb-link"
                    onClick={() => onNavigate(crumb.level, crumb.focusId)}
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      </div>
      <div className="header-actions">
        {saveStatus !== 'idle' && (
          <span
            style={{
              fontSize: '0.8rem',
              color: saveStatus === 'error' ? '#dc2626' : '#16a34a',
              marginRight: 8,
            }}
            aria-live="polite"
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatusMessage}
          </span>
        )}
        <button onClick={onImportRepos}>Import Repos</button>
        <button onClick={onNewFile}>New</button>
        <button onClick={onOpenFile}>Open</button>
        <button onClick={onManualSave} disabled={!hasHandle || !hasModel}>
          Save {isDirty && hasHandle ? '*' : ''}
        </button>
        <button onClick={onExport} disabled={!hasModel}>
          Export
        </button>
      </div>
    </header>
  );
}
