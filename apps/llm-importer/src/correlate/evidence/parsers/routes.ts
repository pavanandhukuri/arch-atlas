import type { GraphNode } from '../../../graph/schema.js';
import type { UrlLiteral } from '../types.js';

/**
 * Route/URL extraction and normalization. Ported from
 * understand-everything's linker core (routes parser).
 */

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * Normalize a route path for matching: strip origin and trailing slash,
 * collapse path params (`{id}`, `:id`, `<int:id>`, `${...}`, `$id`) to `*`.
 */
export function normalizeRoutePath(raw: string): string {
  let p = raw.trim();
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  if (!p.startsWith('/')) return '';
  p = p
    .split('/')
    .map((seg) => {
      if (
        /^\{.*\}$/.test(seg) ||
        /^:.+$/.test(seg) ||
        /^<.*>$/.test(seg) ||
        seg.includes('${') ||
        // Kotlin/Groovy-style bare interpolation: `/users/$userId/blobs`
        /^\$\w+$/.test(seg)
      ) {
        return '*';
      }
      return seg;
    })
    .join('/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function segmentCount(path: string): number {
  return path.split('/').filter(Boolean).length;
}

/**
 * Count of non-wildcard ('*') segments in an already-normalized path — how
 * much distinguishing static structure a route pattern carries. `/product/*`
 * has 1; `/api/v1/*` has 2; a fully-wildcard path has 0. Used to gate
 * low-signal matches (012): a route with almost no static structure needs a
 * stronger caller-side signal than bare path overlap before it's trusted as
 * a real call target.
 */
export function staticSegmentCount(path: string): number {
  return path
    .split('/')
    .filter(Boolean)
    .filter((seg) => seg !== '*').length;
}

/** Aligned segment comparison: null when incompatible, else the number of
 * positions where both sides are concrete (non-wildcard) and equal. Wildcards
 * match anything, but contribute no concreteness. */
function alignedConcreteMatches(a: string[], b: string[]): number | null {
  if (a.length !== b.length) return null;
  let concrete = 0;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (sa === sb && sa !== '*') {
      concrete++;
    } else if (sa !== '*' && sb !== '*' && sa !== sb) {
      return null;
    }
  }
  return concrete;
}

/**
 * True when `longer` ends with all of `shorter`'s segments (a
 * gateway-prefixed variant of the same route), and is strictly longer.
 * Wildcard segments match anything on the opposing side, but at least
 * `minConcrete` aligned segments must be concrete on BOTH sides and equal —
 * without this, a route ending in two wildcard segments suffix-matches
 * nearly any two-segment path (observed against a real workspace).
 */
export function isGatewayPrefixedVariant(
  longer: string,
  shorter: string,
  minConcrete = 1
): boolean {
  const a = longer.split('/').filter(Boolean);
  const b = shorter.split('/').filter(Boolean);
  if (b.length === 0 || a.length <= b.length) return false;
  const matches = alignedConcreteMatches(a.slice(a.length - b.length), b);
  return matches !== null && matches >= minConcrete;
}

/** Wildcard-tolerant equality between two normalized paths, requiring at
 * least `minConcrete` concretely-equal aligned segments (see above). */
export function pathsEqual(a: string, b: string, minConcrete = 1): boolean {
  const matches = alignedConcreteMatches(
    a.split('/').filter(Boolean),
    b.split('/').filter(Boolean)
  );
  return matches !== null && matches >= minConcrete;
}

/**
 * OIDC/OAuth infrastructure paths (Keycloak realms, token endpoints,
 * discovery documents). Repos holding these literals are *clients of an
 * identity provider*, not of each other — excluded from the literal-vs-
 * literal fallback (endpoint-node matches still apply: a repo that really
 * serves these routes has them as endpoint nodes).
 */
export const THIRD_PARTY_PATH_RE =
  /(protocol\/openid-connect|\/auth\/realms\/|\.well-known|\/oauth2?\/)/;

export interface EndpointRoute {
  method?: string;
  path: string;
}

