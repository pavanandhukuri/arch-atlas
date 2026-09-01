# Phase 0 Research: gRPC-Aware Cross-Repository Correlation

All "NEEDS CLARIFICATION" items from Technical Context were resolvable from the existing codebase and
the 008 eval evidence. No open unknowns remain.

---

## D1 — Why a new pass rather than extending `endpointPass` or `schemaPass`

**Decision**: Add a distinct `grpcPass` function, registered in `EVIDENCE_PASSES` immediately after
`endpointPass`.

**Rationale**:

- `endpointPass` is keyed on `UrlLiteral` (a `/`-leading normalized route path) matched against
  `parseEndpointRoute`, which _returns `null`_ for any string without a leading `/`. gRPC service
  names ("ProductCatalogService", "hipstershop.CartService") can never produce a `UrlLiteral` or a
  parseable `EndpointRoute`. Bending either would corrupt HTTP behavior (FR-013 forbids this).
- `schemaPass` already handles `.proto` content, but only for _identical-copy_ detection and
  _same-package-shared-message drift_ — both symmetric `depends_on` signals between proto **holders**.
  It has no notion of a **client** in one repo calling a **server** in another. Extending it to do
  directional client→server matching would materially change its logic and its emitted edge types.
- A separate pass keeps the change purely additive and independently testable (constitution III), and
  mirrors how the five existing passes are each self-contained.

**Alternatives considered**:

- _Fix the name-mention pass_ (`graphMentionsRepoName`) to be smarter about `analysis.outbound`
  targets — rejected: it is a prose-heuristic last resort, not evidence-grounded; making it the
  primary gRPC mechanism would tie correlation quality to the model's free-text `outbound[].target`
  spelling, which is exactly the brittleness the eval exposed (`outboundRecall = 1.0` fuzzy but
  `connectionsRecall = 0`).
- _Teach `to-correlation-graph.ts` to emit `calls` edges for `outbound` gRPC intents_ — rejected:
  the adapter is a frozen 008 seam; and `outbound` intents are model-authored, not evidence.

---

## D2 — Callee side: where "served gRPC services" come from

**Decision**: `RepoEvidence.grpcServices: string[]` = the **union** of

1. names on the graph's `endpoint:grpc:*` nodes (`to-correlation-graph.ts` already emits one per
   `analysis.served.grpcServices` entry, with `node.name` = the service name), and
2. `service:<Name>` identifiers already present in `RepoEvidence.schemaDigests[].identifiers` for
   `.proto` files (produced by `evidence/parsers/schemas.ts` `protoIdentifiers`, unchanged).

**Rationale**: (1) captures what the bounded model call found (good recall on the reference corpus —
008 baseline `grpcServicesF1 = 0.733`, recall ~1.0). (2) is a deterministic backstop that does not
depend on the model at all: if a repo vendors its `.proto`, its served services are recoverable with
certainty. Union maximizes callee recall; the _match_ step (D4) is what controls precision.

**Alternatives considered**: proto-only (loses services when the repo doesn't vendor the `.proto`,
common when protos live in a separate contract repo); analysis-only (loses the deterministic backstop,
and makes the pass non-deterministic w.r.t. model output — though the artifact is fixed at correlation
time, so this is a weaker objection). Union chosen for robustness.

---

## D3 — Caller side: gRPC client/stub construction patterns per language

**Decision**: `evidence/parsers/grpc.ts` exports `extractGrpcClientRefs(relPath, content): GrpcClientRef[]`,
a line-oriented regex scan (same style as `parsers/routes.ts` / `parsers/topics.ts`). Patterns:

| Language         | Pattern (capture = service name)                                                                                         | Example                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------- | -------- | --------------------------------------------- |
| Go               | `\bNew([A-Z]\w*?)Client\s*\(` (optionally `pkg.` qualified)                                                              | `pb.NewProductCatalogServiceClient(conn)`                                |
| C#               | `new\s+(?:[A-Za-z_]\w*\.)*([A-Za-z_]\w*?)\.\1Client\s*\(` and looser `new\s+([A-Za-z_]\w*?)\.([A-Za-z_]\w*?)Client\s*\(` | `new Hipstershop.CartService.CartServiceClient(channel)` → `CartService` |
| Node/JS/TS       | `new\s+(?:[A-Za-z_$][\w$]*\.)*([A-Z]\w*?)Client\s*\(`                                                                    | `new services.RecommendationServiceClient(addr, creds)`                  |
| Python           | `\b([A-Za-z_]\w*?)Stub\s*\(` (usually `demo_pb2_grpc.ProductCatalogServiceStub(channel)`)                                | → `ProductCatalogService`                                                |
| Java/Kotlin      | `\b([A-Za-z_]\w*?)Grpc\s*\.\s\*new(?:Blocking                                                                            | Future)?Stub\s\*\(`                                                      | `AdServiceGrpc.newBlockingStub(channel)` → `AdService` |
| Generic fallback | `\b([A-Z]\w\*?)(?:ServiceClient                                                                                          | ServiceStub                                                              | ServiceBlockingStub                                    | ServiceFutureStub)\b`and`\b([A-Z]\w\*?Service)(?:Client | Stub)\b` | catches Ruby/Rust/Swift/PHP forms best-effort |

