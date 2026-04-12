import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PropertiesPanel } from '../../../src/components/properties-panel/PropertiesPanel';
import type { Element } from '@arch-atlas/core-model';

const makeElement = (overrides: Partial<Element> = {}): Element => ({
  id: 'elem-1',
  kind: 'container',
  name: 'My Container',
  ...overrides,
});

describe('PropertiesPanel', () => {
  it('renders nothing when element is null', () => {
    const { container } = render(<PropertiesPanel element={null} onFormatChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when element is an external system', () => {
    const { container } = render(
      <PropertiesPanel
        element={makeElement({ kind: 'system', isExternal: true })}
        onFormatChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a color picker row for each formatting field', () => {
    render(<PropertiesPanel element={makeElement()} onFormatChange={vi.fn()} />);
    expect(screen.getByText(/background/i)).toBeDefined();
    expect(screen.getByText(/border/i)).toBeDefined();
    expect(screen.getByText(/font/i)).toBeDefined();
    // One color button per field
    const colorBtns = document.querySelectorAll('[data-field]');
    expect(colorBtns.length).toBe(3);
  });

  it('renders a native color input for each field', () => {
    render(<PropertiesPanel element={makeElement()} onFormatChange={vi.fn()} />);
    const inputs = document.querySelectorAll('input[type="color"]');
    expect(inputs.length).toBe(3);
  });

  it('calls onFormatChange with backgroundColor when color input changes', () => {
    const onFormatChange = vi.fn();
    render(<PropertiesPanel element={makeElement()} onFormatChange={onFormatChange} />);
    const inputs = document.querySelectorAll('input[type="color"]');
    // First input is backgroundColor
    fireEvent.change(inputs[0]!, { target: { value: '#ff0000' } });
    expect(onFormatChange).toHaveBeenCalledWith(
      'elem-1',
      expect.objectContaining({ backgroundColor: '#ff0000' })
    );
  });

  it('calls onFormatChange with borderColor when border color input changes', () => {
    const onFormatChange = vi.fn();
    render(<PropertiesPanel element={makeElement()} onFormatChange={onFormatChange} />);
    const inputs = document.querySelectorAll('input[type="color"]');
    fireEvent.change(inputs[1]!, { target: { value: '#00ff00' } });
    expect(onFormatChange).toHaveBeenCalledWith(
      'elem-1',
      expect.objectContaining({ borderColor: '#00ff00' })
    );
  });

  it('renders a Reset to Default button', () => {
    render(<PropertiesPanel element={makeElement()} onFormatChange={vi.fn()} />);
    expect(screen.getByText(/reset/i)).toBeDefined();
  });

  it('calls onFormatChange with undefined when Reset is clicked', () => {
    const onFormatChange = vi.fn();
    render(
      <PropertiesPanel
        element={makeElement({ formatting: { backgroundColor: '#ff0000' } })}
        onFormatChange={onFormatChange}
      />
    );
    fireEvent.click(screen.getByText(/reset/i));
    expect(onFormatChange).toHaveBeenCalledWith('elem-1', undefined);
  });
});
