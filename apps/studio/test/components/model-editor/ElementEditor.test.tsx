import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ElementEditor } from '../../../src/components/model-editor/ElementEditor';
import type { Element, Relationship } from '@arch-atlas/core-model';

// ConnectionsTable is a non-trivial child — stub it out
vi.mock('../../../src/components/shared', () => ({
  ConnectionsTable: () => null,
}));

const makeSystem = (overrides: Partial<Element> = {}): Element => ({
  id: 'sys-1',
  kind: 'system',
  name: 'My System',
  description: '',
  ...overrides,
});

const defaultProps = {
  allElements: [] as Element[],
  relationships: [] as Relationship[],
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onCancel: vi.fn(),
  onEditRelationship: vi.fn(),
  onAddRelationship: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ElementEditor — external system toggle', () => {
  it('renders the external toggle for system elements', () => {
    render(<ElementEditor element={makeSystem()} {...defaultProps} />);
    expect(screen.getByRole('checkbox')).toBeDefined();
    expect(screen.getByText(/external system/i)).toBeDefined();
  });

  it('does not render the external toggle for non-system elements', () => {
    const container: Element = { id: 'c1', kind: 'container', name: 'C', description: '' };
    render(<ElementEditor element={container} {...defaultProps} />);
    expect(screen.queryByText(/external system/i)).toBeNull();
  });

  it('checkbox is unchecked when isExternal is false', () => {
    render(<ElementEditor element={makeSystem({ isExternal: false })} {...defaultProps} />);
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('checkbox is checked when isExternal is true', () => {
    render(<ElementEditor element={makeSystem({ isExternal: true })} {...defaultProps} />);
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('clicking checkbox (unchecked → external) calls onMarkExternal with isExternal=true, NOT onSave', () => {
    const onMarkExternal = vi.fn();
    const onSave = vi.fn();
    render(
      <ElementEditor
        element={makeSystem()}
        {...defaultProps}
        onSave={onSave}
        onMarkExternal={onMarkExternal}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onMarkExternal).toHaveBeenCalledWith('sys-1', true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clicking the label also triggers onMarkExternal via htmlFor association', () => {
    const onMarkExternal = vi.fn();
    render(
      <ElementEditor element={makeSystem()} {...defaultProps} onMarkExternal={onMarkExternal} />
    );
    fireEvent.click(screen.getByText(/external system/i));
    expect(onMarkExternal).toHaveBeenCalledWith('sys-1', true);
  });

  it('clicking checkbox (checked → internal) calls onMarkExternal with isExternal=false, NOT onSave', () => {
    const onSave = vi.fn();
    const onMarkExternal = vi.fn();
    render(
      <ElementEditor
        element={makeSystem({ isExternal: true })}
        {...defaultProps}
        onSave={onSave}
        onMarkExternal={onMarkExternal}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onMarkExternal).toHaveBeenCalledWith('sys-1', false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('checkbox and label are in the same row (htmlFor/id wired correctly)', () => {
    render(<ElementEditor element={makeSystem()} {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    const label = screen.getByText(/external system/i).closest('label');
    expect(checkbox.id).toBe('external-system-toggle');
    expect(label?.htmlFor).toBe('external-system-toggle');
  });

  it('does nothing when onMarkExternal is not provided and marking external', () => {
    const onSave = vi.fn();
    render(
      <ElementEditor
        element={makeSystem()}
        {...defaultProps}
        onSave={onSave}
        // onMarkExternal intentionally omitted
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
