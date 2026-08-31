import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readExtraConnections,
  ExtraConnectionsSchema,
  EXTRA_CONNECTIONS_FILE,
  EXTRA_CONNECTIONS_VERSION,
} from '../../src/correlate/extra-connections.js';

function outDirWith(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'extra-conn-'));
  if (contents !== undefined) writeFileSync(join(dir, EXTRA_CONNECTIONS_FILE), contents, 'utf8');
  return dir;
}

const ONE_CONNECTION = {
  schemaVersion: EXTRA_CONNECTIONS_VERSION,
  generatedAt: '2026-08-31T00:00:00.000Z',
  connections: [
    {
      sourceRepo: 'a',
      sourceNodeId: 'module:a',
      targetRepo: 'b',
      targetNodeId: 'module:b',
      type: 'calls',
      foundBy: 'agentic-fallback',
      evidence: ['a and b share an auth domain'],
      weight: 0.82,
    },
  ],
};

describe('readExtraConnections', () => {
  it('returns [] when the file is absent (the fallback is optional)', () => {
    const dir = outDirWith();
    try {
      expect(readExtraConnections(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a valid agentic-fallback connections file', () => {
    const dir = outDirWith(JSON.stringify(ONE_CONNECTION));
    try {
      const conns = readExtraConnections(dir);
      expect(conns).toHaveLength(1);
      expect(conns[0]).toMatchObject({
        sourceRepo: 'a',
        targetRepo: 'b',
        type: 'calls',
        foundBy: 'agentic-fallback',
        weight: 0.82,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on a malformed file — it was deliberately produced', () => {
    const dir = outDirWith('{ not json');
    try {
      expect(() => readExtraConnections(dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a connection whose foundBy is not agentic-fallback', () => {
    const bad = {
      ...ONE_CONNECTION,
      connections: [{ ...ONE_CONNECTION.connections[0], foundBy: 'evidence' }],
    };
    expect(ExtraConnectionsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown edge type', () => {
    const bad = {
      ...ONE_CONNECTION,
      connections: [{ ...ONE_CONNECTION.connections[0], type: 'teleports' }],
    };
    expect(ExtraConnectionsSchema.safeParse(bad).success).toBe(false);
  });
});
