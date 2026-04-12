import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RelationshipEditor } from '../../../src/components/model-editor/RelationshipEditor';
import type { Relationship } from '@arch-atlas/core-model';
import type { DropdownOption } from '../../../src/components/shared';

// SearchableDropdown renders a button + panel; stub it to a simple select for test ease
vi.mock('../../../src/components/shared', () => ({
  SearchableDropdown: ({
    label,
    value,
    onChange,
    options,
    id,
  }: {
    label?: string;
    value: string;
    onChange: (v: string) => void;
    options: DropdownOption[];
    id?: string;
  }) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        <option value="">-- select --</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

const makeRel = (overrides: Partial<Relationship> = {}): Relationship => ({
  id: 'r1',
  sourceId: 'sys-a',
  targetId: 'sys-b',
  kind: 'sync',
  ...overrides,
});

const OPTIONS: DropdownOption[] = [
  { value: 'sys-a', label: 'System A' },
  { value: 'sys-b', label: 'System B' },
  { value: 'sys-c', label: 'System C' },
];

const defaultProps = {
  elementOptions: OPTIONS,
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe('RelationshipEditor', () => {
  it('renders source and target dropdowns pre-populated', () => {
    render(<RelationshipEditor relationship={makeRel()} {...defaultProps} />);
    const source = screen.getByTestId('rel-source') as HTMLSelectElement;
    const target = screen.getByTestId('rel-target') as HTMLSelectElement;
    expect(source.value).toBe('sys-a');
    expect(target.value).toBe('sys-b');
  });

  it('renders action and integrationMode fields', () => {
    render(
      <RelationshipEditor
        relationship={makeRel({ action: 'Fetches data', integrationMode: 'REST API' })}
        {...defaultProps}
      />
    );
    expect((screen.getByLabelText(/action/i) as HTMLInputElement).value).toBe('Fetches data');
    expect((screen.getByLabelText(/integration mode/i) as HTMLInputElement).value).toBe('REST API');
  });

  it('calls onSave with updated relationship on submit', () => {
    const onSave = vi.fn();
    render(<RelationshipEditor relationship={makeRel()} {...defaultProps} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/action/i), { target: { value: 'Sends events' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Sends events', sourceId: 'sys-a', targetId: 'sys-b' })
    );
  });

  it('does not call onSave when source or target is empty', () => {
    const onSave = vi.fn();
    render(
      <RelationshipEditor
        relationship={makeRel({ sourceId: '', targetId: '' })}
        {...defaultProps}
        onSave={onSave}
      />
    );
    fireEvent.submit(document.querySelector('form')!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onDelete when Delete button clicked', () => {
    const onDelete = vi.fn();
    render(<RelationshipEditor relationship={makeRel()} {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText(/delete/i));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<RelationshipEditor relationship={makeRel()} {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('omits empty optional fields from saved relationship', () => {
    const onSave = vi.fn();
    render(
      <RelationshipEditor
        relationship={makeRel({ action: '', integrationMode: '' })}
        {...defaultProps}
        onSave={onSave}
      />
    );
    fireEvent.submit(document.querySelector('form')!);
    const saved = onSave.mock.calls[0][0] as Relationship;
    expect(saved.action).toBeUndefined();
    expect(saved.integrationMode).toBeUndefined();
  });
});
