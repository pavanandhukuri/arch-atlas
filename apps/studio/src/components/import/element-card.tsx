'use client';

import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { ElementConfig, SystemGroup } from '@/lib/import/types';
import { ElementEditorPanel } from '@/components/import/element-editor';
import { isElementClassified } from '@/lib/import/element-validation';

// ---------------------------------------------------------------------------
// Display maps
// ---------------------------------------------------------------------------

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

const SUBTYPE_LABELS: Record<string, string> = {
  'backend-service': 'Backend Service',
  database: 'Database',
  default: 'Queue',
  'user-interface': 'UI',
  'storage-bucket': 'Storage',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ElementCardProps {
  element: ElementConfig;
  systems: SystemGroup[];
  isEditing: boolean;
  isSelected: boolean;
  onAccept: () => void;
  onToggleEdit: () => void;
  onToggleSelect: () => void;
  onChange: (updated: ElementConfig) => void;
  onCreateSystem: (name: string) => string;
  baseDiagram?: ArchitectureModel | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ElementCard({
  element,
  systems,
  isEditing,
  isSelected,
  onAccept,
  onToggleEdit,
  onToggleSelect,
  onChange,
  onCreateSystem,
  baseDiagram,
}: ElementCardProps) {
  const isClassified = isElementClassified(element);
  const isReviewed = element.reviewed === true && isClassified;
  const systemName =
    element.kind === 'container' && element.systemId !== undefined
      ? (systems.find((s) => s.id === element.systemId)?.name ?? null)
      : null;

  const cardClassName = [
    'iw-cand-card',
    isReviewed ? 'iw-cand-card--accepted' : 'iw-cand-card--pending',
  ].join(' ');

  return (
    <div
      className={cardClassName}
      role="listitem"
      aria-label={`${element.displayName}, ${KIND_LABELS[element.kind]}, ${isReviewed ? 'reviewed' : 'pending'}`}
    >
      {/* Header row */}
      <div className="iw-cand-header">
        <input
          type="checkbox"
          className="iw-cand-select"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${element.displayName} for bulk actions`}
        />
        <span
          className="iw-cand-type-icon"
          aria-label={element.kind}
          title={KIND_LABELS[element.kind]}
        >
          {KIND_ICONS[element.kind]}
        </span>

        <div className="iw-cand-names">
          <span className="iw-cand-source" title={element.displayName}>
            {element.displayName}
          </span>
        </div>

        {/* Classification badges */}
        <span className="iw-badge iw-badge--kind">{KIND_LABELS[element.kind]}</span>
        {element.kind === 'container' && (
          <span className="iw-badge iw-badge--kind">
            {SUBTYPE_LABELS[element.containerSubtype ?? 'default'] ?? element.containerSubtype}
          </span>
        )}
        {element.kind === 'container' && (
          <span
            className={`iw-badge ${systemName !== null ? 'iw-badge--kind' : 'iw-badge--warning'}`}
          >
            {systemName ?? 'No system — assign one'}
          </span>
        )}
        {element.kind === 'system' && (
          <span
            className={`iw-badge ${element.isExternal ? 'iw-badge--external' : 'iw-badge--warning'}`}
          >
            {element.isExternal ? 'ext' : 'Not marked external'}
          </span>
        )}

        {/* Action buttons */}
        <div className="iw-cand-actions" role="group" aria-label="Element actions">
          <button
            className="iw-btn iw-btn-sm iw-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              if (isClassified) onAccept();
            }}
            disabled={!isClassified}
            title={
              !isClassified
                ? 'Assign a system or mark as external before accepting'
                : isReviewed
                  ? 'Reviewed — click to set pending'
                  : 'Accept classification'
            }
            aria-label={
              !isClassified
                ? 'Assign a system or mark as external before accepting'
                : isReviewed
                  ? 'Reviewed — click to set pending'
                  : 'Accept classification'
            }
            aria-pressed={isReviewed}
            style={
              isReviewed
                ? { background: '#d1fae5', borderColor: '#6ee7b7', color: '#065f46' }
                : undefined
            }
          >
            ✓
          </button>
          <button
            className="iw-btn iw-btn-sm iw-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEdit();
            }}
            title={isEditing ? 'Close editor' : 'Edit classification'}
            aria-label={isEditing ? 'Close editor' : 'Edit classification'}
            aria-expanded={isEditing}
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="iw-cand-edit-form" role="form" aria-label="Element classification editor">
          <ElementEditorPanel
            element={element}
            systems={systems}
            onChange={onChange}
            onCreateSystem={onCreateSystem}
            baseDiagram={baseDiagram}
          />
        </div>
      )}
    </div>
  );
}
