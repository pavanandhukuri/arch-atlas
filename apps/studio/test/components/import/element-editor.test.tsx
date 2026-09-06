import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { ArchitectureModel } from '@archatlas/core-model';

import { ElementEditorPanel } from '../../../src/components/import/element-editor';
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

const SYSTEMS: SystemGroup[] = [{ id: 'sys-1', name: 'Orders System', repoNames: [] }];

function baseProps() {
  return {
    systems: SYSTEMS,
    onChange: vi.fn(),
    onCreateSystem: vi.fn(() => 'new-sys-id'),
  };
}

describe('ElementEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates displayName on input', async () => {
    const props = baseProps();
    render(<ElementEditorPanel element={systemElement()} {...props} />);
    await userEvent.type(screen.getByLabelText('Display Name'), 'X');
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ displayName: 'Orders ServiceX' })
    );
  });

  describe('kind change cascades', () => {
    it('switching to container defaults containerSubtype when unset', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement()} {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Container' }));
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'container',
          containerSubtype: 'default',
          isExternal: false,
        })
      );
    });

    it('switching to container keeps an existing containerSubtype', async () => {
      const props = baseProps();
      // A person with a leftover containerSubtype from a prior kind change.
      render(
        <ElementEditorPanel
          element={systemElement({ kind: 'person', containerSubtype: 'database' })}
          {...props}
        />
      );
      await userEvent.click(screen.getByRole('radio', { name: 'Container' }));
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ containerSubtype: 'database' })
      );
    });

    it('switching to system clears containerSubtype and systemId', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement({ systemId: 'sys-1' })} {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'System' }));
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'system',
          containerSubtype: undefined,
          systemId: undefined,
        })
      );
    });

    it('switching to person clears containerSubtype/systemId and resets isExternal', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement({ systemId: 'sys-1' })} {...props} />);
      await userEvent.click(screen.getByRole('radio', { name: 'Person' }));
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'person',
          containerSubtype: undefined,
          systemId: undefined,
          isExternal: false,
        })
      );
    });
  });

  describe('container subtype', () => {
    it('is hidden for non-container elements', () => {
      render(<ElementEditorPanel element={systemElement()} {...baseProps()} />);
      expect(screen.queryByLabelText('Container Subtype')).toBeNull();
    });

    it('updates containerSubtype on change', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByLabelText('Container Subtype'), 'user-interface');
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ containerSubtype: 'user-interface' })
      );
    });
  });

  describe('isExternal (systems only)', () => {
    it('is hidden for non-system elements', () => {
      render(<ElementEditorPanel element={containerElement()} {...baseProps()} />);
      expect(screen.queryByLabelText('Is External system')).toBeNull();
    });

    it('shows a hint when a system is not external, and none when it is', () => {
      const { rerender } = render(
        <ElementEditorPanel element={systemElement({ isExternal: false })} {...baseProps()} />
      );
      expect(screen.getByText(/every system must be marked external/i)).toBeDefined();

      rerender(
        <ElementEditorPanel element={systemElement({ isExternal: true })} {...baseProps()} />
      );
      expect(screen.queryByText(/every system must be marked external/i)).toBeNull();
    });

    it('toggles isExternal on click', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement({ isExternal: false })} {...props} />);
      await userEvent.click(screen.getByLabelText('Is External system'));
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ isExternal: true }));
    });
  });

  it('maps an empty technology field to undefined', async () => {
    const props = baseProps();
    render(<ElementEditorPanel element={systemElement({ technology: 'Go' })} {...props} />);
    const input = screen.getByLabelText('Technology');
    await userEvent.clear(input);
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ technology: undefined })
    );
  });

  describe('system assignment (containers only)', () => {
    it('is hidden for non-container elements', () => {
      render(<ElementEditorPanel element={systemElement()} {...baseProps()} />);
      expect(screen.queryByRole('combobox', { name: 'System' })).toBeNull();
    });

    it('shows a hint when no system is assigned', () => {
      render(
        <ElementEditorPanel element={containerElement({ systemId: undefined })} {...baseProps()} />
      );
      expect(screen.getByText(/every container must belong to a system/i)).toBeDefined();
    });

    it('assigns the selected system id', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), 'sys-1');
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ systemId: 'sys-1' }));
    });

    it('switches to inline creation on "+ New system…" without calling onChange yet', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      expect(screen.getByLabelText('New system name')).toBeDefined();
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('creates and assigns a new system, then leaves creation mode', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      await userEvent.type(screen.getByLabelText('New system name'), 'Fresh System');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(props.onCreateSystem).toHaveBeenCalledWith('Fresh System');
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ systemId: 'new-sys-id' })
      );
      expect(screen.queryByLabelText('New system name')).toBeNull();
    });

    it('disables Create while the new system name is blank', async () => {
      render(<ElementEditorPanel element={containerElement()} {...baseProps()} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
    });

    it('cancels inline creation without calling onCreateSystem', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      await userEvent.type(screen.getByLabelText('New system name'), 'Abandoned');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(props.onCreateSystem).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('New system name')).toBeNull();
    });

    it('submits inline creation on Enter and cancels on Escape', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={containerElement()} {...props} />);
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      await userEvent.type(screen.getByLabelText('New system name'), 'Enter System{Enter}');
      expect(props.onCreateSystem).toHaveBeenCalledWith('Enter System');

      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'System' }), '__new__');
      await userEvent.type(screen.getByLabelText('New system name'), 'Escaped{Escape}');
      expect(screen.queryByLabelText('New system name')).toBeNull();
    });
  });

  it('maps an empty description field to undefined', async () => {
    const props = baseProps();
    render(<ElementEditorPanel element={systemElement({ description: 'stuff' })} {...props} />);
    await userEvent.clear(screen.getByLabelText('Description'));
    expect(props.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: undefined })
    );
  });

  describe('tags', () => {
    it('commits a tag on Enter, trimmed and de-duplicated', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement({ tags: ['existing'] })} {...props} />);
      const input = screen.getByLabelText('New tag');
      await userEvent.type(input, '  new-tag  {Enter}');
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['existing', 'new-tag'] })
      );

      props.onChange.mockClear();
      await userEvent.type(input, 'existing{Enter}');
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('commits a tag on comma', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement()} {...props} />);
      await userEvent.type(screen.getByLabelText('New tag'), 'foo,');
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['foo'] }));
    });

    it('removes the last tag on Backspace when the input is empty', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement({ tags: ['a', 'b'] })} {...props} />);
      await userEvent.type(screen.getByLabelText('New tag'), '{Backspace}');
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['a'] }));
    });

    it('does not remove a tag on Backspace when the input has text', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement({ tags: ['a'] })} {...props} />);
      await userEvent.type(screen.getByLabelText('New tag'), 'x{Backspace}');
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('removes a tag via its remove button', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement({ tags: ['a', 'b'] })} {...props} />);
      await userEvent.click(screen.getByRole('button', { name: 'Remove tag "a"' }));
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['b'] }));
    });

    it('commits a pending tag on blur', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement()} {...props} />);
      await userEvent.type(screen.getByLabelText('New tag'), 'pending');
      await userEvent.tab();
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['pending'] }));
    });

    it('focuses the tag input when the tags container is clicked', async () => {
      render(<ElementEditorPanel element={systemElement()} {...baseProps()} />);
      await userEvent.click(screen.getByRole('group', { name: 'Tags' }));
      expect(document.activeElement).toBe(screen.getByLabelText('New tag'));
    });
  });

  describe('base diagram matching', () => {
    const model: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'Base' },
      elements: [
        { id: 'base-1', kind: 'system', name: 'Existing System' },
        { id: 'base-2', kind: 'system', name: 'External System', isExternal: true },
      ],
      relationships: [],
      constraints: [],
      views: [],
    };

    it('is hidden when there is no base diagram', () => {
      render(<ElementEditorPanel element={systemElement()} {...baseProps()} baseDiagram={null} />);
      expect(screen.queryByLabelText('Match to existing element')).toBeNull();
    });

    it('lists base-diagram elements, marking external ones', () => {
      render(<ElementEditorPanel element={systemElement()} {...baseProps()} baseDiagram={model} />);
      expect(screen.getByText('External System (external)')).toBeDefined();
      expect(screen.getByText('Existing System')).toBeDefined();
    });

    it('shows neither resolution message while unresolved (baseElementId undefined)', () => {
      render(
        <ElementEditorPanel
          element={systemElement({ baseElementId: undefined })}
          {...baseProps()}
          baseDiagram={model}
        />
      );
      expect(screen.queryByText(/will merge into/i)).toBeNull();
      expect(screen.queryByText(/will be added as a new element/i)).toBeNull();
    });

    it('shows "will merge into" once a base element is chosen', async () => {
      const props = baseProps();
      render(<ElementEditorPanel element={systemElement()} {...props} baseDiagram={model} />);
      await userEvent.selectOptions(screen.getByLabelText('Match to existing element'), 'base-1');
      expect(props.onChange).toHaveBeenCalledWith(
        expect.objectContaining({ baseElementId: 'base-1' })
      );
    });

    it('shows "will merge into" using the resolved name when baseElementId is already set', () => {
      render(
        <ElementEditorPanel
          element={systemElement({ baseElementId: 'base-1' })}
          {...baseProps()}
          baseDiagram={model}
        />
      );
      // The message is split across sibling text nodes/expressions, so match on the
      // element's full textContent rather than a single-node text query.
      expect(document.querySelector('.iw-field-resolved')?.textContent).toContain(
        'Will merge into "Existing System"'
      );
    });

    it('falls back to the raw id when baseElementId matches no element in the base diagram', () => {
      render(
        <ElementEditorPanel
          element={systemElement({ baseElementId: 'stale-id' })}
          {...baseProps()}
          baseDiagram={model}
        />
      );
      expect(document.querySelector('.iw-field-resolved')?.textContent).toContain(
        'Will merge into "stale-id"'
      );
    });

    it('selecting "New element (no match)" sets baseElementId to null and shows the new-element message', async () => {
      const props = baseProps();
      render(
        <ElementEditorPanel
          element={systemElement({ baseElementId: 'base-1' })}
          {...props}
          baseDiagram={model}
        />
      );
      await userEvent.selectOptions(screen.getByLabelText('Match to existing element'), '');
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ baseElementId: null }));
    });

    it('shows the new-element message when baseElementId is explicitly null', () => {
      render(
        <ElementEditorPanel
          element={systemElement({ baseElementId: null })}
          {...baseProps()}
          baseDiagram={model}
        />
      );
      expect(screen.getByText('+ Will be added as a new element')).toBeDefined();
    });
  });
});
