import {
  isToolCallEventType,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
  type ToolCallEventResult,
} from '@earendil-works/pi-coding-agent';

/**
 * FR-015 / Constitution Principle IV: secret-path exclusions enforced at the
 * agent's file-access tool layer — a deny-list applied before the tool
 * executes, not a post-hoc filter on output. Registered as an extension
 * (`tool_call` handler, verified against pi's real extension API — the
 * handler can return `{ block: true, reason }` to prevent execution) rather
 * than relying solely on the vendored `.understandignore` file, which is
 * advisory (the agent has to choose to respect it) not enforced.
 *
 * Same pattern list as contracts/config-schema-contract.md's hardcoded
 * exclusions.
 */
const SECRET_PATH_PATTERNS: RegExp[] = [
  /\.env(\.[a-z]+)?$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /secret/i,
  /credential/i,
  /password/i,
  // Directory patterns match with OR without a trailing slash — a bare
  // `ls`/`find` path argument like ".git" (no trailing slash) is just as
  // real a request to list that directory as ".git/" is, and must be
  // blocked the same way (caught by an actual test, not a hypothetical).
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)coverage(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.venv(\/|$)/,
  /(^|\/)venv(\/|$)/,
];

function matchesSecretPattern(candidate: string): boolean {
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(candidate));
}

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
