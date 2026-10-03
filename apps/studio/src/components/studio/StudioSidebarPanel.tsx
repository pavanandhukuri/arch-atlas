'use client';

import type { Element, ElementFormatting, Relationship } from '@archatlas/core-model';
import { ElementEditor, RelationshipEditor } from '../model-editor';
import { PropertiesPanel } from '../properties-panel/PropertiesPanel';
import type { DropdownOption } from '../shared/SearchableDropdown';

export interface StudioSidebarPanelProps {
  editingElement: Element | null;
  editorRelationship: Relationship | null;
  allElements: Element[];
  allRelationships: Relationship[];
  elementOptions: DropdownOption[];
  sourceElementName: string | undefined;
  targetElementName: string | undefined;
  onClose: () => void;
  onSaveElement: (element: Element) => void;
  onDeleteElement: (elementId: string) => void;
  onEditRelationship: (relationship: Relationship) => void;
  onAddRelationship: (sourceElementId: string) => void;
  onMarkExternal: (elementId: string, isExternal: boolean) => void;
  onFormatChange: (elementId: string, formatting: ElementFormatting | undefined) => void;
  onSaveRelationship: (relationship: Relationship) => void;
  onDeleteRelationship: () => void;
  onCancelRelationshipEdit: () => void;
}

/** The right-hand sidebar: either the element editor (+ properties panel) or the relationship editor. */
export function StudioSidebarPanel({
  editingElement,
  editorRelationship,
  allElements,
  allRelationships,
  elementOptions,
  sourceElementName,
  targetElementName,
  onClose,
  onSaveElement,
  onDeleteElement,
  onEditRelationship,
  onAddRelationship,
  onMarkExternal,
  onFormatChange,
  onSaveRelationship,
  onDeleteRelationship,
  onCancelRelationshipEdit,
}: StudioSidebarPanelProps) {
  if (!editingElement && !editorRelationship) return null;

  return (
    <aside className="studio-sidebar">
      <button className="sidebar-close-btn" onClick={onClose} title="Close panel">
        ✕
      </button>
      {editingElement && (
        <>
          <ElementEditor
            element={editingElement}
            allElements={allElements}
            relationships={allRelationships}
            onSave={onSaveElement}
            onDelete={onDeleteElement}
            onCancel={onClose}
            onEditRelationship={onEditRelationship}
            onAddRelationship={onAddRelationship}
            onMarkExternal={onMarkExternal}
          />
          <PropertiesPanel element={editingElement} onFormatChange={onFormatChange} />
        </>
      )}
      {!editingElement && editorRelationship && (
        <RelationshipEditor
          relationship={editorRelationship}
          sourceElementName={sourceElementName}
          targetElementName={targetElementName}
          elementOptions={elementOptions}
          onSave={onSaveRelationship}
          onDelete={onDeleteRelationship}
          onCancel={onCancelRelationshipEdit}
        />
      )}
    </aside>
  );
}
