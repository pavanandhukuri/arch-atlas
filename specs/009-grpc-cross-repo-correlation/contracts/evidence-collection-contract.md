# Contract: `evidence/collect.ts` additions

Only additive changes. No existing behaviour, output field, or ordering changes.

## `collectRepoEvidence(graph)` — new outputs

The returned `RepoEvidence` gains two always-present fields:

### `grpcClientRefs: GrpcClientRef[]`

- Populated inside the existing walk loop, in the branch already guarded by
  `CODE_EXTENSIONS.has(path.extname(rel).toLowerCase())`, by appending
  `extractGrpcClientRefs(rel, content)` next to the existing `extractUrlLiterals` /
  `extractTopicRefs` calls.
- Order: `walkRepo` already returns a sorted path list; refs are appended per file, each file's refs
  in ascending line order ⇒ stable overall order.
- `[]` when `resolveRepoRoot(graph) === null` (source not on disk) or no gRPC clients found.

### `grpcServices: string[]`

Computed once, after the walk loop (and also on the early-return path when the root is unavailable):

```
grpcServices = unique_sorted(
  graph.nodes
    .filter(n => n.type === 'endpoint' && n.id.startsWith('endpoint:grpc:'))
    .map(n => n.name)
  ∪
  evidence.schemaDigests
    .flatMap(d => d.identifiers)
    .filter(id => id.startsWith('service:'))
    .map(id => id.slice('service:'.length))
)
```

- The `graph.nodes` contribution is available even with no repo root, so the early-return branch must
  set `grpcServices` (from `graph.nodes` only) before `return evidence`.
- The `schemaDigests` contribution requires the walk (proto files), so it is only present on the
  normal path — acceptable (D2: union for recall, match step controls precision).

## Invariants preserved

- `collect.ts` remains the only correlation module that performs filesystem IO.
- The FR-015 secret-path exclusion (`matchesSecretPattern`) still gates every path before read; the
  new parser receives only already-permitted content.
- All existing `RepoEvidence` fields (`manifests`, `composeFiles`, `schemaDigests`, `endpointNodes`,
  `topicRefs`, `urlLiterals`, `root`, `name`) are byte-identical to before.
- `collectEvidence(graphs)` signature unchanged.

## Test matrix (evidence-collect.test.ts — additions)

- A fixture repo whose graph has `endpoint:grpc:CatalogService` and whose tree has a `.proto` with
  `service CatalogService` → `grpcServices === ['CatalogService']` (union de-duplicated).
- A fixture repo with a Go file containing `pb.NewCatalogServiceClient(conn)` →
  `grpcClientRefs` has one entry with `form: 'go'`, correct `relPath`/`line`/`service`.
- A repo with no gRPC anywhere → both fields `=== []` (not `undefined`).
- Root unavailable (graph `repository.path` points nowhere) → `grpcClientRefs === []`,
  `grpcServices` still reflects `endpoint:grpc:*` nodes.
