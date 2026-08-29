import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolCallEventResult,
} from '@earendil-works/pi-coding-agent';

import { matchesSecretPattern } from './secret-paths.js';

/**
 * FR-015 / Constitution Principle IV: secret-path exclusions enforced at the
 * agent's file-access tool layer — a deny-list applied before the tool
 * executes, not a post-hoc filter on output. Registered as an extension
 * (`tool_call` handler, verified against pi's real extension API — the
 * handler can return `{ block: true, reason }` to prevent execution) rather
 * than relying solely on the vendored `.understandignore` file, which is
 * advisory (the agent has to choose to respect it) not enforced.
 *
 * The pattern list itself lives in secret-paths.ts, shared with the
 * deterministic evidence collector.
 */

function blockResult(path: string): ToolCallEventResult {
  return {
    block: true,
    reason: `Blocked by arch-atlas secret-path exclusion (FR-015): "${path}" matches an excluded pattern.`,
  };
}

export function secretExclusionExtension(pi: ExtensionAPI): void {
  pi.on(
    'tool_call',
    (event: ToolCallEvent, _ctx: ExtensionContext): ToolCallEventResult | undefined => {
      // Discriminated-union narrowing via `event.toolName` directly does not
      // propagate to `event.input` through this package's re-exported types
      // (verified empirically) — use the package's own `isToolCallEventType`
      // guard instead, which is exported specifically for this purpose.
      if (isToolCallEventType('read', event)) {
        if (matchesSecretPattern(event.input.path)) return blockResult(event.input.path);
        return undefined;
      }
      if (isToolCallEventType('grep', event)) {
        const candidate = [event.input.path, event.input.glob].filter(Boolean).join(' ');
        if (candidate && matchesSecretPattern(candidate)) return blockResult(candidate);
        return undefined;
      }
      if (isToolCallEventType('find', event)) {
        const candidate = [event.input.path, event.input.pattern].filter(Boolean).join(' ');
        if (candidate && matchesSecretPattern(candidate)) return blockResult(candidate);
        return undefined;
      }
      if (isToolCallEventType('ls', event)) {
        if (event.input.path && matchesSecretPattern(event.input.path)) {
          return blockResult(event.input.path);
        }
        return undefined;
      }
      if (isToolCallEventType('bash', event)) {
        // Best-effort only: `command` is a free-form shell string, not a
        // structured path, so this is a heuristic substring check, not a
        // hard guarantee the way read/grep/find/ls above are. Documented
        // here rather than silently overclaimed.
        if (matchesSecretPattern(event.input.command)) {
          return blockResult(event.input.command);
        }
        return undefined;
      }
      return undefined;
    }
  );
}
