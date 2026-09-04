# Behavior Contract: endpointPass — a bare data string is not a call

GIVEN/WHEN/THEN contracts for the new guard. Each maps to one unit test in
`apps/llm-importer/test/unit/evidence-passes.test.ts` (endpointPass) or
`apps/llm-importer/test/unit/evidence-parsers.test.ts` (the new `routes.ts` helper).

## C1 — The false-positive reproduction (FR-001)

**GIVEN** a callee repo serving `GET /product/{id}` (one static segment)
**AND** a caller repo with a route-shaped literal `/product/2ZYFJ3GM2N` carrying no method
hint
**WHEN** `endpointPass` runs
**THEN** no connection is emitted between the caller and the callee from that literal.

## C2 — Method hint present restores the match (FR-003)

**GIVEN** the same callee route (`GET /product/{id}`)
**AND** a caller literal `/product/42` immediately preceded by `.get(` (a method-call hint)
**WHEN** `endpointPass` runs
**THEN** a connection is emitted exactly as it would be today (same weight tier logic:
`exactMethod` weight `0.85` if the hint resolves to `GET`, else `0.7`).

## C3 — Higher-specificity route is unaffected regardless of method hint (FR-002)

**GIVEN** a callee repo serving `GET /api/v1/{id}` (two static segments)
**AND** a caller literal `/api/v1/999` with no method hint
**WHEN** `endpointPass` runs
**THEN** a connection is emitted exactly as it would be today — the new guard does not
apply.

## C4 — Gateway-prefixed-variant branch is unaffected (FR-004)

**GIVEN** the existing `matches gateway-prefixed caller paths against endpoint routes` test
fixture (fully concrete route, no wildcard)
**WHEN** `endpointPass` runs
**THEN** output is byte-identical to before this change (regression guard — no new
assertion needed beyond the existing test staying green).

## C5 — Literal-vs-literal fallback branch is unaffected (FR-004)

**GIVEN** the existing `falls back to literal-vs-literal gateway-suffix matching` and
`excludes OIDC infrastructure paths` test fixtures
**WHEN** `endpointPass` runs
**THEN** output is byte-identical to before this change (regression guard — existing tests
stay green; this branch never calls the new helper).

## C6 — Determinism (FR-006)

**GIVEN** any workspace input
**WHEN** `endpointPass` (via full correlation) runs twice over the same input
**THEN** the resulting connection set is byte-identical both runs — already covered by
`multi-repo-correlation.integration.test.ts`'s existing assertion; no new test required,
confirmed to still hold by the D7 determinism argument in `research.md`.

## Helper-level contracts (`staticSegmentCount`)

- `staticSegmentCount('/product/*')` → `1`
- `staticSegmentCount('/product/*/*')` → `1`
- `staticSegmentCount('/api/v1/*')` → `2`
- `staticSegmentCount('/*/*')` → `0`
- `staticSegmentCount('/v1/charge')` → `2` (no wildcard at all; irrelevant to the guard
  since it's only consulted inside the `pathsEqual` branch for routes that do contain one,
  but must still be correct as a general pure function)
