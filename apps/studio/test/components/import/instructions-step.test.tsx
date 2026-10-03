import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstructionsStep } from '../../../src/components/import/instructions-step';

describe('InstructionsStep', () => {
  it('renders the setup instructions', () => {
    render(<InstructionsStep />);
    expect(screen.getByText('Run the Repo Importer')).toBeDefined();
    expect(screen.getAllByText(/architecture\.review\.yaml/).length).toBeGreaterThan(0);
  });

  it('lists all four setup steps', () => {
    render(<InstructionsStep />);
    expect(screen.getByText('Write a config file')).toBeDefined();
    expect(screen.getByText(/Point a coding agent at it/)).toBeDefined();
    expect(screen.getByText('Locate the review file')).toBeDefined();
    expect(screen.getByText('Continue below')).toBeDefined();
  });
});
