'use client';

import type { Relationship, Element } from '@arch-atlas/core-model';

export interface ConnectionRow {
  relationship: Relationship;
  connectedElement: Element | undefined;
  direction: 'incoming' | 'outgoing';
}

interface ConnectionsTableProps {
  rows: ConnectionRow[];
  onRowClick: (relationship: Relationship) => void;
  onAddConnection: () => void;
}

export function ConnectionsTable({ rows, onRowClick, onAddConnection }: ConnectionsTableProps) {
  const outgoing = rows.filter(r => r.direction === 'outgoing');
  const incoming = rows.filter(r => r.direction === 'incoming');

  const renderRows = (group: ConnectionRow[]) =>
    group.map(row => (
      <tr
        key={row.relationship.id}
        className="connection-row"
        onClick={() => onRowClick(row.relationship)}
        title="Click to edit this connection"
      >
        <td className="conn-element">
          {row.connectedElement?.name ?? <em>Unknown</em>}
          {row.connectedElement && (
            <span className="conn-element-kind"> [{row.connectedElement.kind}]</span>
          )}
        </td>
        <td className="conn-action">{row.relationship.action ?? '—'}</td>
        <td className="conn-mode">{row.relationship.integrationMode ?? '—'}</td>
      </tr>
    ));

  return (
    <div className="connections-table-wrapper">
      <h4>Connections</h4>

      {outgoing.length > 0 && (
        <div className="connections-group">
          <p className="connections-group-label">Outgoing</p>
          <table className="connections-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Action</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>{renderRows(outgoing)}</tbody>
          </table>
        </div>
      )}

      {incoming.length > 0 && (
        <div className="connections-group">
          <p className="connections-group-label">Incoming</p>
          <table className="connections-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Action</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>{renderRows(incoming)}</tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <p className="connections-empty">No connections yet.</p>
      )}

      <button type="button" className="add-connection-button" onClick={onAddConnection}>
        + Add Connection
      </button>
    </div>
  );
}