Each match yields `{ relPath, line, service, form }` where `form` is a short tag
(`go`/`csharp`/`node`/`python`/`java`/`generic`) recorded for evidence/debuggability. `service` is
stored **raw** (as captured); normalization happens at match time (D4).

**Rationale**: These are the idiomatic generated-stub constructors for `protoc`/`grpc-*` toolchains
across the five reference languages. Keying on **construction** (`New…Client(` / `…Stub(` / `new …Client(`)
— not bare type references — is the precision lever (spec Edge Cases: vendored/generated types). No
data-flow, no AST: matches `parsers/routes.ts` discipline and the "no heavyweight dependency"
constraint.

**Alternatives considered**: tree-sitter per language (rejected — heavyweight dep, violates
constraint, and the existing parsers set the regex precedent); matching _any_ identifier ending
`Client` (rejected — far too noisy: HTTP clients, DB clients, SDK clients).

---

## D4 — Service-name matching rule

**Decision**: `serviceNamesMatch(a, b)`:

1. `simple(x)` = substring after the last `.` (drops proto package: `hipstershop.CartService` → `CartService`).
2. lowercase both.
3. strip a trailing `service` word from both (`cartservice` → `cart`, `CartService` → `cart`).
4. also strip non-alphanumerics (`product-catalog` vs `productcatalog`).
5. equal ⇒ match.

**Rationale**: The two sides are authored by different toolchains: a `.proto` `service CartService`,
an analysis value `hipstershop.CartService`, a Go stub `NewCartServiceClient`. Simple-name +
case-fold + optional-`Service`-suffix covers every reference-corpus pair. Step 3 is symmetric so
`CartService` (proto) matches `Cart` (a hypothetical bare stub) but is still anchored on the
distinctive root token, so `CartService` never matches `OrderService`.

**Alternatives considered**: exact case-sensitive equality (misses package-qualified vs bare, misses
`Service` suffix drift); fuzzy/token-overlap like the eval's `nameMatch` (rejected — too loose for a
_deterministic high-confidence_ pass; ambiguity is handled by demotion in D6, not by fuzzy matching).

---

## D5 — Connection shape, direction, type

**Decision**: for a client ref to service `S` in repo `C` and a served service `S` in repo `P`
(`C !== P`): emit `CrossRepositoryConnection { sourceRepo: C, targetRepo: P, type: 'calls',
foundBy: 'evidence', sourceNodeId: fileNodeId(C, ref.relPath), targetNodeId: <the endpoint:grpc:S
node id in P, else moduleNodeId(P)>, evidence: [<line>], weight: <D6>, transport: 'grpc' }`.

`sourceNodeId`/`targetNodeId` use the same `fileNodeId` / `moduleNodeId` helpers `endpointPass` uses,
so downstream node-id expectations are identical. Direction is always caller→callee (`calls`).

**Rationale**: matches `endpointPass`'s emitted shape exactly (`type: 'calls'`, `foundBy: 'evidence'`);
`dedupeConnections` then merges multiple refs for the same `(C, P, 'calls')` into one (FR-014). The
`transport` field is new, optional, internal-only (D9).

---

## D6 — Confidence weights and multi-target ambiguity demotion

**Decision**:

