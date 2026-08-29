import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ElementEditorPanel } from '../../../src/components/import/element-editor';
import type { ElementConfig, SystemGroup } from '../../../src/lib/import/types';
import type { ArchitectureModel } from '@arch-atlas/core-model';

function makeElement(overrides: Partial<ElementConfig> = {}): ElementConfig {
  return {
    id: 'e1',
    name: 'user-service',
    displayName: 'user-service',
    kind: 'container',
    containerSubtype: 'backend-service',
    isExternal: false,
    tags: [],
    ...overrides,
  };
}

const systems: SystemGroup[] = [{ id: 's1', name: 'Core', repoNames: [] }];

describe('ElementEditorPanel', () => {
  it('renders the element canonical name as the title', () => {
    render(<ElementEditorPanel element={makeElement()} systems={systems} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'user-service' })).toBeDefined();
  });

  it('calls onChange with an updated displayName as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ElementEditorPanel element={makeElement()} systems={systems} onChange={onChange} />);

    await user.type(screen.getByLabelText('Display Name'), 'X');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'user-serviceX' })
    );
  });

  it('shows Container Subtype and System fields only for container elements', () => {
    render(
      <ElementEditorPanel
        element={makeElement({ kind: 'container' })}
        systems={systems}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Container Subtype')).toBeDefined();
    expect(screen.getByLabelText('System', { selector: 'select' })).toBeDefined();
    expect(screen.queryByLabelText('Is External system')).toBeNull();
  });

  it('shows the external toggle only for system elements', () => {
    render(
      <ElementEditorPanel
        element={makeElement({ kind: 'system', containerSubtype: undefined })}
        systems={systems}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Is External system')).toBeDefined();
    expect(screen.queryByLabelText('Container Subtype')).toBeNull();
  });

  it('clears containerSubtype/systemId and resets isExternal when switching kind away from container', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ElementEditorPanel
        element={makeElement({ kind: 'container', systemId: 's1' })}
        systems={systems}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('radio', { name: 'Person' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'person',
        containerSubtype: undefined,
        systemId: undefined,
        isExternal: false,
      })
    );
  });

  it('defaults containerSubtype to "default" when switching to container without one set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ElementEditorPanel
        element={makeElement({ kind: 'system', containerSubtype: undefined, isExternal: false })}
        systems={systems}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('radio', { name: 'Container' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ containerSubtype: 'default' }));
  });

  it('adds a tag on Enter and clears the input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ElementEditorPanel element={makeElement()} systems={systems} onChange={onChange} />);

    const input = screen.getByLabelText('New tag');
    await user.type(input, 'backend{Enter}');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['backend'] }));
  });

  it('does not add a duplicate tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ElementEditorPanel
        element={makeElement({ tags: ['backend'] })}
        systems={systems}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText('New tag');
    await user.type(input, 'backend{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace when the input is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ElementEditorPanel
        element={makeElement({ tags: ['backend', 'core'] })}
        systems={systems}
        onChange={onChange}
      />
    );

    await user.type(screen.getByLabelText('New tag'), '{Backspace}');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['backend'] }));
  });

  it('removes a tag when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ElementEditorPanel
        element={makeElement({ tags: ['backend'] })}
        systems={systems}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove tag "backend"' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });

  it('does not show the base-diagram matcher when no baseDiagram is provided', () => {
    render(<ElementEditorPanel element={makeElement()} systems={systems} onChange={vi.fn()} />);
    expect(screen.queryByText('Match to existing element')).toBeNull();
  });

  it('shows the base-diagram matcher and updates baseElementId when one is provided', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const baseDiagram: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'Base' },
      elements: [{ id: 'existing', kind: 'container', name: 'Existing Service' }],
      relationships: [],
      constraints: [],
      views: [],
    };

    render(
      <ElementEditorPanel
        element={makeElement()}
        systems={systems}
        onChange={onChange}
        baseDiagram={baseDiagram}
      />
    );

    expect(screen.getByText('Match to existing element')).toBeDefined();
    await user.selectOptions(screen.getByLabelText('Match to existing element'), 'existing');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ baseElementId: 'existing' }));
  });

  it('shows the "will merge into" note when baseElementId is set to an existing id', () => {
    const baseDiagram: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'Base' },
      elements: [{ id: 'existing', kind: 'container', name: 'Existing Service' }],
      relationships: [],
      constraints: [],
      views: [],
    };

    render(
      <ElementEditorPanel
        element={makeElement({ baseElementId: 'existing' })}
        systems={systems}
        onChange={vi.fn()}
        baseDiagram={baseDiagram}
      />
    );

    expect(screen.getByText(/Will merge into/)).toBeDefined();
  });

  it('shows the "will be added as new" note when baseElementId is explicitly null', () => {
    const baseDiagram: ArchitectureModel = {
      schemaVersion: '1.0.0',
      metadata: { title: 'Base' },
      elements: [],
      relationships: [],
      constraints: [],
      views: [],
    };

    render(
      <ElementEditorPanel
        element={makeElement({ baseElementId: null })}
        systems={systems}
        onChange={vi.fn()}
        baseDiagram={baseDiagram}
      />
    );

    expect(screen.getByText('+ Will be added as a new element')).toBeDefined();
  });
});
