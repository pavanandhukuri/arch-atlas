import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConnectionsTable } from '../../../src/components/shared/ConnectionsTable';
import type { ConnectionRow } from '../../../src/components/shared/ConnectionsTable';
import type { Relationship, Element } from '@arch-atlas/core-model';

const makeRel = (overrides: Partial<Relationship> = {}): Relationship => ({
  id: 'r1',
  sourceId: 'a',
  targetId: 'b',
  kind: 'sync',
  ...overrides,
});

const makeElement = (overrides: Partial<Element> = {}): Element => ({
  id: 'b',
  kind: 'system',
  name: 'Target System',
  ...overrides,
});

describe('ConnectionsTable', () => {
  it('shows empty message when no rows', () => {
    render(<ConnectionsTable rows={[]} onRowClick={vi.fn()} onAddConnection={vi.fn()} />);
    expect(screen.getByText(/no connections yet/i)).toBeDefined();
  });

  it('renders outgoing connections in an Outgoing group', () => {
    const rows: ConnectionRow[] = [
      {
        relationship: makeRel(),
        connectedElement: makeElement(),
        direction: 'outgoing',
      },
    ];
    render(<ConnectionsTable rows={rows} onRowClick={vi.fn()} onAddConnection={vi.fn()} />);
    expect(screen.getByText(/outgoing/i)).toBeDefined();
    expect(screen.getByText('Target System')).toBeDefined();
  });

  it('renders incoming connections in an Incoming group', () => {
    const rows: ConnectionRow[] = [
      {
        relationship: makeRel(),
        connectedElement: makeElement({ name: 'Source System' }),
        direction: 'incoming',
      },
    ];
    render(<ConnectionsTable rows={rows} onRowClick={vi.fn()} onAddConnection={vi.fn()} />);
    expect(screen.getByText(/incoming/i)).toBeDefined();
    expect(screen.getByText('Source System')).toBeDefined();
  });

  it('shows Unknown for rows with no connected element', () => {
    const rows: ConnectionRow[] = [
      {
        relationship: makeRel(),
        connectedElement: undefined,
        direction: 'outgoing',
      },
    ];
    render(<ConnectionsTable rows={rows} onRowClick={vi.fn()} onAddConnection={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('calls onRowClick with the relationship when a row is clicked', () => {
    const onRowClick = vi.fn();
    const rel = makeRel({ action: 'Fetches data' });
    const rows: ConnectionRow[] = [
      {
        relationship: rel,
        connectedElement: makeElement(),
        direction: 'outgoing',
      },
    ];
    render(<ConnectionsTable rows={rows} onRowClick={onRowClick} onAddConnection={vi.fn()} />);
    fireEvent.click(screen.getByText('Target System').closest('tr')!);
    expect(onRowClick).toHaveBeenCalledWith(rel);
  });

  it('calls onAddConnection when the Add Connection button is clicked', () => {
    const onAddConnection = vi.fn();
    render(<ConnectionsTable rows={[]} onRowClick={vi.fn()} onAddConnection={onAddConnection} />);
    fireEvent.click(screen.getByText(/add connection/i));
    expect(onAddConnection).toHaveBeenCalledTimes(1);
  });

  it('displays action and integrationMode when set', () => {
    const rows: ConnectionRow[] = [
      {
        relationship: makeRel({ action: 'Fetches data', integrationMode: 'REST API' }),
        connectedElement: makeElement(),
        direction: 'outgoing',
      },
    ];
    render(<ConnectionsTable rows={rows} onRowClick={vi.fn()} onAddConnection={vi.fn()} />);
    expect(screen.getByText('Fetches data')).toBeDefined();
    expect(screen.getByText('REST API')).toBeDefined();
  });
});