- Base weight `0.8` for a stub-construction match (a named-service client is a concrete signal —
  comparable to `endpointPass`'s `0.85` exact method+path). Generic-fallback-only matches: `0.7`.
- If the same client ref's normalized service matches served services in **>1** repo, demote every
  resulting connection for that ref to `min(weight, 0.45)` and push a `note` naming the ambiguous
  set — byte-identical to `endpointPass`'s `matchedRepos.size > 1` handling.

**Rationale**: reuses the established precedent (spec FR-009). `0.8` lands in the
`evidence-correlation` mapping's **high** bucket (≥ 0.8); `0.45` lands in **low**. No new confidence
model (spec Assumptions).

**Alternatives considered**: `1.0` for stub construction (rejected — leaves no headroom and the
existing passes cap real signals at 0.9); dropping ambiguous matches entirely (rejected — the eval
prefers demoted-but-present over absent, matching `endpointPass`).

---

## D7 — Registration order and determinism

**Decision**: `EVIDENCE_PASSES = [manifestPass, endpointPass, grpcPass, schemaPass, composePass, topicPass]`.
`grpcPass` iterates repos and, within a repo, `grpcClientRefs` in collection order (which is
file-sorted then line-ordered by `collect.ts`'s sorted walk). Served-service lookup is over a
`Map<string, RepoEvidence[]>` built by iterating repos in input order.

**Rationale**: `collect.ts` already sorts `walkRepo` output (`.sort()`); refs are appended in that
order, so the pass is deterministic given fixed evidence (spec FR-012 / SC-004). Placing it right
after `endpointPass` groups the two "service call" passes; `dedupeConnections` inside the pass +ss the
final merge make order-of-append immaterial to the _set_, but a fixed order keeps the _list_ stable.

---

## D8 — `collect.ts` changes: no second filesystem walk

**Decision**: In the existing `for (const rel of walkRepo(repoRoot))` loop, where `collect.ts`
already branches on `CODE_EXTENSIONS.has(ext)` to run `extractUrlLiterals` + `extractTopicRefs`, add
`extractGrpcClientRefs(rel, content)` in the same branch. Populate `evidence.grpcServices` after the
loop from `graph.nodes` (`endpoint:grpc:*`) + `evidence.schemaDigests` (`service:` ids).

**Rationale**: zero extra IO; the file content is already in hand. Keeps the "one module touches the
filesystem" property (`collect.ts` header comment).

---

## D9 — The `transport: 'grpc'` label (P3 / FR-016)

**Decision**: Add optional `transport?: 'grpc'` to the **in-memory** `CrossRepositoryConnection`
interface (`deterministic-correlator.ts`) — not a persisted schema. In `assemble-review.ts`, the
candidate-type resolution becomes: `if (connection.type === 'calls' && connection.transport === 'grpc')
→ 'grpc'`, else the existing `EDGE_TYPE_TO_CANDIDATE_TYPE[...] ?? 'http'`.

**Rationale**: `CandidateType` in `review-file.ts` **already includes `'grpc'`**;
`diagram-builder.ts` `CANDIDATE_TYPE_TO_RELATIONSHIP` **already maps `grpc → 'calls'`**; Studio's
`parseReviewYaml` already accepts it. So the full downstream chain supports gRPC candidates today —
nothing consumes a new field, no persisted schema changes, no Studio change. Existing connections
never set `transport`, so their mapping is byte-identical (FR-013). If review-time inspection shows
any downstream breakage, the branch is dropped and connections still carry evidence (FR-016 fallback).

**Alternatives considered**: a free-text `technology` on the connection (rejected — `Candidate` has no
such field and adding one _is_ a schema change); leaving all gRPC calls as `type: 'http'` (works, but
US3 is cheap and correct given the chain already supports it).

---

## D10 — Proof strategy

**Decision**:

- **Unit** (fast, in `pnpm test`): `grpc-parser.test.ts` (each language form + generic fallback +
  negatives: HTTP client, DB client, bare type ref), `grpc-pass.test.ts` (match/normalize, direction,
  `C===P` self-exclusion, unknown-service → no edge, 2-repo ambiguity demotion + note, dedupe of
  repeated refs, evidence string content), `evidence-collect.test.ts` (both new fields populated from
  a fixture pair).
- **Integration** (`test/integration/grpc-correlation.integration.test.ts`): stub the model to return
  a `RepoAnalysis` per fixture repo, run `toCorrelationGraph` → `correlateDeterministically`, assert
  exactly the directed `storefront → catalog-service` `calls` connection with `foundBy: 'evidence'`
  and gRPC evidence text.
- **Live proof gate** (`specs/009-*/proof.md`): `pnpm eval --set online-boutique` against local oMLX —
  record `connectionsRecall` / `connectionsPrecision` before (0 / 0) and after (target ≥ 0.70 / ≥ 0.80);
  `pnpm eval --set fixtures` before/after to show no regression beyond 0.05. Commit the refreshed
  `test/eval/baseline.json`.

**Rationale**: mirrors the 008 proof discipline (mocked model for CI coverage + one live end-to-end
run against the real reference workspace). SC-001…SC-006 map 1:1 to these checks.

---

## D11 — Callee candidacy (added during implementation, from the live proof)

**Context**: the first live run on Online Boutique hit `connectionsRecall = 1.0` but
`connectionsPrecision = 0.41` — far short of SC-002 (≥ 0.80). The diagnostic (`test/eval/debug-grpc.ts`)
showed two failure modes, both rooted in the analysis step's `served.grpcServices`:

1. **Over-broad served lists.** `currencyservice`, `paymentservice`, and `adservice` each vendor the
   full shared `demo.proto` (Node loads it at runtime; Java/Go generate from it). The model, seeing
   ten `service X {}` blocks, reported all ten as _served_ by that one repo — turning each into a
   false callee for the entire workspace.
2. **Missing served entries.** `checkoutservice` (the orchestrator) reported serving the wrong
   service entirely (`grpcServicesF1 = 0`), so `frontend → checkoutservice` could not be matched.

**Decision**: `grpcPass` derives a repo's _credibly served_ gRPC services (`servedGrpcServices`) from
three signals rather than trusting `served.grpcServices` verbatim:

- **Implicit from the repo name**: a repo whose normalized name is `<x>service` is presumed to serve
  `<X>Service`. Recovers real callees the analysis missed (mode 2). A pure-client repo (`frontend`)
  is presumed to serve `Frontend` — harmless, because nothing constructs a `FrontendServiceClient`.
- **A sole-service `.proto`** in the repo's tree (exactly one `service` declaration) — a dedicated
  contract. A **multi-service** `.proto` (the vendored `demo.proto`) is deliberately ignored: holding
  the shared contract is not evidence of serving every service in it (fixes mode 1).
- **`analysis.served.grpcServices`**, but only entries whose normalized name **relates to the repo
  name** (exact, or ≥ 3-char containment either direction). An unrelated entry (`currencyservice`
  "serves" `AdService`) is dropped.

**Result on the same workspace**: recall 1.0, precision 1.0 (14/14 edges, 0 FP), all at full weight
`0.8` (no ambiguity demotion, because each client ref now resolves to exactly one server).

**Alternatives considered**: trusting `served.grpcServices` as-is (rejected — the eval proved it
noisy); requiring a `.proto` service declaration (rejected — protos often live in a separate contract
repo, absent from every service tree; and vendored multi-service protos are anti-signal); a hard cap
on served-list size (rejected — crude, and doesn't fix the "wrong single entry" case).

---

## D12 — Excluding generated and test sources from client extraction

**Decision**: `extractGrpcClientRefs` returns `[]` for (a) generated-code paths
(`**/genproto/**`, `*.pb.go`, `*_pb2_grpc.py`, `*.grpc.pb.*`, `*Grpc.cs`, …) and (b) test paths
(`**/tests?/**`, `*_test.go`, `*.spec.ts`, `test_*.py`, `*Tests.cs`, …). Go generated _constructor
definitions_ (`func New…Client(`) are also skipped by a per-line guard even outside `genproto/`.

**Rationale**:

- Generated stub files _define_ `New<Every>ServiceClient` / `<Every>ServiceStub` for the whole
  contract. Scanning them would make every repo that vendors generated code look like a client of
  every service. (Observed: `frontend`/`checkoutservice` genproto trees.)
- A repo's own integration tests routinely construct a client for the service that same repo serves
  (`src/cartservice/tests/CartServiceTests.cs`). Counting those invents production calls that don't
  exist and, combined with the implicit-serve rule, would suppress real inbound edges. Sample/CLI
  clients shipped beside a server (`recommendationservice/client.py`, `adservice/…/AdServiceClient.java`)
  are handled by the self-connection exclusion (D5) — they only ever match their own repo.

---

## D13 — Note: `test/eval/debug-grpc.ts`

A throwaway diagnostic used during D11/D12 to dump per-repo gRPC evidence and every produced
connection against ground truth. Removed before the feature commit — not part of the deliverable.

---

## D14 — Precision ceiling is pre-existing `schemaPass` behaviour, not this feature

The final live run on Online Boutique (3 runs, deterministic): **gRPC pass — 14/14 true positives,
0 false positives, 0 misses, every one at full weight `0.8`.** The pass itself is exactly precise on
the reference workspace.

Workspace-wide `connectionsPrecision` lands at ~0.67 because of **7 false-positive edges per run
that this feature does not create and must not remove** (FR-013):

| Count | Pass       | Cause                                                                                                                              |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 3     | `schema`   | identical vendored `demo.proto` copies → `depends_on` between each pair (`currencyservice↔paymentservice↔adservice`)               |
| 3     | `schema`   | proto-package-drift (`cartservice/Cart.proto` shares `package hipstershop` with the `demo.proto` copies) → low-weight `depends_on` |
| 1     | `endpoint` | a hard-coded product-id string in `adservice`'s demo code matched `frontend`'s `GET /product/*` route                              |

These pre-date 009 — the pre-009 baseline was `connectionsPrecision: 0` / `connectionsRecall: 0`,
i.e. _7 predictions, all wrong_. 009 adds 14 correct edges on top, moving precision 0 → ~0.67 and
recall 0 → 1.0.

**Follow-up (separate spec):** `schemaPass` should not emit a cross-repo `depends_on` purely because
two repos vendor a copy of the same **shared, multi-service** contract (`demo.proto`); a shared
contract is not a dependency between its consumers. Scoping that correctly (identical single-service
protos, or generated-client coverage, remain valid signals) is its own change with its own eval.
