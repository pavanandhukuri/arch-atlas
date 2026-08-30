import type { GrpcClientRef } from '../types.js';

/**
 * gRPC client/stub *construction*-site extraction — literal pattern matching,
 * no data-flow, no AST (same discipline as `parsers/routes.ts` /
 * `parsers/topics.ts`). Feeds `grpcPass`
 * (009-grpc-cross-repo-correlation).
 *
 * Keyed on *construction* (`New<Name>Client(`, `new …Client(`, `…Stub(`,
 * `…Grpc.newBlockingStub(`) — never a bare type reference or import — and,
 * for the non-Java forms, the service token must contain "Service", which is
 * the precision lever against `new HttpClient()` / `new S3Client()` /
 * `redis.createClient()` and friends. Services not named `<Something>Service`
 * are out of scope (all reference-corpus services follow the convention).
 */

/**
 * Generated-code files re-declare every service's `New…Client` constructor and
 * `…Stub` class. Matching inside them would make every repo that vendors
 * generated stubs look like a client of every service. Skip them wholesale —
 * hand-written construction sites live elsewhere.
 */
const GENERATED_PATH_RE =
  /(^|\/)(genproto|__generated__|_generated)(\/|$)|\.pb\.(go|cc|h|rb)$|_pb2(_grpc)?\.py$|[._-]grpc\.pb\.[a-z]+$|\.grpc\.pb\.[a-z]+$|grpc\.cs$/i;

/**
 * A repo's own integration tests routinely construct a client for the service
 * that same repo *serves* — counting those would both invent client→server
 * "calls" that don't exist in production and, worse, make the served repo look
 * like a client of itself (suppressing real inbound edges). Skip test sources.
 */
const TEST_PATH_RE =
  /(^|\/)(tests?|__tests__|__mocks__|testdata|e2e)(\/)|(^|\/)[^/]*[._-](test|spec)\.[A-Za-z]+$|(^|\/)[^/]*Tests?\.[A-Za-z]+$|(^|\/)test_[^/]*\.py$/i;

/** Go generated constructor *definition* — `func NewFooServiceClient(...)`. */
const GO_FUNC_DEF_RE = /\bfunc\s+New[A-Za-z0-9_]*Client\b/;

interface FormMatcher {
  form: GrpcClientRef['form'];
  /** Global regex; capture group 1 (or 2) is the raw service name. */
  re: RegExp;
  /** Return true to reject every match on this (already comment/string-stripped) line. */
  guard?: (line: string) => boolean;
}

const MATCHERS: readonly FormMatcher[] = [
  // Go: [pkg.]New<Name>ServiceClient(  — not a `func New…Client(` definition.
  {
    form: 'go',
    re: /\b(?:[A-Za-z_]\w*\.)?New([A-Z][A-Za-z0-9_]*Service)Client\s*\(/g,
    guard: (line) => GO_FUNC_DEF_RE.test(line),
  },
  // C#: new [Ns.]*<Name>.<Name>Client(  — generated nested-type form.
  {
    form: 'csharp',
    re: /\bnew\s+(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*?)\.\1Client\s*\(/g,
  },
  // Node/JS/TS: new [ns.]*<Name>ServiceClient(
  {
    form: 'node',
    re: /\bnew\s+(?:[A-Za-z_$][\w$]*\.)*([A-Z][A-Za-z0-9_]*Service)Client\s*\(/g,
  },
  // Python: <mod>_pb2_grpc.<Name>Stub(   (bare `<Name>ServiceStub(` → generic)
  {
    form: 'python',
    re: /[A-Za-z_]\w*_pb2_grpc\.([A-Z][A-Za-z0-9_]*?)Stub\s*\(/g,
  },
  // Java/Kotlin: <Name>Grpc.new[Blocking|Future]Stub(
  {
    form: 'java',
    re: /\b([A-Z][A-Za-z0-9_]*?)Grpc\s*\.\s*new(?:Blocking|Future)?Stub\s*\(/g,
  },
  // Generic fallback: <Name>Service{Client,Stub,BlockingStub,FutureStub}(
  {
    form: 'generic',
    re: /\b([A-Z][A-Za-z0-9_]*?Service)(?:Client|Stub|BlockingStub|FutureStub)\s*\(/g,
  },
];

const IDENT_RE = /^[A-Za-z_][\w.]*$/;
/** A `New…`-prefixed capture is a constructor-name fragment, not a service. */
const NEW_PREFIX_RE = /^New[A-Z]/;

/** Blank out string literals, then drop `//` and `#` line comments. */
function stripCommentsAndStrings(line: string): string {
  let s = line.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""');
  const slash = s.indexOf('//');
  if (slash >= 0) s = s.slice(0, slash);
  const hash = s.indexOf('#');
  if (hash >= 0) s = s.slice(0, hash);
  return s.trim();
}

/**
 * Extract gRPC client construction sites from one source file. Deterministic:
 * refs are returned in ascending line order (ties broken by service name), at
 * most one per (line, service) with the most specific language form.
 */
export function extractGrpcClientRefs(relPath: string, content: string): GrpcClientRef[] {
  if (GENERATED_PATH_RE.test(relPath) || TEST_PATH_RE.test(relPath)) return [];

  const byKey = new Map<string, GrpcClientRef>();
  const lines = content.split('\n');

  lines.forEach((rawLine, index) => {
    const line = stripCommentsAndStrings(rawLine);
    if (!line) return;
    // `generic` is a fallback: only consulted for a line no specific form matched.
    let lineHadSpecific = false;
    for (const { form, re, guard } of MATCHERS) {
      if (form === 'generic' && lineHadSpecific) continue;
      if (guard?.(line)) continue;
      re.lastIndex = 0;
      for (const match of line.matchAll(re)) {
        const service = match[1] ?? match[2];
        if (!service || !IDENT_RE.test(service) || NEW_PREFIX_RE.test(service)) continue;
        if (form !== 'generic') lineHadSpecific = true;
        const key = `${index}|${service.toLowerCase()}`;
        if (!byKey.has(key)) byKey.set(key, { relPath, line: index + 1, service, form });
      }
    }
  });

  return [...byKey.values()].sort((a, b) => a.line - b.line || a.service.localeCompare(b.service));
}

/**
 * Normalize a gRPC service name for cross-toolchain matching:
 * drop the proto package prefix, lowercase, strip non-alphanumerics, then
 * strip a trailing "service" word. `hipstershop.CartService` → `cart`,
 * `product-catalog-service` → `productcatalog`.
 */
export function normalizeServiceName(raw: string): string {
  const simple = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  let s = simple.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length > 'service'.length && s.endsWith('service')) {
    s = s.slice(0, -'service'.length);
  }
  return s;
}

/** Symmetric match on normalized simple names; requires ≥ 2 significant chars. */
export function serviceNamesMatch(a: string, b: string): boolean {
  const na = normalizeServiceName(a);
  return na.length >= 2 && na === normalizeServiceName(b);
}
