'use client';

import { useState, useEffect } from 'react';
import type { Relationship } from '@arch-atlas/core-model';
import { SearchableDropdown } from '@/components/shared';
import type { DropdownOption } from '@/components/shared';

interface RelationshipEditorProps {
  relationship: Relationship;
  sourceElementName?: string;
  targetElementName?: string;
  elementOptions: DropdownOption[]; // All selectable elements across the whole model
  onSave: (relationship: Relationship) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function RelationshipEditor({
  relationship,
  sourceElementName: _sourceElementName,
  targetElementName: _targetElementName,
  elementOptions,
  onSave,
  onDelete,
  onCancel,
}: RelationshipEditorProps) {
  const [sourceId, setSourceId] = useState(relationship.sourceId);
  const [targetId, setTargetId] = useState(relationship.targetId);
  const [action, setAction] = useState(relationship.action ?? '');
  const [integrationMode, setIntegrationMode] = useState(relationship.integrationMode ?? '');
  const [description, setDescription] = useState(relationship.description ?? '');

  useEffect(() => {
    setSourceId(relationship.sourceId);
    setTargetId(relationship.targetId);
    setAction(relationship.action ?? '');
    setIntegrationMode(relationship.integrationMode ?? '');
    setDescription(relationship.description ?? '');
  }, [relationship]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) return;

    const updatedRelationship: Relationship = {
      ...relationship,
      sourceId,
      targetId,
      action: action || undefined,
      integrationMode: integrationMode || undefined,
      description: description || undefined,
    };
    onSave(updatedRelationship);
  };

  return (
    <form onSubmit={handleSubmit} className="element-editor">
      <div className="editor-header">
        <h3>Edit Connection</h3>
      </div>

      <SearchableDropdown
        id="rel-source"
        label="Source"
        options={elementOptions}
        value={sourceId}
        onChange={setSourceId}
        placeholder="Select source element"
      />

      <SearchableDropdown
        id="rel-target"
        label="Target"
        options={elementOptions}
        value={targetId}
        onChange={setTargetId}
        placeholder="Select target element"
      />

      <div>
        <label htmlFor="action">Action</label>
        <input
          id="action"
          type="text"
          value={action}
          onChange={e => setAction(e.target.value)}
          placeholder="What the arrow does (e.g., Fetches data, Sends events)"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="integrationMode">Integration Mode</label>
        <input
          id="integrationMode"
          type="text"
          value={integrationMode}
          onChange={e => setIntegrationMode(e.target.value)}
          placeholder="e.g., REST API, SQL, Message Queue, gRPC"
        />
      </div>

      <div>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Additional details about this connection"
          rows={3}
        />
      </div>

      <div className="actions">
        <button type="submit" disabled={!sourceId || !targetId}>Save</button>
        <button type="button" onClick={onDelete} className="delete-button">Delete</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
