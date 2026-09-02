# Data Model: schemaPass — shared multi-service contract is not a dependency (011)

No persisted schema changes. No new `RepoEvidence` / `SchemaDigest` fields. This document
records the existing shapes the changed logic reads and the transient values it derives.

## Existing types read (unchanged)

### `SchemaDigest` (`src/correlate/evidence/types.ts`)

| Field          | Type       | Used for                                                                                                          |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `relPath`      | `string`   | evidence text                                                                                                     |
| `sha256`       | `string`   | identical-copy match (signal 1)                                                                                   |
| `identifiers`  | `string[]` | `package:<x>`, `message:<y>`, `service:<Name>` — service count, package-name pre-scan, drift shared-message check |
| `openapiPaths` | `string[]` | signal 3 (OpenAPI coverage), untouched                                                                            |

### `RepoEvidence` (`src/correlate/evidence/types.ts`)

| Field           | Type             | Used for                                                                                                                     |
| --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `name`          | `string`         | connection endpoints, owner identity                                                                                         |
| `schemaDigests` | `SchemaDigest[]` | all three signals                                                                                                            |
| `grpcServices`  | `string[]`       | **owner detection** — services this repo serves (union of graph `endpoint:grpc:*` + `.proto` `service:` ids, deduped/sorted) |
| `urlLiterals`   | `UrlLiteral[]`   | signal 3, untouched                                                                                                          |

### `CrossRepositoryConnection` (`src/correlate/deterministic-correlator.ts`) — output, unchanged shape

`{ sourceRepo, sourceNodeId, targetRepo, targetNodeId, type, evidence[], weight, foundBy, transport? }`.
This feature only removes spurious instances and re-points direction toward an identified
owner; it adds no field.

## Derived values (transient, inside `schemaPass`)

### `pkgHolders: Map<string, Set<string>>`

Built once per pass. Key = proto `package` name (from `identifiers` entries starting
`package:`). Value = set of repo names whose `schemaDigests` declare that package.
Used only for membership size: `size > SHARED_NAMESPACE_MIN_REPOS` ⇒ suppress the drift
signal for that package.

### `digestHolders: Map<string, RepoEvidence[]>`

Key = `sha256`. Value = repos holding a digest with that hash, in `repos` order.
Used to enumerate copy-holders of an identical contract and to compute owners.

### `serviceIdsOf(digest): string[]`

`digest.identifiers.filter(id => id.startsWith('service:')).map(id => id.slice(8))`.
Length drives the `AGGREGATE_CONTRACT_MIN_SERVICES` branch.

### `ownersOf(digest, holders): RepoEvidence[]`

`holders.filter(h => serviceIdsOf(digest).every(svc =>
h.grpcServices.some(g => normalizeServiceName(g) === normalizeServiceName(svc))))`.

- `serviceIdsOf(digest).length === 0` → rule does not apply (message-only path).
- exactly one owner → directed edges `otherHolder --depends_on--> owner` @ 0.9.
- zero or ≥ 2 owners → no edge; optional `note`.

## Named constants (new, module-scope beside `schemaPass`)

| Constant                          | Value | Meaning                                                                                                              |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `AGGREGATE_CONTRACT_MIN_SERVICES` | `2`   | a `.proto` declaring ≥ this many services is a shared/aggregate contract; a copy is not a dependency between holders |
| `SHARED_NAMESPACE_MIN_REPOS`      | `3`   | a proto `package` name held by ≥ this many repos is a workspace namespace; its drift signal is suppressed            |

## Decision table — identical-copy signal (signal 1)

| services in digest | # owners among holders | result                                              |
| ------------------ | ---------------------- | --------------------------------------------------- |
| 0                  | n/a                    | **unchanged**: pairwise `A --depends_on--> B` @ 0.9 |
| ≥ 1                | exactly 1              | each other holder `--depends_on--> owner` @ 0.9     |
| ≥ 1                | 0                      | no edge (+ optional note)                           |
| ≥ 1                | ≥ 2                    | no edge (+ optional note)                           |

## Decision table — proto-package drift (signal 2)

| `pkgHolders[pkg].size` | shared message? | content differs? | result                                     |
| ---------------------- | --------------- | ---------------- | ------------------------------------------ |
| ≤ 2                    | yes             | yes              | **unchanged**: `A --depends_on--> B` @ 0.4 |
| ≥ 3                    | —               | —                | suppressed (no edge)                       |
| any                    | no              | —                | no edge (as today)                         |
