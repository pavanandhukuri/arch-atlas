# Research: endpointPass — a bare data string is not a call

## D1 — Exact code path producing the false positive

`apps/llm-importer/src/correlate/evidence-passes.ts`, `endpointPass`'s endpoint-node
matching loop:

```ts
for (const calleeRoute of routesByRepo.get(callee.name) ?? []) {
  const { route } = calleeRoute;
  const methodsContradict =
    literal.method !== undefined &&
    route.method !== undefined &&
    literal.method !== route.method;
  if (methodsContradict) continue;
  if (pathsEqual(literal.path, route.path)) {
    const exactMethod = literal.method !== undefined && literal.method === route.method;
    let weight = exactMethod ? 0.85 : 0.7;
    ...
    matches.push({ callee, match: calleeRoute, weight });
  } else if (isGatewayPrefixedVariant(literal.path, route.path)) { ... }
}
```

`pathsEqual` (`evidence/parsers/routes.ts`) defaults `minConcrete = 1`:

```ts
function alignedConcreteMatches(a: string[], b: string[]): number | null {
  if (a.length !== b.length) return null;
  let concrete = 0;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i],
      sb = b[i];
    if (sa === sb && sa !== '*') concrete++;
    else if (sa !== '*' && sb !== '*' && sa !== sb) return null;
  }
  return concrete;
}
export function pathsEqual(a: string, b: string, minConcrete = 1): boolean {
  const matches = alignedConcreteMatches(
    a.split('/').filter(Boolean),
    b.split('/').filter(Boolean)
  );
  return matches !== null && matches >= minConcrete;
}
```

A wildcard (`*`) on **either** side never triggers a mismatch and never counts toward
`concrete`. For `frontend`'s served `GET /product/{id}` — normalized by
`normalizeRoutePath` to `/product/*` — the segment array is `['product', '*']`. There is
exactly one position (`0`) where a concrete match is even possible. Any literal whose
segment 0 is the literal string `"product"` satisfies `matches >= 1` regardless of segment
1's content, method, or surrounding code.

`adservice/src/main/java/hipstershop/AdService.java` contains, verbatim:

```java
.setRedirectUrl("/product/2ZYFJ3GM2N")
```

