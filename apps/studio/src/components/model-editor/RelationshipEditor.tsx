'use client';

import { useState, useEffect } from 'react';
import type { Relationship } from '@arch-atlas/core-model';

interface RelationshipEditorProps {
  relationship: Relationship;
  sourceElementName?: string;
  targetElementName?: string;
  onSave: (relationship: Relationship) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function RelationshipEditor({
  relationship,
  sourceElementName,
  targetElementName,
  onSave,
  onDelete,
  onCancel
}: RelationshipEditorProps) {
  const [action, setAction] = useState(relationship?.action ?? '');
  const [integrationMode, setIntegrationMode] = useState(relationship?.integrationMode ?? '');
  const [description, setDescription] = useState(relationship?.description ?? '');

  useEffect(() => {
    setAction(relationship?.action ?? '');
    setIntegrationMode(relationship?.integrationMode ?? '');
    setDescription(relationship?.description ?? '');
  }, [relationship]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedRelationship: Relationship = {
      ...relationship,
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

      <div className="relationship-endpoints">
        <p className="relationship-flow">
          <strong>{sourceElementName || 'Unknown'}</strong>
          {' → '}
          <strong>{targetElementName || 'Unknown'}</strong>
        </p>
        <p className="relationship-type">{relationship.type}</p>
      </div>

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
        <button type="submit">Save</button>
        <button type="button" onClick={onDelete} className="delete-button">
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
