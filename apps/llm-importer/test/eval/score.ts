import type { RepoAnalysis } from '../../src/analysis/repo-analysis.schema.js';
import type { CrossRepositoryConnection } from '../../src/correlate/deterministic-correlator.js';
import type { PRF, RepoGroundTruth, WorkspaceGroundTruth } from './types.js';

/**
 * Pure scoring — no model, no I/O. Unit-tested in `score.test.ts`.
 *
 * All matching is deliberately lenient: the model saying "ASP.NET Core" for a
 * ground-truth "ASP.NET", or "cart-service" for "cartservice", is a hit. The
 * eval measures whether the tool found the right *things*, not whether it
 * spelled them the reference way.
 */

const EMPTY_PRF: PRF = { tp: 0, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9/.:-]/g, '');
}

/** collapse `:param` / `{param}` / `*` and trailing slash so `/v1/users/:id`
 * and `/v1/users/{userId}` match. */
export function normalizeRoute(path: string): string {
  const p = path
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\{[^}]+\}/g, '*')
    .replace(/:[^/]+/g, '*')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
  return p.startsWith('/') ? p : `/${p}`;
}

/** last dotted segment: `hipstershop.CartService` -> `cartservice`. */
function grpcTail(s: string): string {
  const seg = s.split(/[./]/).filter(Boolean).pop() ?? s;
  return normalize(seg);
}

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/[-/.:]+/)
      .filter((t) => t.length > 1)
  );
}

/** true when the two strings share a meaningful token (framework / datastore
 * fuzzy match): "spring boot" ~ "spring", "node-postgres" ~ "postgres". */
export function tokenOverlap(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));
}

export function nameMatch(a: string, b: string): boolean {
  const na = normalize(a).replace(/-/g, '');
  const nb = normalize(b).replace(/-/g, '');
  return na === nb || (nb.length >= 3 && na.includes(nb)) || (na.length >= 3 && nb.includes(na));
}

export type Matcher = (predicted: string, expected: string) => boolean;

/** Greedy 1:1 set match → precision / recall / F1. */
export function prf(predicted: string[], expected: string[], match: Matcher): PRF {
  if (expected.length === 0 && predicted.length === 0) return { ...EMPTY_PRF };
  const usedPred = new Set<number>();
  let tp = 0;
  for (const exp of expected) {
    const hit = predicted.findIndex((p, i) => !usedPred.has(i) && match(p, exp));
    if (hit >= 0) {
      usedPred.add(hit);
      tp++;
    }
  }
  const fp = predicted.length - tp;
  const fn = expected.length - tp;
  const precision =
    predicted.length === 0 ? (expected.length === 0 ? 1 : 0) : tp / predicted.length;
  const recall = expected.length === 0 ? 1 : tp / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map(normalize));
  const sb = new Set(b.map(normalize));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function meanPairwiseJaccard(runs: string[][]): number {
  if (runs.length < 2) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      sum += jaccard(runs[i] ?? [], runs[j] ?? []);
      n++;
    }
  }
  return n === 0 ? 1 : sum / n;
}

// --- extracting comparable string lists from a RepoAnalysis ----------------

export function analysisFields(a: RepoAnalysis): Record<string, string[]> {
  return {
    languages: a.languages,
    frameworks: a.frameworks,
    httpRoutes: a.served.httpRoutes.map((r) => normalizeRoute(r.path)),
    grpcServices: a.served.grpcServices,
    topics: a.served.topics.map((t) => t.name),
    datastores: a.served.datastores.map((d) => d.name),
    outbound: a.outbound.map((o) => o.target),
  };
}

export function groundTruthFields(g: RepoGroundTruth): Record<string, string[]> {
  return {
    languages: g.languages,
    frameworks: g.frameworks,
    httpRoutes: (g.served.httpRoutes ?? []).map(normalizeRoute),
    grpcServices: g.served.grpcServices ?? [],
    topics: (g.served.topics ?? []).map((t) => t.split(':')[0] ?? t),
    datastores: g.served.datastores ?? [],
    outbound: g.outbound ?? [],
  };
}

const FIELD_MATCHERS: Record<string, Matcher> = {
  languages: nameMatch,
  frameworks: tokenOverlap,
  httpRoutes: (p, e) => normalizeRoute(p) === normalizeRoute(e),
  grpcServices: (p, e) => grpcTail(p) === grpcTail(e),
  topics: nameMatch,
  datastores: tokenOverlap,
  outbound: nameMatch,
};

export function scoreRepoRun(analysis: RepoAnalysis, gt: RepoGroundTruth): Record<string, PRF> {
  const pred = analysisFields(analysis);
  const exp = groundTruthFields(gt);
  const out: Record<string, PRF> = {};
  for (const field of Object.keys(FIELD_MATCHERS)) {
    out[field] = prf(pred[field] ?? [], exp[field] ?? [], FIELD_MATCHERS[field] ?? nameMatch);
  }
  return out;
}

// --- connection scoring --------------------------------------------------

export function scoreConnections(
  connections: CrossRepositoryConnection[],
  gt: WorkspaceGroundTruth,
  { directed = true }: { directed?: boolean } = {}
): PRF {
  const key = (from: string, to: string): string =>
    directed
      ? `${normalize(from)}->${normalize(to)}`
      : [normalize(from), normalize(to)].sort().join('~');
  const predicted = [...new Set(connections.map((c) => key(c.sourceRepo, c.targetRepo)))];
  const expected = [...new Set(gt.connections.map((c) => key(c.from, c.to)))];
  return prf(predicted, expected, (a, b) => a === b);
}

// --- aggregation -------------------------------------------------------

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function averagePrf(runs: PRF[]): PRF {
  return {
    tp: mean(runs.map((r) => r.tp)),
    fp: mean(runs.map((r) => r.fp)),
    fn: mean(runs.map((r) => r.fn)),
    precision: mean(runs.map((r) => r.precision)),
    recall: mean(runs.map((r) => r.recall)),
    f1: mean(runs.map((r) => r.f1)),
  };
}
