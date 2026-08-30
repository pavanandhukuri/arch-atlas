# Contract: `grpcPass` (in `evidence-passes.ts`)

## Signature

```ts
export const grpcPass: EvidencePass;
// EvidencePass = (input: CorrelationInput) => PassResult
// CorrelationInput = { repos: RepoEvidence[]; graphsByName: Map<string, RepositoryKnowledgeGraph> }
// PassResult      = { pass: string; connections: CrossRepositoryConnection[]; notes: string[] }
```

`pass` field value: `"grpc"`.

## Algorithm

1. Build `servedByRepo: Array<{ repo: RepoEvidence; byNorm: Map<string, string> }>` where `byNorm`
   is normalized-service-name → a human-readable raw name. `byNorm` is **not** a verbatim map of
   `repo.grpcServices` — it is the _credibly served_ set (`servedGrpcServices`, research.md D11),
   built from three signals so a single over-broad `served.grpcServices` from the analysis step
   cannot turn one repo into a false callee for the whole workspace:
   - **implicit from the repo name** — a repo whose normalized name is `<x>service` is presumed to
     serve `<X>Service` (raw label: `"<X>Service (inferred from repo name)"`);
   - **a sole-service `.proto`** in the repo's tree (exactly one `service` in one `.proto` digest);
     a multi-service vendored `demo.proto` is ignored;
   - **`analysis.served.grpcServices`**, but only entries whose normalized name **exactly** equals
     the normalized repo name or a sole-proto service name.
     Analysis entries are added first (so a real, possibly package-qualified, raw name wins the label
     slot), then sole-proto, then the implicit fallback. Repos with nothing credible contribute an
     empty `byNorm` (still listed, so `C === P` checks are trivial).
2. For each `caller` in `input.repos`, for each `ref` in `caller.grpcClientRefs`:
   a. `n = normalizeServiceName(ref.service)`; skip if `n.length < 2`.
   b. `hits = servedByRepo.filter(s => s.repo !== caller && s.byNorm.has(n))`.
   c. If `hits.length === 0`: continue (FR-007 — never invent a target).
   d. `weight = ref.form === 'generic' ? 0.7 : 0.8`.
   e. If `hits.length > 1`: `weight = Math.min(weight, 0.45)` and push a note
   `` `${caller.name}/${ref.relPath}:${ref.line} constructs a "${ref.service}" gRPC client matching services in ${hits.length} repos (${names}) — demoted` ``.
   f. For each `hit`: push a connection (see shape below).
3. Return `{ pass: 'grpc', connections: dedupeConnections(connections), notes }`.

## Connection shape

```ts
{
  sourceRepo: caller.name,
  sourceNodeId: fileNodeId(graphsByName, caller.name, ref.relPath),   // same helper endpointPass uses
  targetRepo: hit.repo.name,
  targetNodeId: grpcEndpointNodeId(graphsByName, hit.repo.name, rawServed) ?? moduleNodeId(graphsByName, hit.repo.name),
  type: 'calls',
  foundBy: 'evidence',
  transport: 'grpc',
  evidence: [
    `${caller.name}/${ref.relPath}:${ref.line} constructs a ${ref.form} gRPC client for "${ref.service}", matching ${hit.repo.name}'s served gRPC service "${rawServed}"`
  ],
  weight,
}
```

`grpcEndpointNodeId` = find the `hit.repo` graph node with `type === 'endpoint'` and
`id === 'endpoint:grpc:' + rawServed` (the raw served name that normalized-matched); fall back to the
module node when the served name came only from a `.proto` `service:` id (no matching graph node).

## Guarantees

| #   | Guarantee                                                                                         | Maps to                                    |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| G1  | No connection where `sourceRepo === targetRepo`.                                                  | FR-008, Edge Case "same repo"              |
| G2  | No connection when no repo serves a matching service.                                             | FR-007, AS-3                               |
| G3  | Direction is always caller→callee, `type: 'calls'`.                                               | FR-005                                     |
| G4  | Every connection has ≥ 1 evidence string containing `relPath`, `:line`, and the service name.     | FR-010, SC-005/006                         |
| G5  | Multi-repo match ⇒ every resulting connection `weight ≤ 0.45` + a note.                           | FR-009, AS-4                               |
| G6  | Repeated refs for the same `(caller, callee)` ⇒ exactly one connection after `dedupeConnections`. | FR-014, Edge Case "multiple constructions" |
| G7  | Pure function; identical input ⇒ identical ordered output.                                        | FR-012, SC-004                             |
| G8  | Reads only `input`; never touches the filesystem or a model.                                      | FR-017                                     |
| G9  | Does not read or mutate any field the other passes produce.                                       | FR-013                                     |

## Registration

`evidence-passes.ts`:

```ts
export const EVIDENCE_PASSES: EvidencePass[] = [
  manifestPass,
  endpointPass,
  grpcPass,
  schemaPass,
  composePass,
  topicPass,
];
```

`deterministic-correlator.ts` `runEvidencePasses` iterates `EVIDENCE_PASSES` and already emits a
`"grpc: N connection(s)"` summary line — satisfies FR-015 with no other change.

## Test matrix (grpc-pass.test.ts)

- Single caller ref + single served match → one directed connection, weight 0.8, `foundBy 'evidence'`,
  `transport 'grpc'`, evidence text asserts file/line/service.
- Served name only from `.proto` `service:` id (no graph node) → `targetNodeId === moduleNodeId(...)`.
- `ref.form === 'generic'` → weight 0.7.
- Caller also serves the same service (`C === P`) → no connection (G1).
- Referenced service served by nobody → no connection, no note (G2).
- Two repos serve `PaymentService`, caller constructs a `PaymentService` client → two connections,
  both weight ≤ 0.45, one note naming both repos (G5).
- Caller constructs the same client in 3 files → one connection after dedupe, evidence merged ≤ 3 (G6).
- Two runs over the same `CorrelationInput` → `JSON.stringify` equal (G7).
- Package-qualified served (`hipstershop.CartService`) vs bare Go stub (`NewCartServiceClient`) → match.
