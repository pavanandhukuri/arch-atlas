# Contract: `schemaPass` emission behaviour (011)

`schemaPass` is an internal `EvidencePass`: `(input: CorrelationInput) => { pass: 'schema';
connections: CrossRepositoryConnection[]; notes: string[] }`. Its signature, its
registration slot in `EVIDENCE_PASSES` (`manifest, endpoint, grpc, schema, compose,
topic`), and the `CrossRepositoryConnection` shape are **unchanged**. This contract fixes
_which connections it emits_.

## C1 — Identical multi-service contract ⇒ no edge between holders

GIVEN ≥ 2 repos each hold a `SchemaDigest` with the same `sha256`
AND that digest has ≥ `AGGREGATE_CONTRACT_MIN_SERVICES` (`2`) `service:` identifiers
AND no single holder serves _every_ one of those services
WHEN `schemaPass` runs
THEN it emits **zero** connections from that digest
AND MAY append one `notes` entry naming the file, the service count, and "shared contract,
not a dependency".

## C2 — Identical single-owner contract ⇒ directed edge to the owner

GIVEN ≥ 2 repos hold a `SchemaDigest` with the same `sha256`
AND that digest has ≥ 1 `service:` identifier
AND **exactly one** holder `O` has `grpcServices` covering every `service:` name in the
digest (normalised by `normalizeServiceName`)
WHEN `schemaPass` runs
THEN for every other holder `H` it emits `H --depends_on--> O`, weight `0.9`, `foundBy:
'evidence'`, evidence text naming both files
AND emits no `H1 --depends_on--> H2` edge between non-owners.

## C3 — Identical service-less schema copy ⇒ unchanged

GIVEN exactly 2 repos hold a `SchemaDigest` with the same `sha256`
AND that digest has **zero** `service:` identifiers (message-only `.proto`, GraphQL SDL,
JSON Schema)
WHEN `schemaPass` runs
THEN it emits `A --depends_on--> B`, weight `0.9` — identical to pre-011 behaviour.

## C4 — Proto-package drift on a workspace namespace ⇒ suppressed

GIVEN a proto `package:<p>` identifier appears in `SchemaDigest`s of ≥
`SHARED_NAMESPACE_MIN_REPOS` (`3`) repos
AND two of those repos have differing `sha256` but a shared `message:` identifier under
`<p>`
WHEN `schemaPass` runs
THEN it emits **no** drift connection for `<p>`.

## C5 — Proto-package drift on a bilateral contract ⇒ unchanged

GIVEN `package:<p>` appears in exactly 2 repos, differing `sha256`, shared `message:`
WHEN `schemaPass` runs
THEN it emits `A --depends_on--> B`, weight `0.4`, evidence text containing "drift" —
identical to pre-011 behaviour.

## C6 — OpenAPI client coverage ⇒ unchanged

GIVEN repo A has a `SchemaDigest` with non-empty `openapiPaths`
AND repo B's `urlLiterals` match ≥ 25 % of them
WHEN `schemaPass` runs
THEN it emits `B --calls--> A` with the existing tiered weight (`0.7` ≥ 50 %, `0.45` ≥
25 %) — byte-identical to pre-011 behaviour.

## C7 — Determinism

GIVEN the same `CorrelationInput`
WHEN `schemaPass` runs any number of times
THEN `connections` is byte-identical every run (ordering included), and
`correlateDeterministically` over the same per-repo inputs is byte-identical.

## C8 — Every other pass unchanged

GIVEN any `CorrelationInput`
WHEN the full `EVIDENCE_PASSES` pipeline runs
THEN `manifestPass`, `endpointPass`, `grpcPass`, `composePass`, `topicPass`, and the
name-mention pass each emit output byte-identical to `main` @ `4498405` on every committed
fixture and on the reference workspace.