/**
 * Recover method + route from an agent-extracted endpoint node. UA formats
 * the node name as "<METHOD> <path>" and the ID tail as "<METHOD>-<path>";
 * plain paths occur for schema-derived endpoints. Returns null when no
 * route-shaped string is recoverable.
 */
export function parseEndpointRoute(node: GraphNode): EndpointRoute | null {
  const tryParse = (text: string): EndpointRoute | null => {
    const nameForm = /^([A-Z]+)[ -](\/.*)$/.exec(text.trim());
    if (nameForm?.[1] && nameForm[2] && HTTP_METHODS.has(nameForm[1])) {
      const path = normalizeRoutePath(nameForm[2]);
      return path ? { method: nameForm[1], path } : null;
    }
    const path = normalizeRoutePath(text);
    return path ? { path } : null;
  };

  const fromName = tryParse(node.name);
  if (fromName) return fromName;
  const lastColon = node.id.lastIndexOf(':');
  if (lastColon > 0) {
    const fromId = tryParse(node.id.slice(lastColon + 1));
    if (fromId) return fromId;
  }
  return null;
}

// String literals: "..." '...' `...`
const STRING_LITERAL_RE = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
// Route-shaped: starts with / (or http origin + /), sensible chars, no spaces.
const ROUTE_SHAPE_RE = /^(?:https?:\/\/[^/\s]+)?\/[A-Za-z0-9_\-{}$./:*]*$/;

// Callsite verb immediately before the literal, e.g. `axios.get(` / `router.post(`.
const CALLSITE_METHOD_RE = /\.\s*(get|post|put|patch|delete)\s*\(\s*$/i;
// Options-object hint, e.g. `{ method: "POST" }` — same line after the
// literal or the following two lines (multi-line fetch options).
const OPTIONS_METHOD_RE = /method\s*:\s*["'`]?(GET|POST|PUT|PATCH|DELETE)/i;

/**
 * Resolve the HTTP method for a literal at lines[index], where the literal
 * starts at column `col`. Scoped tightly to the callsite to avoid bleeding
 * hints across neighboring statements.
 */
function resolveMethodHint(lines: string[], index: number, col: number): string | undefined {
  const line = lines[index] ?? '';
  const before = line.slice(0, col);
  const callsite = CALLSITE_METHOD_RE.exec(before);
  if (callsite?.[1]) return callsite[1].toUpperCase();

  const after = `${line.slice(col)}\n${lines[index + 1] ?? ''}\n${lines[index + 2] ?? ''}`;
  const options = OPTIONS_METHOD_RE.exec(after);
  if (options?.[1]) return options[1].toUpperCase();

  // Chained call broken across lines: `axios.post(\n  "/v1/charge")`.
  const prev = (lines[index - 1] ?? '').trimEnd();
  const chained = /\.\s*(get|post|put|patch|delete)\s*\(\s*$/i.exec(prev);
  if (chained?.[1] && before.trim() === '') return chained[1].toUpperCase();
  return undefined;
}

/**
 * Extract route-shaped string literals from one source file. Literal matching
 * only — no dataflow. Template strings with interpolation are flagged so the
 * endpoint pass demotes them to lower-confidence matches.
 */
export function extractUrlLiterals(relPath: string, content: string): UrlLiteral[] {
  const results: UrlLiteral[] = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(STRING_LITERAL_RE)) {
      const quote = match[1];
      const value = match[2] ?? '';
      if (!ROUTE_SHAPE_RE.test(value)) continue;
      const normalized = normalizeRoutePath(value);
      // Noise floor: bare hosts and 1-segment paths like "/" or "/api".
      if (!normalized || segmentCount(normalized) < 2) continue;

      const method = resolveMethodHint(lines, index, match.index);
      results.push({
        relPath,
        line: index + 1,
        path: normalized,
        ...(method ? { method } : {}),
        template: quote === '`' && value.includes('${'),
      });
    }
  });
  return results;
}
