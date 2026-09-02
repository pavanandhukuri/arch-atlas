# Research: schemaPass — shared multi-service contract is not a dependency (011)

All findings verified against `apps/llm-importer` at `main` @ `4498405`.

## D1 — The exact code being changed

`apps/llm-importer/src/correlate/evidence-passes.ts` → `export const schemaPass` (currently
≈ line 419-538). It emits three kinds of cross-repo connection:

| #   | Signal                      | Trigger                                                                                                         | Emitted edge                          |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Identical schema copy**   | `da.sha256 === db.sha256` for a `SchemaDigest` in repo A and one in repo B                                      | `A --depends_on--> B`, weight **0.9** |
| 2   | **Proto-package drift**     | `package:<x>` identifier equal in A and B **and** ≥1 shared `message:<y>` identifier **and** differing `sha256` | `A --depends_on--> B`, weight **0.4** |
| 3   | **OpenAPI client coverage** | repo B's `urlLiterals` cover ≥25 % of `digest.openapiPaths` declared in repo A's OpenAPI doc                    | `B --calls--> A`, weight 0.7 / 0.45   |

Signal 3 is correct and **out of scope**. Signals 1 and 2 are the target.

## D2 — Why signals 1 & 2 misfire on the reference workspace (009 D14, reproduced)

Online Boutique vendors one aggregate contract `demo.proto` (declares ~10 `service`
blocks, `package hipstershop`) into 5 service repos, byte-identical. Plus
`cartservice/proto/Cart.proto` reuses `package hipstershop` and a shared message.

Per deterministic run, this produces **6 false-positive cross-repo edges**:

- **3 from signal 1** — `currencyservice ↔ paymentservice ↔ adservice` each pair matches
  on the identical `demo.proto` digest → 3 `depends_on` @ 0.9.
- **3 from signal 2** — `cartservice/Cart.proto` shares `package hipstershop` + a message
  with the 3 `demo.proto` holders → 3 `depends_on` @ 0.4.

`connectionsPrecision` on the workspace is **0.667** (14 correct gRPC edges + 7 FP = 21
predictions; the 7th FP is an `endpointPass` string-match, out of scope). Removing the 6
schema FPs ⇒ 14 / 15 = **0.933**.

**Decision**: target `connectionsPrecision ≥ 0.90` (SC-001), `= 0` schema-attributable FP
(SC-002). Full 1.0 is unreachable here without touching `endpointPass`.

## D3 — The ownership signal already exists; no new evidence field

`RepoEvidence.grpcServices: string[]` (added in 009) is _"gRPC services this repo serves —
union of graph `endpoint:grpc:_`node names and`.proto` `service:<Name>`schema
identifiers, de-duplicated, sorted"*. And every`SchemaDigest.identifiers`array already
carries`service:<Name>`entries for`.proto` files (`parsers/schemas.ts:29`).

So "how many services does this contract declare" = `digest.identifiers.filter(id =>
id.startsWith('service:')).length`, and "does repo R own service S" = normalized-name
membership of S in `R.grpcServices`.

**Decision**: **no change to `RepoEvidence` / `SchemaDigest` / any parser.** FR-008
satisfied by construction. `normalizeServiceName` (already exported-internal in
evidence-passes.ts, used by `grpcPass`) is reused for the name match.

**Alternatives considered**: adding `serviceCount` / `serviceNames` to `SchemaDigest` —
rejected, pure duplication of `identifiers`.

## D4 — The new rule for signal 1 (identical schema copy)

Let `svcIds = digest.identifiers` starting with `service:` (same digest content on both
sides, so identical). Let `holders` = every repo whose `schemaDigests` contains this
`sha256`.

- **`svcIds.length === 0`** (message-only proto, GraphQL SDL, JSON Schema — no service
  concept): **unchanged.** Emit `A --depends_on--> B` @ 0.9 pairwise. Not an eval FP;
  keeps the existing `'links identical schema copies'` unit test green; low risk.
- **`svcIds.length >= 1`**: compute `owners` = repos in `holders` whose `grpcServices`
  (normalized) is a **superset of every** name in `svcIds`.
  - **exactly one owner** → for each other holder `H`, emit `H --depends_on--> owner`
    @ 0.9. (User Story 2 — "A carries B's contract"; also covers a single-service proto
    with a clear server.)
  - **zero or ≥2 owners** → emit **no edge** from this digest. Optionally push a `note`
    (`"<n> repos vendor an identical copy of <relPath> (declares <k> services, no single
owner) — treated as a shared contract, not a dependency"`). Covers `demo.proto`
    (10 services, no repo serves all 10) and FR-003 (single service, no server).

Directionality stays `depends_on` (vendorer depends on owner), matching today's type.

## D5 — The new rule for signal 2 (proto-package drift)

Pre-scan once per pass: `pkgHolders: Map<packageName, Set<repoName>>` over every
`SchemaDigest.identifiers` `package:` entry across all repos.

