import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ElementCard } from '../../../src/components/import/element-card';
import type { ElementConfig, SystemGroup } from '../../../src/lib/import/types';

function systemElement(overrides: Partial<ElementConfig> = {}): ElementConfig {
  return {
    id: 'el-1',
    name: 'orders-service',
    displayName: 'Orders Service',
    kind: 'system',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

function containerElement(overrides: Partial<ElementConfig> = {}): ElementConfig {
  return {
    id: 'el-2',
    name: 'orders-db',
    displayName: 'Orders DB',
    kind: 'container',
    containerSubtype: 'database',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

const SYSTEMS: SystemGroup[] = [
  { id: 'sys-1', name: 'Orders System', repoNames: ['orders-service'] },
];

function baseProps() {
  return {
    systems: SYSTEMS,
    isEditing: false,
    isSelected: false,
    onAccept: vi.fn(),
    onToggleEdit: vi.fn(),
    onToggleSelect: vi.fn(),
    onChange: vi.fn(),
    onCreateSystem: vi.fn(() => 'new-sys-id'),
  };
}

describe('ElementCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the display name and kind label for a system', () => {
    render(<ElementCard element={systemElement()} {...baseProps()} />);
    expect(screen.getByText('Orders Service')).toBeDefined();
    expect(screen.getByText('System')).toBeDefined();
  });

  it('renders the display name and kind label for a container', () => {
    render(<ElementCard element={containerElement()} {...baseProps()} />);
    expect(screen.getByText('Orders DB')).toBeDefined();
    expect(screen.getByText('Container')).toBeDefined();
  });

  it('shows the container subtype badge', () => {
    render(
      <ElementCard element={containerElement({ containerSubtype: 'database' })} {...baseProps()} />
    );
    expect(screen.getByText('Database')).toBeDefined();
  });

  it('falls back to "default" subtype label when containerSubtype is unset', () => {
    render(
      <ElementCard element={containerElement({ containerSubtype: undefined })} {...baseProps()} />
    );
    expect(screen.getByText('Queue')).toBeDefined();
  });

  it('falls back to the raw containerSubtype when it has no display label', () => {
    render(
      <ElementCard
        element={containerElement({ containerSubtype: 'static-content' })}
        {...baseProps()}
      />
    );
    expect(screen.getByText('static-content')).toBeDefined();
  });

  it('shows the assigned system name for a container with a systemId', () => {
    render(<ElementCard element={containerElement({ systemId: 'sys-1' })} {...baseProps()} />);
    expect(screen.getByText('Orders System')).toBeDefined();
  });

  it('warns when a container has a systemId that matches no known system', () => {
    render(
      <ElementCard element={containerElement({ systemId: 'does-not-exist' })} {...baseProps()} />
    );
    expect(screen.getByText('No system — assign one')).toBeDefined();
  });

  it('warns when a container has no assigned system', () => {
    render(<ElementCard element={containerElement({ systemId: undefined })} {...baseProps()} />);
    expect(screen.getByText('No system — assign one')).toBeDefined();
  });

  it('shows "ext" for an external system', () => {
    render(<ElementCard element={systemElement({ isExternal: true })} {...baseProps()} />);
    expect(screen.getByText('ext')).toBeDefined();
  });

  it('warns when a system is not marked external', () => {
    render(<ElementCard element={systemElement({ isExternal: false })} {...baseProps()} />);
    expect(screen.getByText('Not marked external')).toBeDefined();
  });

  it('disables the accept button when the element is not classified', () => {
    // A container with no systemId is not classified (isElementClassified).
    render(<ElementCard element={containerElement({ systemId: undefined })} {...baseProps()} />);
    const accept = screen.getByRole('button', { name: /assign a system or mark as external/i });
    expect(accept).toHaveProperty('disabled', true);
  });

  it('enables the accept button once classified and calls onAccept when clicked', async () => {
    const props = baseProps();
    render(<ElementCard element={systemElement({ isExternal: true })} {...props} />);
    const accept = screen.getByRole('button', { name: 'Accept classification' });
    expect(accept).toHaveProperty('disabled', false);
    await userEvent.click(accept);
    expect(props.onAccept).toHaveBeenCalledOnce();
  });

  it('marks the card as reviewed only when reviewed=true AND classified', () => {
    const { rerender } = render(
      <ElementCard element={systemElement({ isExternal: true, reviewed: true })} {...baseProps()} />
    );
    expect(screen.getByRole('listitem').getAttribute('aria-label')).toContain('reviewed');

    // reviewed=true but NOT classified (isExternal: false) -> still "pending".
    rerender(
      <ElementCard
        element={systemElement({ isExternal: false, reviewed: true })}
        {...baseProps()}
      />
    );
    expect(screen.getByRole('listitem').getAttribute('aria-label')).toContain('pending');
  });

  it('reflects isSelected on the checkbox and calls onToggleSelect on click', async () => {
    const props = baseProps();
    render(<ElementCard element={systemElement()} {...props} isSelected={true} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await userEvent.click(checkbox);
    expect(props.onToggleSelect).toHaveBeenCalledOnce();
  });

  it('calls onToggleEdit when the edit button is clicked, and reflects isEditing via aria-expanded', async () => {
    const props = baseProps();
    render(<ElementCard element={systemElement()} {...props} />);
    const editButton = screen.getByRole('button', { name: 'Edit classification' });
    expect(editButton.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(editButton);
    expect(props.onToggleEdit).toHaveBeenCalledOnce();
  });

  it('renders the inline edit form only when isEditing is true', () => {
    const { rerender } = render(
      <ElementCard element={systemElement()} {...baseProps()} isEditing={false} />
    );
    expect(screen.queryByRole('form')).toBeNull();

    rerender(<ElementCard element={systemElement()} {...baseProps()} isEditing={true} />);
    expect(screen.getByRole('form', { name: 'Element classification editor' })).toBeDefined();
  });
});
