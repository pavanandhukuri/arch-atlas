# Implementation Plan: gRPC-Aware Cross-Repository Correlation

**Branch**: `009-grpc-cross-repo-correlation` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-grpc-cross-repo-correlation/spec.md`

## Summary

The deterministic cross-repository correlator (`apps/llm-importer/src/correlate/`) has five
evidence-grounded passes — manifest, endpoint (HTTP), schema, compose, topic. None of them reasons
about gRPC service-to-service calls, so a workspace whose services talk only over gRPC (the common
polyglot-microservice pattern, and the entire Online Boutique reference workspace) produces an
architecture diagram with **zero** connections between containers. The 008 eval baseline records
`connectionsRecall = 0` / `connectionsPrecision = 0` for `online-boutique`.

This feature adds one new pass — `grpcPass` — with the same shape and discipline as the existing
`endpointPass`: it matches **gRPC client/stub construction sites** found in one repository's source
against the **gRPC services another repository serves**, and emits directed high-confidence `calls`
connections with concrete file/line evidence. Served services come from the 008 analysis
(`served.grpcServices`, already surfaced as `endpoint:grpc:*` adapter nodes) unioned with `service X`
declarations the evidence collector already digests from `.proto` files. Client references come from a
new literal-level parser (`evidence/parsers/grpc.ts`) covering Go, C#, Node/JS, Python, Java, plus a
generic `<Name>ServiceClient`/`Stub` token fallback. The pass is deterministic, model-free, and purely
additive: it registers after `endpointPass` in `EVIDENCE_PASSES`, and every other pass's output is
untouched.

A P3 slice threads a `transport: 'grpc'` marker on the in-memory connection so the review artifact
labels the candidate `type: 'grpc'` (a value Studio's wizard and `diagram-builder.ts` already
understand) instead of the generic `http`.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node.js ≥ 22 — matches the `apps/llm-importer` package
**Primary Dependencies**: none new. Existing: `zod` (graph schema validation), `js-yaml` (already used by schema/compose parsers), `vitest` (test runner)
**Storage**: N/A — the pass operates on the in-memory `RepoEvidence` + `RepositoryKnowledgeGraph` the correlator already builds; no new persisted artifact. `{repo}.analysis.json` is unchanged.
**Testing**: `vitest` — unit tests for `parsers/grpc.ts` and `grpcPass`; a mocked-model integration test in `test/integration/`; live proof via `pnpm eval --set online-boutique` / `--set fixtures`
**Target Platform**: Node.js CLI (`apps/llm-importer`), local execution only
**Project Type**: Single project (monorepo app package) — correlation subsystem library code
**Performance Goals**: no user-visible slowdown on a gRPC-free run; the pass is O(client-refs × served-services) over data already in memory. The source scan reuses the existing `collect.ts` walk (no second filesystem traversal).
**Constraints**: deterministic (identical ordered output across runs), no language-model call, no network, no new heavyweight parser dependency (regex/string scan only), ≥ 80% coverage on changed code, existing `fixtures` eval metrics must not regress beyond the harness's 0.05 tolerance
**Scale/Scope**: reference workspace is 10 repos / ~14 expected edges; correlation input is bounded by the existing `collect.ts` limits (`MAX_FILES_SCANNED = 4000`, `MAX_DEPTH = 10`, `MAX_FILE_BYTES = 1 MiB`)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                               | Assessment                                                                                                                                                                                                                                                                                                                                                                                                              | Status |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Product-Centered Monorepo Boundaries**             | All changes are inside `apps/llm-importer/src/correlate/**` plus one additive branch in `src/review/assemble-review.ts` (same package). No cross-package internal imports; `@arch-atlas/core-model` and Studio are untouched. The new parser lives beside the existing `evidence/parsers/*`.                                                                                                                            | PASS   |
| **II. Type Safety & Explicit Contracts at Boundaries**  | Strict TS throughout. New `GrpcClientRef` interface + `grpcServices: string[]` / `grpcClientRefs: GrpcClientRef[]` fields on `RepoEvidence` (an internal contract). The parser boundary (raw source text → typed refs) is literal pattern-matching with a typed return; no `any`, no unchecked casts. The in-memory `CrossRepositoryConnection` gains an optional `transport?: 'grpc'` — a closed string-literal union. | PASS   |
| **III. Test-Driven Development (NON-NEGOTIABLE)**       | tasks.md orders every code task after its failing test. Unit coverage: per-language extraction, service-name normalization, matching, direction, self-connection exclusion, ambiguity demotion, dedupe, evidence text. Integration: mocked-model pipeline asserts the directed edge.                                                                                                                                    | PASS   |
| **IV. Security & Privacy by Design**                    | No LLM, no network, no new external surface. The parser only receives file contents `collect.ts` already read under the FR-015 secret-path exclusions (`matchesSecretPattern`) — it never opens files itself. Output is deterministic evidence strings (file path + line + service name); no secret material is echoed.                                                                                                 | PASS   |
| **V. Latest Supported Versions & Supply-Chain Hygiene** | Zero new dependencies. No runtime/version change.                                                                                                                                                                                                                                                                                                                                                                       | PASS   |
| **Quality Gate: ≥ 80% coverage on changed project**     | Enforced by the existing `vitest` coverage config for `apps/llm-importer`; new files are small and fully exercised by unit tests.                                                                                                                                                                                                                                                                                       | PASS   |
| **Quality Gate: OSS hygiene / CHANGELOG**               | `apps/llm-importer/CHANGELOG.md` + `apps/llm-importer/README.md` (correlation-passes section) updated in the Polish phase; user-facing behavior change (gRPC connections now appear) noted.                                                                                                                                                                                                                             | PASS   |

No violations. **Complexity Tracking section omitted** (nothing to justify).

### Post-Design Re-check (after Phase 1)

Design keeps every consumer of `RepoEvidence` / `CrossRepositoryConnection` compiling unchanged
(fields are additive and optional). `EVIDENCE_PASSES` stays a plain ordered array; `grpcPass` slots in
at index 1. `to-correlation-graph.ts` is **not** modified — `grpcPass` reads the `endpoint:grpc:*`
nodes that adapter already emits. Re-check: **PASS**, no new violations, Complexity Tracking still empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-grpc-cross-repo-correlation/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions D1–D10
├── data-model.md        # Phase 1 output — RepoEvidence additions, GrpcClientRef, connection transport
├── quickstart.md        # Phase 1 output — how to run/verify the new pass + eval
├── contracts/
│   ├── grpc-client-parser-contract.md      # parsers/grpc.ts: input source text → GrpcClientRef[]
│   ├── grpc-pass-contract.md               # grpcPass(CorrelationInput) → PassResult
│   └── evidence-collection-contract.md     # collect.ts additions: grpcServices + grpcClientRefs population
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
├── proof.md             # Live eval before/after (filled during implementation Phase — proof gate)
└── tasks.md             # /speckit.tasks output — NOT created by /speckit.plan
```

### Source Code (repository root)

```text
apps/llm-importer/
├── src/
│   ├── correlate/
│   │   ├── evidence-passes.ts             # MODIFIED — add grpcPass; register in EVIDENCE_PASSES after endpointPass
│   │   ├── deterministic-correlator.ts    # MODIFIED (types only) — CrossRepositoryConnection gains optional `transport?: 'grpc'`
│   │   └── evidence/
│   │       ├── types.ts                   # MODIFIED — RepoEvidence.grpcServices, RepoEvidence.grpcClientRefs; new GrpcClientRef
│   │       ├── collect.ts                 # MODIFIED — populate grpcServices (from endpoint:grpc:* nodes + proto service: ids) and grpcClientRefs (from the existing source walk)
│   │       └── parsers/
│   │           ├── grpc.ts                # NEW — extractGrpcClientRefs(relPath, content) + service-name normalization helpers
│   │           └── schemas.ts             # UNCHANGED — already yields `service:X` proto identifiers
│   └── review/
│       └── assemble-review.ts             # MODIFIED (P3, additive) — a `calls` connection carrying transport:'grpc' maps to candidate type 'grpc' (already a valid CandidateType) instead of 'http'
├── test/
│   ├── unit/
│   │   ├── grpc-parser.test.ts            # NEW — per-language client-ref extraction, normalization
│   │   ├── grpc-pass.test.ts              # NEW — matching, direction, self-exclusion, ambiguity demotion, dedupe, evidence
│   │   ├── evidence-collect.test.ts       # MODIFIED/NEW — grpcServices + grpcClientRefs population
│   │   └── review-assembly.test.ts        # MODIFIED — transport:'grpc' → candidate type 'grpc'
│   ├── integration/
│   │   └── grpc-correlation.integration.test.ts   # NEW — mocked model → analysis → adapter → correlate → directed edge
│   ├── fixtures/repos/
│   │   ├── catalog-service/               # NEW — serves gRPC CatalogService (proto + minimal Go server)
│   │   └── storefront/                    # NEW — constructs a CatalogService client stub (Go)
│   └── eval/
│       ├── baseline.json                  # UPDATED — new online-boutique connection metrics
│       └── golden/online-boutique/ground-truth.json  # UNCHANGED (already all-gRPC, 14 edges)
├── CHANGELOG.md                           # MODIFIED — Polish phase
└── README.md                             # MODIFIED — correlation-passes section
```

**Structure Decision**: Single-project layout. The feature is a self-contained addition to the
existing evidence-grounded correlation subsystem in `apps/llm-importer`. New code is one parser
(`evidence/parsers/grpc.ts`) and one pass function (`grpcPass` in `evidence-passes.ts`); everything
else is small additive edits (two `RepoEvidence` fields, their population in `collect.ts`, an optional
connection field, one candidate-type branch). No new package, no directory restructure.

## Complexity Tracking

No constitution violations — section intentionally empty.
