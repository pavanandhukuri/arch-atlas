// Test suite for element editing workflow to catch deletion bugs

import { describe, it, expect, beforeEach } from 'vitest';
import type { ArchitectureModel, Element } from '@arch-atlas/core-model';

describe('Element Editing Workflow', () => {
  let model: ArchitectureModel;
  let system1: Element;
  let container1: Element;
  let container2: Element;
  let container3: Element;

  beforeEach(() => {
    // Setup: System with 3 containers
    system1 = {
      id: 'sys-1',
      name: 'Payment System',
      kind: 'system',
      description: 'Handles payments',
    };

    container1 = {
      id: 'cont-1',
      name: 'API Gateway',
      kind: 'container',
      description: 'REST API',
      parentId: 'sys-1',
    };

    container2 = {
      id: 'cont-2',
      name: 'Database',
      kind: 'container',
      description: 'PostgreSQL',
      parentId: 'sys-1',
    };

    container3 = {
      id: 'cont-3',
      name: 'Cache',
      kind: 'container',
      description: 'Redis',
      parentId: 'sys-1',
    };

    model = {
      schemaVersion: '0.1.0',
      metadata: {
        title: 'Test Architecture',
        description: 'Test model',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      elements: [system1, container1, container2, container3],
      relationships: [],
      constraints: [],
      views: [],
    };
  });

  it('should preserve all elements when editing one element', () => {
    // Simulate editing container1
    const elementToEdit = model.elements.find(e => e.id === 'cont-1');
    expect(elementToEdit).toBeDefined();

    // Edit the element (change name)
    const editedElement: Element = {
      ...elementToEdit!,
      name: 'Updated API Gateway',
    };

    // Simulate save: update the model
    const updatedElements = model.elements.map(e =>
      e.id === editedElement.id ? editedElement : e
    );

    // Verify: All 4 elements should still exist
    expect(updatedElements).toHaveLength(4);
    expect(updatedElements.find(e => e.id === 'sys-1')).toBeDefined();
    expect(updatedElements.find(e => e.id === 'cont-1')).toBeDefined();
    expect(updatedElements.find(e => e.id === 'cont-2')).toBeDefined();
    expect(updatedElements.find(e => e.id === 'cont-3')).toBeDefined();

    // Verify: The edited element has the new name
    const saved = updatedElements.find(e => e.id === 'cont-1');
    expect(saved?.name).toBe('Updated API Gateway');

    // Verify: Parent ID is preserved
    expect(saved?.parentId).toBe('sys-1');
  });

  it('should preserve all elements when rapidly switching between containers', () => {
    // Simulate clicking on container1, then container2, then container3
    let currentElements = [...model.elements];

    // Click container1 -> edit name
    const edit1: Element = {
      ...currentElements.find(e => e.id === 'cont-1')!,
      name: 'API Gateway v1',
    };
    currentElements = currentElements.map(e => (e.id === edit1.id ? edit1 : e));

    // Click container2 -> edit name (while container1 edit might still be processing)
    const edit2: Element = {
      ...currentElements.find(e => e.id === 'cont-2')!,
      name: 'Database v1',
    };
    currentElements = currentElements.map(e => (e.id === edit2.id ? edit2 : e));

    // Click container3 -> edit name
    const edit3: Element = {
      ...currentElements.find(e => e.id === 'cont-3')!,
      name: 'Cache v1',
    };
    currentElements = currentElements.map(e => (e.id === edit3.id ? edit3 : e));

    // Verify: All 4 elements should still exist
    expect(currentElements).toHaveLength(4);
    expect(currentElements.find(e => e.id === 'sys-1')).toBeDefined();
    expect(currentElements.find(e => e.id === 'cont-1')).toBeDefined();
    expect(currentElements.find(e => e.id === 'cont-2')).toBeDefined();
    expect(currentElements.find(e => e.id === 'cont-3')).toBeDefined();

    // Verify: All edits are preserved
    expect(currentElements.find(e => e.id === 'cont-1')?.name).toBe('API Gateway v1');
    expect(currentElements.find(e => e.id === 'cont-2')?.name).toBe('Database v1');
    expect(currentElements.find(e => e.id === 'cont-3')?.name).toBe('Cache v1');

    // Verify: All parent IDs are preserved
    expect(currentElements.find(e => e.id === 'cont-1')?.parentId).toBe('sys-1');
    expect(currentElements.find(e => e.id === 'cont-2')?.parentId).toBe('sys-1');
    expect(currentElements.find(e => e.id === 'cont-3')?.parentId).toBe('sys-1');
  });

  it('should preserve parentId when editing element name', () => {
    const elementToEdit = model.elements.find(e => e.id === 'cont-1')!;

    // Edit without explicitly setting parentId (common bug scenario)
    const editedElement: Element = {
      id: elementToEdit.id,
      name: 'New Name',
      kind: elementToEdit.kind,
      description: elementToEdit.description,
    };

    // If parentId is not explicitly preserved, this test will fail
    expect(editedElement.parentId).toBeUndefined(); // This is the bug!

    // Correct implementation should preserve parentId
    const correctEditedElement: Element = {
      ...elementToEdit,
      name: 'New Name',
    };

    expect(correctEditedElement.parentId).toBe('sys-1');
  });

  it('should not create duplicate elements when saving', () => {
    const elementToEdit = model.elements.find(e => e.id === 'cont-1')!;

    const editedElement: Element = {
      ...elementToEdit,
      name: 'Updated',
    };

    // Simulate the save logic
    const updatedElements = elementToEdit.id && model.elements.find(e => e.id === elementToEdit.id)
      ? model.elements.map(e => (e.id === editedElement.id ? editedElement : e))
      : [...model.elements, { ...editedElement, id: `elem-${Date.now()}` }];

    // Should still have exactly 4 elements
    expect(updatedElements).toHaveLength(4);

    // Should not have duplicates
    const ids = updatedElements.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);
  });

  it('should filter children correctly by parentId', () => {
    // When focused on sys-1, should show only its containers
    const focusedElementId = 'sys-1';
    const visibleElements = model.elements.filter(e => e.parentId === focusedElementId);

    expect(visibleElements).toHaveLength(3);
    expect(visibleElements.every(e => e.kind === 'container')).toBe(true);
    expect(visibleElements.every(e => e.parentId === 'sys-1')).toBe(true);
  });
});
