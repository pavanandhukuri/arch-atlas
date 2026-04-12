import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SearchableDropdown } from '../../../src/components/shared/SearchableDropdown';
import type { DropdownOption } from '../../../src/components/shared/SearchableDropdown';

const OPTIONS: DropdownOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', sublabel: 'System A' },
  { value: 'c', label: 'Gamma' },
];

describe('SearchableDropdown', () => {
  it('shows placeholder when no value selected', () => {
    render(
      <SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} placeholder="Pick one" />
    );
    expect(screen.getByText('Pick one')).toBeDefined();
  });

  it('shows selected option label when value is set', () => {
    render(<SearchableDropdown options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByText('Beta')).toBeDefined();
  });

  it('shows sublabel for selected option', () => {
    render(<SearchableDropdown options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByText('System A')).toBeDefined();
  });

  it('opens the panel on trigger click', () => {
    render(<SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    // Panel should now show all options
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.getByText('Gamma')).toBeDefined();
  });

  it('filters options as the user types', () => {
    render(<SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText(/type to filter/i);
    fireEvent.change(searchInput, { target: { value: 'alp' } });
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.queryByText('Beta')).toBeNull();
    expect(screen.queryByText('Gamma')).toBeNull();
  });

  it('filters by sublabel too', () => {
    render(<SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText(/type to filter/i);
    fireEvent.change(searchInput, { target: { value: 'System A' } });
    expect(screen.getByText('Beta')).toBeDefined();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('shows "No results" when filter matches nothing', () => {
    render(<SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText(/type to filter/i), { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeDefined();
  });

  it('calls onChange with option value on selection and closes panel', () => {
    const onChange = vi.fn();
    render(<SearchableDropdown options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Gamma'));
    expect(onChange).toHaveBeenCalledWith('c');
    // Panel should close — search input gone
    expect(screen.queryByPlaceholderText(/type to filter/i)).toBeNull();
  });

  it('renders a label element when label prop is provided', () => {
    render(
      <SearchableDropdown options={OPTIONS} value="" onChange={vi.fn()} label="Target" id="dd" />
    );
    expect(screen.getByText('Target')).toBeDefined();
  });
});
