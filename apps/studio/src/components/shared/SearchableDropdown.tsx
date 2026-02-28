'use client';

import { useState, useRef, useEffect } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string; // Hierarchy breadcrumb, e.g. "Landscape > System A"
}

interface SearchableDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
}

export function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  label,
  id,
}: SearchableDropdownProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(
        o =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (option: DropdownOption) => {
    onChange(option.value);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="searchable-dropdown" ref={containerRef}>
      {label && <label htmlFor={id}>{label}</label>}
      <button
        type="button"
        id={id}
        className="dropdown-trigger"
        onClick={() => setIsOpen(prev => !prev)}
      >
        {selectedOption ? (
          <span className="dropdown-selected">
            <span className="dropdown-selected-label">{selectedOption.label}</span>
            {selectedOption.sublabel && (
              <span className="dropdown-selected-sublabel">{selectedOption.sublabel}</span>
            )}
          </span>
        ) : (
          <span className="dropdown-placeholder">{placeholder}</span>
        )}
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="dropdown-panel">
          <input
            type="text"
            className="dropdown-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type to filter..."
            autoFocus
          />
          <ul className="dropdown-list">
            {filtered.length === 0 && (
              <li className="dropdown-empty">No results</li>
            )}
            {filtered.map(option => (
              <li
                key={option.value}
                className={`dropdown-item${option.value === value ? ' dropdown-item--selected' : ''}`}
                onClick={() => handleSelect(option)}
              >
                <span className="dropdown-item-label">{option.label}</span>
                {option.sublabel && (
                  <span className="dropdown-item-sublabel">{option.sublabel}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
