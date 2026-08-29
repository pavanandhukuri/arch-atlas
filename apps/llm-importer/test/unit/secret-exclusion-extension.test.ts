import { describe, it, expect } from 'vitest';
import { secretExclusionExtension } from '../../src/analysis/secret-exclusion-extension.js';
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent';

function captureHandler(): (event: ToolCallEvent) => ToolCallEventResult | undefined {
  let handler: ((event: ToolCallEvent, ctx: never) => ToolCallEventResult | undefined) | undefined;
  const fakeApi = {
    on: (eventName: string, fn: never) => {
      if (eventName === 'tool_call') handler = fn as typeof handler;
    },
  } as unknown as ExtensionAPI;
  secretExclusionExtension(fakeApi);
  if (!handler) throw new Error('secretExclusionExtension did not register a tool_call handler');
  return (event) => handler?.(event, undefined as never);
}

function readEvent(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: 'tool_call', toolCallId: 't1', toolName, input } as unknown as ToolCallEvent;
}

describe('secretExclusionExtension (FR-015, Constitution Principle IV)', () => {
  const handle = captureHandler();

  it('blocks reading a .env file', () => {
    const result = handle(readEvent('read', { path: 'services/api/.env' }));
    expect(result?.block).toBe(true);
    expect(result?.reason).toMatch(/secret-path exclusion/);
  });

  it('blocks reading a .pem file', () => {
    expect(handle(readEvent('read', { path: 'certs/server.pem' }))?.block).toBe(true);
  });

  it('blocks reading anything under node_modules/', () => {
    expect(handle(readEvent('read', { path: 'node_modules/some-pkg/index.js' }))?.block).toBe(true);
  });

  it('allows reading an ordinary source file', () => {
    expect(handle(readEvent('read', { path: 'src/index.ts' }))).toBeUndefined();
  });

  it('blocks a grep whose glob targets excluded files', () => {
    const result = handle(readEvent('grep', { pattern: 'foo', glob: '**/*credential*' }));
    expect(result?.block).toBe(true);
  });

  it('allows an ordinary grep', () => {
    expect(handle(readEvent('grep', { pattern: 'TODO', path: 'src' }))).toBeUndefined();
  });

  it('blocks a find targeting a *.key pattern', () => {
    expect(handle(readEvent('find', { pattern: '*.key' }))?.block).toBe(true);
  });

  it('blocks ls into .git/', () => {
    expect(handle(readEvent('ls', { path: '.git' }))?.block).toBe(true);
  });

  it('best-effort blocks a bash command that references a secret-like path', () => {
    expect(handle(readEvent('bash', { command: 'cat .env.production' }))?.block).toBe(true);
  });

  it('allows an ordinary bash command', () => {
    expect(handle(readEvent('bash', { command: 'git rev-parse HEAD' }))).toBeUndefined();
  });

  it('does not interfere with unrecognized/custom tool names', () => {
    expect(
      handle(readEvent('subagent', { agent: 'file-analyzer', task: 'do stuff' }))
    ).toBeUndefined();
  });
});
