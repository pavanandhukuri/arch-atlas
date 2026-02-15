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
  const [technology, setTechnology] = useState(element?.technology ?? '');
  const [componentType, setComponentType] = useState(element?.componentType ?? '');

  useEffect(() => {
    setName(element?.name ?? '');
    setDescription(element?.description ?? '');
    setTechnology(element?.technology ?? '');
    setComponentType(element?.componentType ?? '');
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
    // Add kind-specific fields
    if (element?.kind === 'container' && technology) {
      newElement.technology = technology;
    }
    if (element?.kind === 'component' && componentType) {
      newElement.componentType = componentType;
    }
    onSave(newElement);
  };

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
          onChange={e => setName(e.target.value)}
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
            onChange={e => setTechnology(e.target.value)}
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
            onChange={e => setComponentType(e.target.value)}
            placeholder="e.g., Service, Controller, Repository"
          />
        </div>
      )}

      <div>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Enter detailed description"
          rows={3}
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

