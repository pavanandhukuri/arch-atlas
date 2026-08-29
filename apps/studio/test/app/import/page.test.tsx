import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../../../src/app/import/import-wizard', () => ({
  ImportWizard: () => <div>import-wizard</div>,
}));

import ImportPage, { metadata } from '../../../src/app/import/page';

describe('ImportPage', () => {
  it('renders the ImportWizard', () => {
    render(<ImportPage />);
    expect(screen.getByText('import-wizard')).toBeDefined();
  });

  it('sets page metadata', () => {
    expect(metadata.title).toBe('Import Wizard — Arch Atlas Studio');
  });
});
