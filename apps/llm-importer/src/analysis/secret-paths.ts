/**
 * FR-015 / Constitution Principle IV: the single source of truth for
 * secret-path exclusion patterns. Consumed by two enforcement layers:
 * the agent tool-call extension (secret-exclusion-extension.ts) and the
 * deterministic evidence collector (correlate/evidence/collect.ts), so a
 * file the agent may not read is never read by our own scanners either.
 *
 * Same pattern list as contracts/config-schema-contract.md's hardcoded
 * exclusions.
 */
export const SECRET_PATH_PATTERNS: RegExp[] = [
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

export function matchesSecretPattern(candidate: string): boolean {
  return SECRET_PATH_PATTERNS.some((pattern) => pattern.test(candidate));
}
