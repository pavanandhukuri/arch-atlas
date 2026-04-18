import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ElementPalette } from '../../../src/components/element-palette/ElementPalette';

vi.mock('../../../src/services/diagram-context', () => ({
  getElementKindForLevel: (level: string) => {
    const map: Record<string, string> = {
      landscape: 'system',
      system: 'container',
      container: 'component',
    };
    return map[level] ?? 'system';
  },
  getLevelIcon: () => '📐',
}));

describe('ElementPalette — container subtypes', () => {
  it('renders five container subtype buttons when level is system', () => {
    render(
      <ElementPalette
        currentLevel="system"
        onAddElement={vi.fn()}
        onAddContainerSubtype={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Database/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Storage Bucket/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Static Content/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /User Interface/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Backend Service/i })).toBeDefined();
  });

  it('does NOT render subtype buttons when level is landscape', () => {
    render(
      <ElementPalette
        currentLevel="landscape"
        onAddElement={vi.fn()}
        onAddContainerSubtype={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Database/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Storage Bucket/i })).toBeNull();
  });

  it('calls onAddContainerSubtype with correct subtype on click', () => {
    const onAddContainerSubtype = vi.fn();
    render(
      <ElementPalette
        currentLevel="system"
        onAddElement={vi.fn()}
        onAddContainerSubtype={onAddContainerSubtype}
      />
    );

    screen.getByRole('button', { name: /Database/i }).click();
    expect(onAddContainerSubtype).toHaveBeenCalledWith('database');
  });
});