In the pairwise drift check, before emitting: if `pkgHolders.get(pkg).size > 2`, **skip** —
the package name is a workspace-wide namespace, not a bilateral contract. `package
hipstershop` is held by 5+ repos → skipped. The existing `'flags proto drift'` unit test
uses `package:acme.events` in exactly 2 repos → still fires @ 0.4, stays green.

**Decision**: threshold **> 2 repos** ⇒ suppress. Named constant
`SHARED_NAMESPACE_MIN_REPOS = 3`. Rationale: a genuine bilateral contract lives in ≤ 2
repos (producer + one consumer, or two peers); 3+ copies is a shared namespace.

**Alternatives considered**: dropping signal 2 entirely — kept as a fallback option in
tasks if the > 2 guard proves insufficient, but the guard is expected to be enough and
preserves the one legitimate 2-repo case the unit test encodes.

## D6 — Thresholds as named constants

```ts
/** A .proto that declares ≥ this many services is an aggregate/shared contract:
 *  holding a copy is not evidence of depending on the other holders. */
const AGGREGATE_CONTRACT_MIN_SERVICES = 2;
/** A proto `package` name shared by ≥ this many repos is a workspace namespace,
 *  not a bilateral contract — its drift signal is suppressed. */
const SHARED_NAMESPACE_MIN_REPOS = 3;
```

Both live beside `schemaPass`, with the rationale comment. Revisitable per future
workspace (Assumptions in spec).

## D7 — Determinism (FR-007, SC-005)

`schemaPass` iterates `repos` (already stably ordered by the caller) with `for i<j`, and
returns `dedupeConnections(connections)`. The new logic adds: (a) one pre-scan building
`Map`s keyed by string, iterated only for membership; (b) an `owners` computation that
filters `holders` (a subset of the stably-ordered `repos`). No `Set`/`Map` iteration
order is relied on for output ordering. Output stays byte-identical run-to-run.

## D8 — Blast radius on existing tests

`apps/llm-importer/test/unit/evidence-passes.test.ts` → `describe('schemaPass')`:

| Existing test                                                                                         | Under new rule                                     | Action                     |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------- |
| `links identical schema copies at high weight` (`identifiers: ['package:acme']`, 0 services, 2 repos) | 0 services → unchanged branch → still 1 edge @ 0.9 | **unchanged, stays green** |
| `flags proto drift` (`package:acme.events`, 2 repos)                                                  | 2 ≤ 2 → not suppressed → still 1 edge @ 0.4        | **unchanged, stays green** |
| `scores OpenAPI client coverage inclusively`                                                          | signal 3 untouched                                 | **unchanged, stays green** |
| `EVIDENCE_PASSES` order test (`['manifest','endpoint','grpc','schema','compose','topic']`)            | pass registration untouched                        | **unchanged**              |

No existing assertion flips. All new behaviour is covered by **new** tests (spec proof
gate a–d). `grpc-pass.test.ts`, `deterministic-correlator.test.ts`,
`multi-repo-correlation.integration.test.ts`, `grpc-correlation.integration.test.ts` do
not exercise the identical-multi-service-copy path and are expected untouched — verified
by running the full importer suite.

## D9 — Eval & live proof

- `packages/analysis-runner-local/eval` scores connections against
  `eval/golden/online-boutique/ground-truth.json`; `TOLERANCE = 0.05`, 3 runs,
  deterministic (`connectionsRecallStddev` currently 0 on online-boutique).
- Current baseline aggregate: `online-boutique` `connectionsPrecision 0.667 / recall 1.0 /
grpcServicesF1 0.833`; `fixtures` `connectionsPrecision 0.822 / recall 0.933`.
- After the change: expect `online-boutique` `connectionsPrecision ≈ 0.93 / recall 1.0`,
  gRPC edges unchanged; `fixtures` connection metrics within `TOLERANCE` of baseline
  (the `fixtures` set has no multi-service vendored contract, so ≈ no change).
- Regenerate `eval/baseline.json` for `online-boutique` only; leave `fixtures` at its
  committed values if they hold (mirrors 010's handling).
- Live: 3 deterministic runs via `pnpm --filter @arch-atlas/analysis-runner-local eval
--set online-boutique --runs 3` against local oMLX. `schemaPass` itself is model-free;
  the run still exercises the per-repo analysis → correlation → score pipeline end to end.

## D10 — Constitution check

- **III TDD**: new tests (a–d) written and failing before the `schemaPass` edit; importer
  suite kept green. ✓
- **≥ 80 % coverage**: change is ~30 lines in one exported function plus two constants and
  one helper; new unit tests cover every branch (0-service / 1-owner / no-owner / ≥2-owner
  / package > 2). ✓
- **II type safety**: no `any`; reuses typed `SchemaDigest` / `RepoEvidence`. ✓
- **I boundaries**: change confined to `src/correlate/`; no new cross-package import. ✓
- **V supply chain**: no dependency change. ✓
- **IV security**: no new external surface; deterministic literal analysis only. ✓

No violations → Complexity Tracking table stays empty.
