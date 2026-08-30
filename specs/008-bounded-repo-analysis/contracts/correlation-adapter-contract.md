# Contract: `toCorrelationGraph(analysis) → RepositoryKnowledgeGraph`

**Applies to**: `src/analysis/to-correlation-graph.ts`.

**Purpose**: the single seam that lets every module under `src/correlate/` stay
byte-for-byte unchanged while the persisted artifact is the new `RepoAnalysis`
shape. The adapter's output is the in-memory `RepositoryKnowledgeGraph`
(`src/graph/schema.ts`) the 007 correlator already consumes.

## Field mapping

| `RepoAnalysis`             | → `RepositoryKnowledgeGraph`                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`            | `'1.0'` (literal)                                                                                                                                                                                                                                   |
| `analyzedAt`               | `analyzedAt` (passthrough)                                                                                                                                                                                                                          |
| `repository`               | `repository` (passthrough — `{ name, path, description? }`)                                                                                                                                                                                         |
| `analysisStatus`           | `analysisStatus` (passthrough)                                                                                                                                                                                                                      |
| `retryCount`               | `retryCount` (passthrough)                                                                                                                                                                                                                          |
| — (always)                 | `nodes += { id: "module:"+name, type: "module", name, summary: description }`                                                                                                                                                                       |
| `served.httpRoutes[i]`     | `nodes += { id: "endpoint:"+label, type: "endpoint", name: label, filePath?, summary: "" }` — see §Endpoint format                                                                                                                                  |
| `served.grpcServices[i]`   | `nodes += { id: "endpoint:grpc:"+svc, type: "endpoint", name: svc, summary: "gRPC service" }`                                                                                                                                                       |
| `served.datastores[i]`     | `nodes += { id: "table:"+name, type: "table", name, summary: kind ?? "" }`                                                                                                                                                                          |
| `served.topics[i]`         | `nodes += { id: "resource:"+name, type: "resource", name, summary: direction }`                                                                                                                                                                     |
| `outbound[i]`              | `edges += { source: "module:"+name, target: extId(target), type: verb, weight: confidence ?? 0.5, description: detail }` and, if `extId(target)` isn't already a node, `nodes += { id: extId(target), type: "service", name: target, summary: "" }` |
| `languages` / `frameworks` | not represented (export-only, research.md D6)                                                                                                                                                                                                       |

`extId(t)` = `"service:" + t` (stable, collision-safe within one graph).

## Endpoint format (pins research.md D5)

`label` for an `HttpRoute`:

- method known: `` `${method.toUpperCase()} ${normPath(path)}` `` → e.g. `"POST /v1/send"`
- method absent: `normPath(path)` → e.g. `"/v1/send"`

`normPath` collapses duplicate slashes and strips a trailing slash (except root).
This must round-trip through `parseEndpointRoute` (`evidence/parsers/routes.ts`):
`parseEndpointRoute({ name: label, id: "endpoint:"+label, ... })` returns
`{ method?, path }` equal to the input.

## Invariants (asserted by tests)

1. Output validates against `RepositoryKnowledgeGraphSchema` (`.parse`, not `.safeParse`, in prod).
2. Exactly one `type: "module"` node.
3. One `type: "endpoint"` node per `served.httpRoutes` entry, each parseable by `parseEndpointRoute` back to the original method/path.
4. No `GraphEdge` references a node id absent from `nodes` (adapter adds the synthetic `service:` target node whenever it emits an edge).
5. `edge.weight ∈ [0, 1]`; default `0.5` when `outbound[i].confidence` is absent.
6. Empty `served.*` and empty `outbound` ⇒ a graph with just the `module` node and no edges — valid, correlator-safe (US1 scenario 4).
7. Deterministic: same `RepoAnalysis` in ⇒ identical graph out (stable node ordering: module first, then httpRoutes, grpc, datastores, topics, then outbound-target nodes in `outbound` order).

## Downstream (unchanged) consumers this satisfies

- `evidence/collect.ts`: `graph.nodes.filter(n => n.type === 'endpoint')` → the httpRoute/grpc nodes.
- `evidence-passes.ts` `endpointPass`: `parseEndpointRoute(node)` on those nodes.
- `evidence-passes.ts` `moduleNodeId(...)`: finds the single `module` node.
- `evidence-passes.ts` `fileNodeId(...)`: `graph.nodes.find(n => n.filePath === relPath)` → matches when the model attributed a `filePath`, else falls back to `file:{relPath}` (unchanged behaviour).
- `deterministic-correlator.ts` name-mention pass: reads `edge.description` / target node `name`/`summary` → fed by `outbound[].detail` and the synthetic `service:` target nodes.
- `agentic-correlator.ts` `condenseForPrompt`: reads `service`/`endpoint`/`config` node names + outbound-typed edges → all present.
