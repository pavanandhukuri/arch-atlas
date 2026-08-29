'use client';

import { useState, useEffect, type KeyboardEvent } from 'react';
import type { Candidate, CandidateType } from '@/lib/import/types';

// ---------------------------------------------------------------------------
// Type icon map
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<CandidateType, string> = {
  database: '🗄️',
  http: '🌐',
  kafka: '📨',
  queue: '📦',
  grpc: '⚡',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CandidateCardProps {
  candidate: Candidate;
  isEditing: boolean;
  onAccept: () => void;
  onReject: () => void;
  onToggleEdit: () => void;
  onSaveEdit: (overrideName: string | null, overrideType: string | null) => void;
  onCancelEdit: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CandidateCard({
  candidate,
  isEditing,
  onAccept,
  onReject,
  onToggleEdit,
  onSaveEdit,
  onCancelEdit,
  onKeyDown,
}: CandidateCardProps) {
  const [editName, setEditName] = useState<string>(candidate.override_name ?? '');

  // Keep local edit state in sync when the card's override_name changes externally
  // (e.g. after a save or when navigating between cards).
  useEffect(() => {
    setEditName(candidate.override_name ?? '');
  }, [candidate.override_name, isEditing]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSave = () => {
    // Preserve existing override_type — this form only edits the name.
    onSaveEdit(editName.trim() !== '' ? editName.trim() : null, candidate.override_type);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
    }
  };

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const typeIcon = TYPE_ICONS[candidate.type];

  // When an override name has been saved, show it as the target label with the
  // original name shown in parentheses as a secondary note.
  const targetLabel = candidate.override_name !== null ? candidate.override_name : candidate.target;
  const showOriginal = candidate.override_name !== null;

  const isAccepted = candidate.status === 'accepted';
  const isRejected = candidate.status === 'rejected';
  const isPending = candidate.status === 'pending';

  const cardClassName = [
    'iw-cand-card',
    isAccepted ? 'iw-cand-card--accepted' : '',
    isRejected ? 'iw-cand-card--rejected' : '',
    isPending ? 'iw-cand-card--pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={cardClassName}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="listitem"
      aria-label={`${candidate.source} to ${targetLabel}, ${candidate.confidence} confidence, ${candidate.status}`}
    >
      {/* Header row */}
      <div className="iw-cand-header">
        {/* Type icon */}
        <span className="iw-cand-type-icon" aria-label={candidate.type} title={candidate.type}>
          {typeIcon}
        </span>

        {/* Source → Target names */}
        <div className="iw-cand-names">
          <span className="iw-cand-source" title={candidate.source}>
            {candidate.source}
          </span>
          <span className="iw-cand-arrow" aria-hidden="true">
            →
          </span>
          <span className="iw-cand-target" title={targetLabel}>
            {targetLabel}
          </span>
          {showOriginal && (
            <span className="iw-cand-override" title={`Original: ${candidate.target}`}>
              ({candidate.target})
            </span>
          )}
        </div>

        {/* Confidence badge */}
        <span
          className={`iw-confidence-badge iw-confidence-badge--${candidate.confidence}`}
          title={`Confidence: ${candidate.confidence}`}
        >
          {candidate.confidence}
        </span>

        {/* Action buttons */}
        <div className="iw-cand-actions" role="group" aria-label="Candidate actions">
          <button
            className="iw-btn iw-btn-sm iw-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            title={isAccepted ? 'Accepted — click to set pending' : 'Accept'}
            aria-label={isAccepted ? 'Accepted — click to set pending' : 'Accept candidate'}
            aria-pressed={isAccepted}
            style={
              isAccepted
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
              onReject();
            }}
            title={isRejected ? 'Rejected — click to set pending' : 'Reject'}
            aria-label={isRejected ? 'Rejected — click to set pending' : 'Reject candidate'}
            aria-pressed={isRejected}
            style={
              isRejected
                ? { background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }
                : undefined
            }
          >
            ✗
          </button>
          <button
            className="iw-btn iw-btn-sm iw-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEdit();
            }}
            title={isEditing ? 'Close editor' : 'Edit override name'}
            aria-label={isEditing ? 'Close name editor' : 'Edit override name'}
            aria-expanded={isEditing}
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Reasoning text */}
      <p className="iw-cand-reasoning">{candidate.reasoning}</p>

      {/* Inline edit form (shown when isEditing) */}
      {isEditing && (
        <div className="iw-cand-edit-form" role="form" aria-label="Override name editor">
          <div className="iw-cand-edit-row">
            <input
              className="iw-cand-edit-input"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleEditKeyDown}
              placeholder={`Override name for "${candidate.target}"…`}
              aria-label="Override name"
              autoFocus
            />
            <button className="iw-btn iw-btn-primary iw-btn-sm" onClick={handleSave} type="button">
              Save
            </button>
            <button
              className="iw-btn iw-btn-secondary iw-btn-sm"
              onClick={onCancelEdit}
              type="button"
            >
              Cancel
            </button>
          </div>
          {editName.trim() !== '' && (
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                color: '#6c757d',
                paddingLeft: '0.25rem',
              }}
            >
              &quot;{candidate.target}&quot; will be displayed as &quot;{editName.trim()}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
