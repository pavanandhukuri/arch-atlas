'use client';

import { useState, useEffect } from 'react';
import type { Element, Relationship } from '@arch-atlas/core-model';
import { ConnectionsTable } from '@/components/shared';
import type { ConnectionRow } from '@/components/shared';

interface ElementEditorProps {
  element: Element | null;
  allElements: Element[];
  relationships: Relationship[];
  onSave: (element: Element) => void;
  onDelete: (elementId: string) => void;
  onCancel: () => void;
  onEditRelationship: (relationship: Relationship) => void;
  onAddRelationship: (sourceId: string) => void;
  onMarkExternal?: (elementId: string, isExternal: boolean) => void;
}

export function ElementEditor({
  element,
  allElements,
  relationships,
  onSave,
  onDelete,
  onCancel,
  onEditRelationship,
  onAddRelationship,
  onMarkExternal,
}: ElementEditorProps) {
  const [name, setName] = useState(element?.name ?? '');
  const [description, setDescription] = useState(element?.description ?? '');
  const [technology, setTechnology] = useState(element?.technology ?? '');
  const [componentType, setComponentType] = useState(element?.componentType ?? '');

  useEffect(() => {
    setName(element?.name ?? '');
    setDescription(element?.description ?? '');
    setTechnology(element?.technology ?? '');
    setComponentType(element?.componentType ?? '');
  }, [element]);

  const handleExternalToggle = () => {
    if (!element || element.kind !== 'system') return;
    if (onMarkExternal) {
      onMarkExternal(element.id, !element.isExternal);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newElement: Element = {
      id: element?.id ?? `elem-${Date.now()}`,
      name,
      kind: element?.kind ?? 'system',
      description,
      ...(element?.isExternal !== undefined && { isExternal: element.isExternal }),
    };
    if (element?.parentId) {
      newElement.parentId = element.parentId;
    }
    if (element?.codeRef) {
      newElement.codeRef = element.codeRef;
    }
    // Add kind-specific fields
    if (element?.kind === 'container' && technology) {
      newElement.technology = technology;
    }
    if (element?.kind === 'component' && componentType) {
      newElement.componentType = componentType;
    }
    onSave(newElement);
  };

  // Build the connections table data
  const elementMap = new Map<string, Element>(allElements.map((e) => [e.id, e]));
  const connectionRows: ConnectionRow[] = element
    ? relationships
        .filter((r) => r.sourceId === element.id || r.targetId === element.id)
        .map((rel) => {
          const isOutgoing = rel.sourceId === element.id;
          const connectedId = isOutgoing ? rel.targetId : rel.sourceId;
          return {
            relationship: rel,
            connectedElement: elementMap.get(connectedId),
            direction: isOutgoing ? 'outgoing' : 'incoming',
          };
        })
    : [];

  return (
    <form onSubmit={handleSubmit} className="element-editor">
      <div className="editor-header">
        <h3>Edit {element?.kind || 'Element'}</h3>
      </div>

      <div>
        <label htmlFor="name">Title</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          placeholder="Enter element name"
        />
      </div>

      {/* Container-specific field */}
      {element?.kind === 'container' && (
        <div>
          <label htmlFor="technology">Technology</label>
          <input
            id="technology"
            type="text"
            value={technology}
            onChange={(e) => setTechnology(e.target.value)}
            placeholder="e.g., Docker, Spring Boot, React"
          />
        </div>
      )}

      {/* Component-specific field */}
      {element?.kind === 'component' && (
        <div>
          <label htmlFor="componentType">Component Type</label>
          <input
            id="componentType"
            type="text"
            value={componentType}
            onChange={(e) => setComponentType(e.target.value)}
            placeholder="e.g., Service, Controller, Repository"
          />
        </div>
      )}

      <div>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter detailed description"
          rows={3}
        />
      </div>

      {/* External system toggle — only shown for system elements */}
      {element?.kind === 'system' && (
        <div className="external-toggle">
          <div className="external-toggle__row">
            <input
              id="external-system-toggle"
              type="checkbox"
              checked={element.isExternal ?? false}
              onChange={handleExternalToggle}
            />
            <label htmlFor="external-system-toggle">External system</label>
          </div>
          {element.isExternal && (
            <p className="external-toggle__hint">
              This system is marked as external. It cannot be drilled into.
            </p>
          )}
        </div>
      )}

      <div className="actions">
        <button type="submit">Save</button>
        <button
          type="button"
          className="delete-button"
          onClick={() => {
            if (
              element?.id &&
              confirm(
                `Delete "${element.name}"?\n\nThis will also remove all connections to this element. This cannot be undone.`
              )
            ) {
              onDelete(element.id);
            }
          }}
        >
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Connections table */}
      {element && (
        <ConnectionsTable
          rows={connectionRows}
          onRowClick={onEditRelationship}
          onAddConnection={() => onAddRelationship(element.id)}
        />
      )}
    </form>
  );
}
