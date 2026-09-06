'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import type { ArchitectureModel, ContainerSubtype } from '@archatlas/core-model';
import type { ElementConfig, SystemGroup } from '@/lib/import/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTAINER_SUBTYPES: Array<{ label: string; value: ContainerSubtype }> = [
  { label: 'Backend Service', value: 'backend-service' },
  { label: 'Database', value: 'database' },
  { label: 'Queue', value: 'default' },
  { label: 'UI', value: 'user-interface' },
  { label: 'Storage', value: 'storage-bucket' },
];

const KIND_LABELS: Record<ElementConfig['kind'], string> = {
  system: 'System',
  container: 'Container',
  person: 'Person',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const NEW_SYSTEM_OPTION = '__new__';

interface ElementEditorPanelProps {
  element: ElementConfig;
  systems: SystemGroup[];
  onChange: (updated: ElementConfig) => void;
  /** Creates a new system and returns its id, for the "+ New system…" option below. */
  onCreateSystem: (name: string) => string;
  /** When provided, shows a "Match to existing element" picker */
  baseDiagram?: ArchitectureModel | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ElementEditorPanel({
  element,
  systems,
  onChange,
  onCreateSystem,
  baseDiagram,
}: ElementEditorPanelProps) {
  // Local state for the tag text input only — all other state is controlled via props.
  const [tagInput, setTagInput] = useState<string>('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [isCreatingSystem, setIsCreatingSystem] = useState(false);
  const [newSystemName, setNewSystemName] = useState('');

  // -------------------------------------------------------------------------
  // Kind change — cascade-clear fields that don't apply to the new kind
  // -------------------------------------------------------------------------

  const handleKindChange = (kind: ElementConfig['kind']) => {
    const updates: Partial<ElementConfig> = { kind };

    if (kind === 'container') {
      // Ensure a default subtype is present when switching to container
      if (!element.containerSubtype) {
        updates.containerSubtype = 'default';
      }
    } else {
      // containerSubtype and systemId are only valid for containers
      updates.containerSubtype = undefined;
      updates.systemId = undefined;
    }

    if (kind !== 'system') {
      // isExternal is only meaningful for systems; reset it
      updates.isExternal = false;
    }

    onChange({ ...element, ...updates });
  };

  // -------------------------------------------------------------------------
  // Tag helpers
  // -------------------------------------------------------------------------

  const commitTag = () => {
    const trimmed = tagInput.trim().replace(/,+$/, '').trim();
    if (trimmed !== '' && !element.tags.includes(trimmed)) {
      onChange({ ...element, tags: [...element.tags, trimmed] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    onChange({ ...element, tags: element.tags.filter((t) => t !== tag) });
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag();
    } else if (e.key === 'Backspace' && tagInput === '' && element.tags.length > 0) {
      // Remove the last tag when backspace is pressed on an empty input
      const last = element.tags[element.tags.length - 1];
      if (last !== undefined) {
        removeTag(last);
      }
    }
  };

  // -------------------------------------------------------------------------
  // New system inline creation
  // -------------------------------------------------------------------------

  const handleSystemSelectChange = (value: string) => {
    if (value === NEW_SYSTEM_OPTION) {
      setIsCreatingSystem(true);
      return;
    }
    update('systemId', value !== '' ? value : undefined);
  };

  const handleCreateSystemSubmit = () => {
    const name = newSystemName.trim();
    if (!name) return;
    const id = onCreateSystem(name);
    update('systemId', id);
    setIsCreatingSystem(false);
    setNewSystemName('');
  };

  const handleCreateSystemCancel = () => {
    setIsCreatingSystem(false);
    setNewSystemName('');
  };

  const handleTagBlur = () => {
    commitTag();
  };

  // -------------------------------------------------------------------------
  // Simple field updater — keeps the call sites terse
  // -------------------------------------------------------------------------

  const update = <K extends keyof ElementConfig>(key: K, value: ElementConfig[K]) => {
    onChange({ ...element, [key]: value });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="iw-element-editor">
      <h3 className="iw-editor-title">{element.name}</h3>

      {/* ----------------------------------------------------------------- */}
      {/* Display Name                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="iw-field">
        <label htmlFor={`iw-display-name-${element.id}`}>Display Name</label>
        <input
          id={`iw-display-name-${element.id}`}
          type="text"
          value={element.displayName}
          onChange={(e) => update('displayName', e.target.value)}
          placeholder="e.g. Payment Service"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Kind                                                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="iw-field">
        <label>Kind</label>
        <div className="iw-radio-group">
          {(Object.keys(KIND_LABELS) as ElementConfig['kind'][]).map((k) => (
            <label key={k} className="iw-radio-label">
              <input
                type="radio"
                name={`iw-kind-${element.id}`}
                value={k}
                checked={element.kind === k}
                onChange={() => handleKindChange(k)}
              />
              {KIND_LABELS[k]}
            </label>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Container Subtype (containers only)                                 */}
      {/* ----------------------------------------------------------------- */}
      {element.kind === 'container' && (
        <div className="iw-field">
          <label htmlFor={`iw-subtype-${element.id}`}>Container Subtype</label>
          <select
            id={`iw-subtype-${element.id}`}
            value={element.containerSubtype ?? 'default'}
            onChange={(e) => update('containerSubtype', e.target.value as ContainerSubtype)}
          >
            {CONTAINER_SUBTYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Is External (systems only)                                          */}
      {/* ----------------------------------------------------------------- */}
      {element.kind === 'system' && (
        <div className="iw-field">
          <label>Visibility</label>
          <div className="iw-toggle-row">
            <input
              type="checkbox"
              id={`iw-external-${element.id}`}
              checked={element.isExternal}
              onChange={(e) => update('isExternal', e.target.checked)}
            />
            <label className="iw-toggle-label" htmlFor={`iw-external-${element.id}`}>
              Is External system
            </label>
          </div>
          {!element.isExternal && (
            <p className="iw-field-hint">
              Every System must be marked external — internal services belong in a Container
              assigned to a System instead.
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Technology                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="iw-field">
        <label htmlFor={`iw-technology-${element.id}`}>Technology</label>
        <input
          id={`iw-technology-${element.id}`}
          type="text"
          value={element.technology ?? ''}
          onChange={(e) => update('technology', e.target.value !== '' ? e.target.value : undefined)}
          placeholder="e.g. Spring Boot, React, PostgreSQL"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* System (containers only)                                            */}
      {/* ----------------------------------------------------------------- */}
      {element.kind === 'container' && (
        <div className="iw-field">
          <label htmlFor={`iw-system-${element.id}`}>System</label>
          {isCreatingSystem ? (
            <div className="iw-inline-new-system">
              <input
                type="text"
                autoFocus
                placeholder="New system name…"
                value={newSystemName}
                onChange={(e) => setNewSystemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSystemSubmit();
                  if (e.key === 'Escape') handleCreateSystemCancel();
                }}
                aria-label="New system name"
              />
              <button
                type="button"
                className="iw-btn iw-btn--secondary iw-btn--sm"
                onClick={handleCreateSystemSubmit}
                disabled={!newSystemName.trim()}
              >
                Create
              </button>
              <button
                type="button"
                className="iw-btn iw-btn-ghost iw-btn--sm"
                onClick={handleCreateSystemCancel}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <select
                id={`iw-system-${element.id}`}
                value={element.systemId ?? ''}
                onChange={(e) => handleSystemSelectChange(e.target.value)}
              >
                <option value="" disabled>
                  — Select a system —
                </option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW_SYSTEM_OPTION}>+ New system…</option>
              </select>
              {element.systemId === undefined && (
                <p className="iw-field-hint">
                  Every container must belong to a system, or be marked external instead.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Description                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="iw-field">
        <label htmlFor={`iw-description-${element.id}`}>Description</label>
        <textarea
          id={`iw-description-${element.id}`}
          value={element.description ?? ''}
          onChange={(e) =>
            update('description', e.target.value !== '' ? e.target.value : undefined)
          }
          placeholder="Briefly describe the purpose of this element…"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tags                                                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="iw-field">
        <label>Tags</label>
        {/* Clicking anywhere in the tags container focuses the hidden input */}
        <div
          className="iw-tags-input"
          onClick={() => tagInputRef.current?.focus()}
          role="group"
          aria-label="Tags"
        >
          {element.tags.map((tag) => (
            <span key={tag} className="iw-tag">
              {tag}
              <button
                type="button"
                className="iw-tag-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                aria-label={`Remove tag "${tag}"`}
                tabIndex={-1}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={tagInputRef}
            type="text"
            className="iw-tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={handleTagBlur}
            placeholder={element.tags.length === 0 ? 'Add tags… (Enter or comma to confirm)' : ''}
            aria-label="New tag"
          />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Match to existing diagram element (only shown with a base diagram)  */}
      {/* ----------------------------------------------------------------- */}
      {baseDiagram !== null && baseDiagram !== undefined && (
        <div className="iw-field iw-field--resolution">
          <label htmlFor={`iw-base-match-${element.id}`}>Match to existing element</label>
          <p className="iw-field-hint">
            If this element already exists in your base diagram, pick it here. All relationships
            will be wired to the existing element instead of creating a duplicate.
          </p>
          <select
            id={`iw-base-match-${element.id}`}
            value={element.baseElementId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              update('baseElementId', val === '' ? null : val);
            }}
          >
            <option value="">— New element (no match)</option>
            {baseDiagram.elements.map((el) => (
              <option key={el.id} value={el.id}>
                {el.name}
                {el.isExternal === true ? ' (external)' : ''}
              </option>
            ))}
          </select>
          {element.baseElementId !== undefined && element.baseElementId !== null && (
            <p className="iw-field-resolved">
              ✓ Will merge into &quot;
              {baseDiagram.elements.find((e) => e.id === element.baseElementId)?.name ??
                element.baseElementId}
              &quot;
            </p>
          )}
          {element.baseElementId === null && (
            <p className="iw-field-new">+ Will be added as a new element</p>
          )}
        </div>
      )}
    </div>
  );
}
