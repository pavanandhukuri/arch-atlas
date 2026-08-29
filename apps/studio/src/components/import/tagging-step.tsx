'use client';

import { useMemo, useState } from 'react';
import type { ArchitectureModel } from '@arch-atlas/core-model';
import type { WizardState, WizardAction, ElementConfig } from '@/lib/import/types';
import { ElementCard } from '@/components/import/element-card';
import { DiagramPreview } from '@/components/import/diagram-preview';
import { buildModel } from '@/lib/import/build-model';

interface TaggingStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  baseDiagram?: ArchitectureModel | null;
}

type FilterValue = WizardState['elementFilter'];

const FILTER_LABELS: Record<FilterValue, string> = {
  all: 'All',
  pending: 'Pending',
  reviewed: 'Reviewed',
};

const GROUP_LABELS: Record<ElementConfig['kind'], string> = {
  system: 'Systems',
  container: 'Containers',
  person: 'People',
};

const GROUP_ORDER: ElementConfig['kind'][] = ['container', 'system', 'person'];
const NEW_SYSTEM_OPTION = '__new__';

export function TaggingStep({ state, dispatch, baseDiagram }: TaggingStepProps) {
  // Element auto-classification runs at the wizard level (import-wizard.tsx) as soon
  // as candidates + systems are available, so earlier steps' previews see containers too.

  // Bulk-selection is ephemeral UI state, scoped to this step only.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSystemId, setBulkSystemId] = useState('');
  const [bulkNewSystemName, setBulkNewSystemName] = useState('');

  const counts = useMemo(() => {
    const result = { pending: 0, reviewed: 0 };
    for (const el of state.elements) {
      if (el.reviewed === true) result.reviewed++;
      else result.pending++;
    }
    return result;
  }, [state.elements]);

  const visibleElements = useMemo(() => {
    return state.elements.filter((el) => {
      if (state.elementFilter === 'all') return true;
      if (state.elementFilter === 'reviewed') return el.reviewed === true;
      return el.reviewed !== true;
    });
  }, [state.elements, state.elementFilter]);

  const groups = useMemo(() => {
    const groupMap = new Map<ElementConfig['kind'], ElementConfig[]>();
    for (const el of visibleElements) {
      const existing = groupMap.get(el.kind);
      if (existing) {
        existing.push(el);
      } else {
        groupMap.set(el.kind, [el]);
      }
    }
    return groupMap;
  }, [visibleElements]);

  // Build partial model for preview — reflects classification as it happens,
  // not just accepted candidates (systems/containers exist from Tag & Classify
  // onward; relationships fill in once candidates are accepted downstream).
  const previewModel = useMemo(() => buildModel(state), [state]);

  function handleUpdateElement(config: ElementConfig): void {
    dispatch({ type: 'UPDATE_ELEMENT', config });
  }

  function handleAccept(id: string, reviewed: boolean): void {
    dispatch({ type: 'SET_ELEMENT_REVIEWED', id, reviewed: !reviewed });
  }

  function handleToggleEdit(id: string): void {
    dispatch({ type: 'SELECT_ELEMENT', id: state.selectedElementId === id ? null : id });
  }

  function handleAcceptAll(): void {
    dispatch({ type: 'ACCEPT_ALL_ELEMENTS' });
  }

  function handleFilterChange(filter: FilterValue): void {
    dispatch({ type: 'SET_ELEMENT_FILTER', filter });
  }

  function handleToggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected =
    visibleElements.length > 0 && visibleElements.every((el) => selectedIds.has(el.id));

  function handleToggleSelectAllVisible(): void {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleElements.map((el) => el.id)));
  }

  function handleClearSelection(): void {
    setSelectedIds(new Set());
    setBulkSystemId('');
    setBulkNewSystemName('');
  }

  function handleBulkAssignSystem(): void {
    if (bulkSystemId === '' || bulkSystemId === NEW_SYSTEM_OPTION || selectedIds.size === 0) return;
    dispatch({ type: 'BULK_ASSIGN_SYSTEM', ids: Array.from(selectedIds), systemId: bulkSystemId });
    setSelectedIds(new Set());
    setBulkSystemId('');
  }

  function handleBulkMarkExternal(): void {
    if (selectedIds.size === 0) return;
    dispatch({ type: 'BULK_MARK_EXTERNAL', ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
  }

  /** Creates a new system and returns its id — shared by the per-element editor and the bulk bar. */
  function handleCreateSystem(name: string): string {
    const id = 'sys-' + Date.now().toString(36);
    dispatch({ type: 'CREATE_SYSTEM', id, name });
    return id;
  }

  function handleBulkCreateAndAssignSystem(): void {
    const name = bulkNewSystemName.trim();
    if (!name || selectedIds.size === 0) return;
    const id = handleCreateSystem(name);
    dispatch({ type: 'BULK_ASSIGN_SYSTEM', ids: Array.from(selectedIds), systemId: id });
    setSelectedIds(new Set());
    setBulkSystemId('');
    setBulkNewSystemName('');
  }

  const filterTabs: FilterValue[] = ['all', 'pending', 'reviewed'];

  return (
    <div className="iw-review-layout">
      {/* Left panel — element list */}
      <div className="iw-review-left">
        {/* Toolbar */}
        <div className="iw-review-toolbar">
          <div className="iw-filter-tabs" role="tablist">
            {filterTabs.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={state.elementFilter === f}
                className={`iw-filter-tab${state.elementFilter === f ? ' iw-filter-tab--active' : ''}`}
                onClick={() => handleFilterChange(f)}
              >
                {FILTER_LABELS[f]}
                {f !== 'all' && <span className="iw-filter-tab-count">{counts[f]}</span>}
                {f === 'all' && (
                  <span className="iw-filter-tab-count">{state.elements.length}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="iw-btn iw-btn--secondary iw-btn--sm"
            onClick={handleAcceptAll}
          >
            Accept All
          </button>
        </div>

        {/* Bulk action bar — appears once at least one element is selected */}
        {selectedIds.size > 0 && (
          <div className="iw-bulk-bar" role="toolbar" aria-label="Bulk actions">
            <span className="iw-bulk-count">{selectedIds.size} selected</span>
            <select
              className="iw-bulk-system-select"
              value={bulkSystemId}
              onChange={(e) => setBulkSystemId(e.target.value)}
              aria-label="Assign selected containers to a system"
            >
              <option value="">Assign to system…</option>
              {state.systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SYSTEM_OPTION}>+ New system…</option>
            </select>
            {bulkSystemId === NEW_SYSTEM_OPTION ? (
              <>
                <input
                  type="text"
                  className="iw-bulk-new-system-input"
                  autoFocus
                  placeholder="System name…"
                  value={bulkNewSystemName}
                  onChange={(e) => setBulkNewSystemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBulkCreateAndAssignSystem();
                  }}
                  aria-label="New system name"
                />
                <button
                  type="button"
                  className="iw-btn iw-btn--secondary iw-btn--sm"
                  onClick={handleBulkCreateAndAssignSystem}
                  disabled={!bulkNewSystemName.trim()}
                >
                  Create &amp; Assign
                </button>
              </>
            ) : (
              <button
                type="button"
                className="iw-btn iw-btn--secondary iw-btn--sm"
                onClick={handleBulkAssignSystem}
                disabled={bulkSystemId === ''}
              >
                Assign
              </button>
            )}
            <button
              type="button"
              className="iw-btn iw-btn--secondary iw-btn--sm"
              onClick={handleBulkMarkExternal}
            >
              Mark as External System
            </button>
            <button
              type="button"
              className="iw-btn iw-btn-ghost iw-btn--sm"
              onClick={handleClearSelection}
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Element groups */}
        <div className="iw-tagging-groups">
          {state.elements.length === 0 ? (
            <p className="iw-panel-empty">No elements detected yet.</p>
          ) : groups.size === 0 ? (
            <p className="iw-panel-empty">No elements match the current filter.</p>
          ) : (
            <>
              <label className="iw-select-all-row">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={handleToggleSelectAllVisible}
                  aria-label="Select all visible elements"
                />
                Select all visible
              </label>
              {GROUP_ORDER.filter((kind) => groups.has(kind)).map((kind) => (
                <div key={kind} className="iw-candidate-group">
                  <h3 className="iw-candidate-group-label">{GROUP_LABELS[kind]}</h3>
                  <div className="iw-tagging-list">
                    {(groups.get(kind) ?? []).map((element) => (
                      <ElementCard
                        key={element.id}
                        element={element}
                        systems={state.systems}
                        isEditing={state.selectedElementId === element.id}
                        isSelected={selectedIds.has(element.id)}
                        onAccept={() => handleAccept(element.id, element.reviewed === true)}
                        onToggleEdit={() => handleToggleEdit(element.id)}
                        onToggleSelect={() => handleToggleSelect(element.id)}
                        onChange={handleUpdateElement}
                        onCreateSystem={handleCreateSystem}
                        baseDiagram={baseDiagram}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right panel — live diagram preview */}
      <div className="iw-review-right">
        <h3 className="iw-panel-heading">Live Preview</h3>
        <DiagramPreview model={previewModel} placeholder="Classify elements to see the diagram" />
      </div>
    </div>
  );
}
