# Phase 1 Data Model: gRPC-Aware Cross-Repository Correlation

No persisted artifact changes. All types below are **in-memory** contracts inside
`apps/llm-importer/src/correlate/**` (plus one optional field read by `src/review/assemble-review.ts`).

---

## New type: `GrpcClientRef`

`src/correlate/evidence/types.ts`

```ts
export interface GrpcClientRef {
  /** File path relative to the repo root. */
  relPath: string;
  /** 1-indexed line of the construction site. */
  line: number;
  /** Service name exactly as captured from source (may be package-qualified,
   *  may or may not carry a trailing "Service"). Normalization happens at
   *  match time in grpcPass, never here — tests assert on the raw capture. */
  service: string;
  /** Which language form matched — for evidence text and debugging. */
  form: 'go' | 'csharp' | 'node' | 'python' | 'java' | 'generic';
}
```

**Validation rules**:

- `relPath` non-empty, `/`-separated, repo-relative (guaranteed by `collect.ts`).
- `line >= 1`.
- `service` matches `/^[A-Za-z_][\w.]*$/` (identifier, optionally dotted). Refs failing this are not
  emitted by the parser.
- `form` is one of the six literals.

---

## Modified type: `RepoEvidence`

`src/correlate/evidence/types.ts` — two additive fields, both always present (default `[]`):

```ts
export interface RepoEvidence {
  // ...unchanged fields: name, root, manifests, composeFiles, schemaDigests,
  //    endpointNodes, topicRefs, urlLiterals ...

  /** gRPC services this repo *serves*. Union of:
   *  - graph `endpoint:grpc:*` node names (from analysis.served.grpcServices via the adapter)
   *  - `service:<Name>` identifiers from this repo's `.proto` schema digests
   *  De-duplicated, sorted. Empty when the repo serves no gRPC. */
  grpcServices: string[];

  /** gRPC client/stub construction sites found in this repo's source.
   *  Collection order = collect.ts sorted-walk order, then line order.
   *  Empty when the repo's source is unavailable or has no gRPC clients. */
  grpcClientRefs: GrpcClientRef[];
}
```

**Population** (`src/correlate/evidence/collect.ts`, inside `collectRepoEvidence`):

- `grpcClientRefs`: in the existing `if (CODE_EXTENSIONS.has(ext))` branch, append
  `extractGrpcClientRefs(rel, content)` alongside the existing `extractUrlLiterals` /
  `extractTopicRefs` calls.
- `grpcServices`: after the walk loop —
  `[...new Set([ ...graph.nodes.filter(n => n.type === 'endpoint' && n.id.startsWith('endpoint:grpc:')).map(n => n.name), ...evidence.schemaDigests.flatMap(d => d.identifiers.filter(id => id.startsWith('service:')).map(id => id.slice('service:'.length))) ])].sort()`.
- When `resolveRepoRoot` returns `null` (source not on disk), `grpcClientRefs` stays `[]` and
  `grpcServices` still gets the graph-node contribution (the early `return evidence` path must be
  updated to populate `grpcServices` from the graph before returning).

---

## Modified type: `CrossRepositoryConnection`

`src/correlate/deterministic-correlator.ts` — one additive optional field:

```ts
export interface CrossRepositoryConnection {
  // ...unchanged: sourceRepo, sourceNodeId, targetRepo, targetNodeId, type, foundBy, evidence, weight ...

  /** Set to 'grpc' only by grpcPass. Consumed only by assemble-review.ts to
   *  pick candidate type 'grpc' instead of the generic 'http'. Not persisted. */
  transport?: 'grpc';
}
```

`dedupeConnections` merges on the existing `${sourceRepo}|${targetRepo}|${type}` key; when the
kept connection came from `grpcPass` it retains `transport: 'grpc'`. (If a future overlap merged a
non-gRPC `calls` connection over a gRPC one at higher weight, `transport` would be dropped — acceptable
and vanishingly unlikely; `grpcPass` weight 0.8 ties/loses only to an exact-HTTP 0.85, and an
HTTP-literal match to the same repo pair is itself meaningful.)

---

## Entity relationships (conceptual)

```text
RepoAnalysis.served.grpcServices ──(to-correlation-graph.ts, unchanged)──▶ endpoint:grpc:* nodes
                                                                                │
repo/*.proto ──(schemas.ts protoIdentifiers, unchanged)──▶ SchemaDigest.identifiers["service:X"]
                                                                                │
                                          collect.ts (MODIFIED) ───────────────┤
                                                                                ▼
                                                            RepoEvidence.grpcServices: string[]
repo/*.{go,cs,js,ts,py,java,...} ──(grpc.ts extractGrpcClientRefs, NEW)──▶ RepoEvidence.grpcClientRefs

           grpcPass(NEW): for each caller ref, normalize service name,
           look up repos whose grpcServices contain a normalized match, C !== P
                                                                                ▼
                              CrossRepositoryConnection { type:'calls', foundBy:'evidence',
                                                          transport:'grpc', weight:0.8|0.7|0.45 }
                                                                                ▼
                    dedupeConnections ▶ deterministic-correlator ▶ assemble-review.ts
                                          (MODIFIED: transport 'grpc' ⇒ candidate.type 'grpc')
                                                                                ▼
                                          ReviewFile.candidates[].type = 'grpc'  (already supported)
                                                                                ▼
                              diagram-builder.ts (UNCHANGED: grpc ⇒ relationship 'calls')
```

## State / lifecycle

None. The pass is a pure function of its `CorrelationInput`; no persistence, no caching, no mutation
of inputs.