This is `extractUrlLiterals`'s intended, documented behavior — "Literal matching only — no
dataflow" — so it correctly becomes a `UrlLiteral{ path: '/product/2ZYFJ3GM2N', method:
undefined, template: false }` (a double-quoted Java string, no `${...}` interpolation).
`resolveMethodHint` finds no `.get(`/`.post(`/etc. call-site keyword and no `method:`
options object near the literal (it's an ad-content setter, not an HTTP client call), so
`literal.method` stays `undefined`. `methodsContradict` is trivially false (one side
undefined), `pathsEqual('/product/2ZYFJ3GM2N', '/product/*')` is `true` by the above, and
the match is accepted at weight `0.7` (the `exactMethod` branch requires `literal.method`
to be defined, so it falls to the non-exact weight).

## D2 — Weight does not gate `connectionsPrecision`; the edge must not be emitted

`packages/analysis-runner-local/eval/score.ts`, `scoreConnections`:

```ts
const predicted = [...new Set(connections.map((c) => key(c.sourceRepo, c.targetRepo)))];
const expected = [...new Set(gt.connections.map((c) => key(c.from, c.to)))];
return prf(predicted, expected, (a, b) => a === b);
```

Every connection in the array counts, with no weight or confidence-tier filter. 011's own
`proof.md` confirmed this pattern already (the schema FPs were removed, not down-weighted).
Demoting this match's weight would not move `connectionsPrecision` at all — the fix must
prevent the connection from being pushed to the `connections` array in the first place.

## D3 — Confirmed safe against both golden ground-truth sets

`packages/analysis-runner-local/eval/golden/online-boutique/ground-truth.json`:
`frontend.served.httpRoutes` includes `/product/*`, but `connections` are exclusively
`frontend -> <backend>` gRPC edges (`_source` note: "All inter-service calls are gRPC").
No true positive in this ground truth is an inbound edge to `frontend`'s HTTP routes at
all — they are the storefront's own user-facing UI paths. Removing the
`adservice -> frontend` match costs nothing.

`packages/analysis-runner-local/eval/golden/fixtures/ground-truth.json`: the three
`gateway -> {user-service,notification-service,audit-service}` true positives depend on
routes `/v1/send`, `/v1/audit`, and the gateway's own `/api/*` prefixes matched via the
**gateway-prefixed-variant** branch (`isGatewayPrefixedVariant`), not the plain
endpoint-node `pathsEqual` branch this feature touches, and none of those served routes
contain a wildcard segment at all (`grep -riE "\{|\*|:.+" ...` over the served-route
strings in that ground truth returns nothing). A fix scoped to routes with ≤ 1 static
segment cannot touch any of this set's true positives.

## D4 — Confirmed untested territory, not a codified behavior

`grep -n "describe\|it(" apps/llm-importer/test/unit/evidence-passes.test.ts` inside the
`describe('endpointPass')` block lists 6 cases: exact path+method, contradictory-method
skip, gateway-prefixed variant, literal-vs-literal fallback (+ OIDC exclusion), and
multi-repo demotion. Every served route used across these fixtures (`/v1/charge`,
`POST /v1/charge`) is fully concrete — none has a wildcard segment matched via the
endpoint-node `pathsEqual` branch. The new guard therefore cannot flip any existing
assertion; it only starts constraining a code path no test currently exercises.

## D5 — The new rule

Define, alongside `pathsEqual` / `isGatewayPrefixedVariant` in `routes.ts`:

```ts
export function staticSegmentCount(path: string): number {
  return path
    .split('/')
    .filter(Boolean)
    .filter((seg) => seg !== '*').length;
}
```

(reuses the same `split('/').filter(Boolean)` convention `segmentCount`/`pathsEqual`
already use — no new normalization logic, just a filtered count over the already-normalized
path).

In `endpointPass`'s endpoint-node matching loop, inside the `pathsEqual(...)` branch:

```ts
if (pathsEqual(literal.path, route.path)) {
  if (literal.method === undefined && staticSegmentCount(route.path) <= MIN_STATIC_SEGMENTS) {
    continue; // no call-site signal, and the route has almost no distinguishing structure
  }
  ...
}
```

`MIN_STATIC_SEGMENTS = 1` (named constant, not a bare literal — matches 011's convention of
naming every threshold with its rationale inline).

## D6 — Why "static segment count", not "total segment count" or "wildcard ratio"

`pathsEqual`'s own matching unit is the normalized, `/`-split segment array with `*`
standing for every already-recognized dynamic-segment shape (`{id}`, `:id`, `<int:id>`,
`${...}`, bare `$id`). Reusing that exact representation for the specificity check means
the new rule is defined in terms of the same normalization `pathsEqual` already performs —
no second parsing pass, no risk of the two disagreeing on what counts as "dynamic". A
"wildcard ratio" (concrete / total) was considered and rejected: it would also gate
`/api/v1/{id}` at a 2-of-3 ratio boundary choice that has no evidence behind it yet;
"static segment count ≤ 1" is the precise, narrowest rule that matches the one documented
failure mode (D1) without extrapolating past what's observed.

## D7 — Determinism argument

The guard is a pure function of `literal.method` and `route.path`, both already fully
determined earlier in the same deterministic pass (no I/O, no iteration-order dependency,
no new `Map`/`Set` state). It can only ever remove a `continue`-eligible match from
`matches`, never add one or change the order in which existing matches are considered — the
surrounding loop structure, `dedupeConnections`, and the pass's return shape are unchanged.
`multi-repo-correlation.integration.test.ts`'s existing `JSON.stringify(run2.connections)
=== JSON.stringify(run1.connections)` assertion continues to hold with no changes needed.

## D8 — Blast-radius table

| Existing `endpointPass` test                                              | Uses a wildcard-segment route? | Affected? |
| ------------------------------------------------------------------------- | :----------------------------: | :-------: |
| `matches exact path+method at high weight`                                |    No (`/v1/charge`, exact)    |    No     |
| `skips contradictory methods entirely`                                    |               No               |    No     |
| `matches gateway-prefixed caller paths against endpoint routes`           |   No (gateway-prefix branch)   |    No     |
| `falls back to literal-vs-literal gateway-suffix matching`                | No (literal-vs-literal branch) |    No     |
| `excludes OIDC infrastructure paths from the literal-vs-literal fallback` | No (literal-vs-literal branch) |    No     |
| `demotes literals matching endpoints in multiple repos`                   |    No (`/v1/charge`, exact)    |    No     |

All 6 existing `endpointPass` cases, plus every `schemaPass`/`grpcPass`/etc. test (no other
pass reads `routes.ts`'s new export), remain green with byte-identical assertions.
