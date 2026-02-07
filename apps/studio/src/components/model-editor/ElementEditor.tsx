'use client';

import { useState, useEffect } from 'react';
import type { Element, ElementKind } from '@arch-atlas/core-model';

interface ElementEditorProps {
  element: Element | null;
  onSave: (element: Element) => void;
  onCancel: () => void;
}

export function ElementEditor({ element, onSave, onCancel }: ElementEditorProps) {
  const [name, setName] = useState(element?.name ?? '');
  const [description, setDescription] = useState(element?.description ?? '');

  useEffect(() => {
    setName(element?.name ?? '');
    setDescription(element?.description ?? '');
  }, [element]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newElement: Element = {
      id: element?.id ?? `elem-${Date.now()}`,
      name,
      kind: element?.kind ?? 'system',
      description,
    };
    if (element?.parentId) {
      newElement.parentId = element.parentId;
    }
    if (element?.codeRef) {
      newElement.codeRef = element.codeRef;
    }
    onSave(newElement);
  };

  return (
    <form onSubmit={handleSubmit} className="element-editor">
      <div>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

