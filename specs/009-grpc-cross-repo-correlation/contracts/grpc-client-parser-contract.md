# Contract: `evidence/parsers/grpc.ts`

## Exports

```ts
export function extractGrpcClientRefs(relPath: string, content: string): GrpcClientRef[];

/** Exported for grpcPass and for unit tests. */
export function normalizeServiceName(raw: string): string;
export function serviceNamesMatch(a: string, b: string): boolean;
```

## `extractGrpcClientRefs(relPath, content)`

**Input**: a repo-relative path and the full text of one source file (already read by `collect.ts`
under the FR-015 secret-path exclusions; the parser never touches the filesystem).

**Output**: zero or more `GrpcClientRef`, in ascending `line` order, at most one per
(line, captured-service) pair. Deterministic.

**Recognised construction forms** (capture group = service name, stored raw in `.service`):

| `form`    | Trigger (case-sensitive on the keyword, service token starts uppercase)                                                                                                 | Captured `service`                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `go`      | `New<Name>Client(` optionally preceded by `<pkg>.`                                                                                                                      | `<Name>` (e.g. `ProductCatalogService`) |
| `csharp`  | `new <Ns...>.<Name>.<Name>Client(` (nested-type form) or `new <Name>.<Name2>Client(`                                                                                    | inner type name (e.g. `CartService`)    |
| `node`    | `new <ns...>.<Name>Client(` or `new <Name>Client(`                                                                                                                      | `<Name>`                                |
| `python`  | `<mod>_pb2_grpc.<Name>Stub(` or bare `<Name>Stub(`                                                                                                                      | `<Name>`                                |
| `java`    | `<Name>Grpc.newStub(` / `.newBlockingStub(` / `.newFutureStub(`                                                                                                         | `<Name>`                                |
| `generic` | token `<Name>ServiceClient` / `<Name>ServiceStub` / `<Name>ServiceBlockingStub` / `<Name>ServiceFutureStub`, or `<Name>Service` immediately followed by `Client`/`Stub` | `<Name>Service`                         |

A single site matching more than one form is emitted **once**, with the most specific `form` (order of
the table above; `generic` is last resort).

**MUST NOT emit** for:

- HTTP clients: `new HttpClient(`, `axios.create(`, `new ApolloClient(`, `http.Client{}`.
- Database/SDK clients: `new PrismaClient(`, `redis.createClient(`, `new S3Client(`, `MongoClient(`.
- Bare type references without construction: `var c ProductCatalogServiceClient` (Go decl),
  `import { CartServiceClient } from …`, `: ProductCatalogServiceClient =>` type positions,
  a comment or string literal containing the token.
- A captured name that does not match `/^[A-Za-z_][\w.]*$/`, or that begins `New<Uppercase>`
  (a constructor-name fragment, not a service).
- **Generated-code files** (whole-file skip): `**/genproto/**`, `**/__generated__/**`, `*.pb.go`,
  `*_pb2.py`, `*_pb2_grpc.py`, `*.grpc.pb.*`, `*Grpc.cs`, … — these _define_ `New<Every>Client` /
  `<Every>Stub` for the whole contract. Also a per-line skip of Go generated **definitions**
  (`func New…Client(`) even outside `genproto/`.
- **Test sources** (whole-file skip, research.md D12): `**/tests?/**`, `**/__tests__/**`,
  `**/testdata/**`, `**/e2e/**`, `*_test.go`, `*.test.ts`, `*.spec.ts`, `test_*.py`, `*Tests?.cs` —
  a repo's own tests routinely build a client for the service that repo serves; counting those
  invents production calls and (with the implicit-serve rule) suppresses real inbound edges.
  Sample/CLI clients shipped beside a server are handled by the pass's self-connection exclusion.

**Line counting**: 1-indexed; `content.split('\n')`.

**Bounds**: none beyond the caller's (`collect.ts` caps file size at 1 MiB). The scan is O(lines).

## `normalizeServiceName(raw)`

Pure. `"hipstershop.CartService"` → `"cart"`, `"ProductCatalogService"` → `"productcatalog"`,
`"product-catalog"` → `"productcatalog"`, `"AdService"` → `"ad"`, `"Health"` → `"health"`.

Steps: take substring after last `.`; lowercase; strip trailing `"service"`; remove all
non-`[a-z0-9]`. Never returns `""` for a valid identifier input (if stripping `"service"` empties it,
skip step 3 — `"Service"` alone normalizes to `"service"`).

## `serviceNamesMatch(a, b)`

`normalizeServiceName(a) === normalizeServiceName(b)` **and** the result is non-empty and length ≥ 2.
Symmetric. Examples:

| a                                    | b                         | match                 |
| ------------------------------------ | ------------------------- | --------------------- |
| `hipstershop.CartService`            | `CartService`             | ✅                    |
| `NewCartServiceClient`→`CartService` | `cartservice` (proto)     | ✅                    |
| `ProductCatalogService`              | `product-catalog-service` | ✅                    |
| `CartService`                        | `CheckoutService`         | ❌                    |
| `AdService`                          | `AddressService`          | ❌ (`ad` ≠ `address`) |

## Test matrix (grpc-parser.test.ts)

- One positive per `form` with a realistic line from the corresponding reference service.
- `generic` fallback: a Ruby/Rust-style `Stub.new` / bare `FooServiceClient` line.
- Negatives: each item in "MUST NOT emit".
- `normalizeServiceName` table above.
- `serviceNamesMatch` table above, both argument orders.
- Multi-match line collapses to one ref with the specific `form`.
- Deterministic order for a file with three refs on lines 5, 2, 9 → emitted 2, 5, 9.
