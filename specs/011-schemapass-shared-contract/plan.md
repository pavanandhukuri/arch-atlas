# Implementation Plan: schemaPass — shared multi-service contract is not a dependency

**Branch**: `011-schemapass-shared-contract` | **Date**: 2026-09-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-schemapass-shared-contract/spec.md`

## Summary

`schemaPass` in the deterministic cross-repo correlator draws a `depends_on` edge between
any two repositories that hold a byte-identical copy of the same schema file, and a
low-weight `depends_on` when two repos share a proto `package` name plus a message. On a
workspace that vendors one aggregate `.proto` (many services, copied into every service
repo) this produces a quadratic web of false dependencies — 6 of the 7 false-positive
cross-repo edges on the Online Boutique reference workspace, capping connection precision
at ~0.67.

Fix, scoped to `schemaPass` only: (1) an identical copy is a dependency signal **only**
when the shared contract identifies a single owning repo — a `.proto` declaring ≥ 2
services with no repo serving all of them is a shared contract, not a dependency between
its holders; where exactly one holder serves every declared service, edges point toward
that owner. (2) the proto-package drift signal is suppressed when the package name is held
by ≥ 3 repos (a workspace namespace, not a bilateral contract). The OpenAPI client-coverage
signal and every other pass are untouched. No evidence/parser/schema/CLI change — the
service count and the "services a repo serves" set already exist on the collected
evidence.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022), Node ≥ 22
**Primary Dependencies**: none added. Existing `zod` (schemas), `vitest` (tests). Reuses the
already-internal `normalizeServiceName` helper in `evidence-passes.ts`.
**Storage**: N/A — in-memory correlation over per-repo `RepoAnalysis` + collected `RepoEvidence`.
No persisted artifact changes (`{repo}.analysis.json`, `architecture.review.yaml`, `.arch.json`
all unchanged).
**Testing**: `vitest` — new `describe('schemaPass')` cases in
`apps/llm-importer/test/unit/evidence-passes.test.ts`; determinism via
`multi-repo-correlation.integration.test.ts`; full-workspace numbers via
`packages/analysis-runner-local/eval`.
**Target Platform**: Node CLI / library (`@arch-atlas/llm-importer`).
**Project Type**: monorepo — single package touched (`apps/llm-importer`), plus an eval
baseline file in `packages/analysis-runner-local`.
**Performance Goals**: correlation stays O(repos² · digests²) for the pairwise match plus a
new O(repos · digests) pre-scan; no measurable change on workspaces of tens of repos.
**Constraints**: byte-deterministic correlation output (FR-007/SC-005); ≥ 80 % coverage on
changed project (constitution III); no new dependency (constitution V).
**Scale/Scope**: ~30 changed lines in one exported function + 2 named constants + 1 local
helper; ~5 new unit tests; 1 regenerated eval baseline entry.

## Constitution Check

_GATE: must pass before Phase 0 and after Phase 1._

| Principle                                   | Status         | Notes                                                                                                                                                                          |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Monorepo boundaries                      | PASS           | Change confined to `apps/llm-importer/src/correlate/`; no new cross-package import; eval baseline is data.                                                                     |
| II. Type safety & explicit contracts        | PASS           | No `any`, no new casts; reuses typed `SchemaDigest` / `RepoEvidence`. No boundary/schema change.                                                                               |
| III. TDD (NON-NEGOTIABLE) + ≥ 80 % coverage | PASS (planned) | Tests for all five branches (0-service / 1-owner / 0-owner / ≥2-owner / package≥3) written failing first; importer suite kept green. Change is small and fully branch-covered. |
| IV. Security & privacy by design            | PASS           | No new external surface; deterministic literal analysis; no secrets, no LLM call in `schemaPass`.                                                                              |
| V. Latest versions & supply-chain hygiene   | PASS           | Zero dependency changes; lockfile untouched.                                                                                                                                   |

Post-design re-check: unchanged — see `research.md` D10. **No violations; Complexity
Tracking table omitted.**

## Project Structure

### Documentation (this feature)

```text
specs/011-schemapass-shared-contract/
├── plan.md              # this file
├── spec.md              # /speckit.specify output
├── research.md          # Phase 0 — D1..D10
├── data-model.md        # Phase 1 — types read + derived values + decision tables
├── contracts/
│   └── schemapass-behavior.md   # Phase 1 — C1..C8 behavioural contract
├── quickstart.md        # Phase 1 — how to verify
├── checklists/
│   └── requirements.md  # spec quality checklist (all pass)
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
apps/llm-importer/
├── src/correlate/
│   └── evidence-passes.ts          # CHANGED — schemaPass: owner-aware identical-copy
│                                   #   rule + package-namespace drift guard + 2 consts
│                                   #   + local helpers (serviceIdsOf, ownersOf, pkgHolders)
└── test/unit/
    └── evidence-passes.test.ts     # CHANGED — new describe('schemaPass') cases;
                                    #   existing 3 schemaPass cases unchanged

packages/analysis-runner-local/
└── eval/
    └── baseline.json               # CHANGED — regenerated `online-boutique` aggregate
                                    #   (connectionsPrecision 0.667 → ~0.93)
```

**Explicitly NOT touched**: `src/correlate/evidence/*` (walker + all parsers),
`deterministic-correlator.ts`, every other pass (`manifestPass`, `endpointPass`,
`grpcPass`, `composePass`, `topicPass`, name-mention), `src/confidence/*`, `src/review/*`,
`src/export/*`, `src/config/*`, `src/index.ts`, `src/cli.ts`, the `.arch.json` /
review-artifact schemas, and all of `apps/studio`.

**Structure Decision**: Single-package change in `apps/llm-importer` following the existing
`evidence-passes.ts` pass pattern (a pass is a pure `(CorrelationInput) => { pass,
connections, notes }`). The eval baseline lives with the eval harness in
`packages/analysis-runner-local` (010 D10). No new files.

## Phase 0 — Outline & Research

Complete → `research.md`. All unknowns resolved:

- **D1** exact code + the three signals it emits.
- **D2** reproduced the 6-FP breakdown; set the precision target at ≥ 0.90 (14/15 = 0.933
  achievable; the 7th FP is `endpointPass`, out of scope).
- **D3** ownership data already exists (`RepoEvidence.grpcServices`,
  `SchemaDigest.identifiers` `service:` entries) — **no new evidence field**.
- **D4** new identical-copy rule (0 services → unchanged; ≥ 1 service → route to the
  single owner or emit nothing).
- **D5** new drift rule (suppress when package held by ≥ 3 repos).
- **D6** two named constants with rationale.
- **D7** determinism argument.
- **D8** blast-radius table — no existing assertion flips.
- **D9** eval + live-proof procedure and expected numbers.
- **D10** constitution re-check — clean.

## Phase 1 — Design & Contracts

Complete → `data-model.md`, `contracts/schemapass-behavior.md`, `quickstart.md`.

- **data-model.md**: existing types read (unchanged), transient derived values
  (`pkgHolders`, `digestHolders`, `serviceIdsOf`, `ownersOf`), the two constants, and two
  decision tables (identical-copy signal, drift signal).
- **contracts/schemapass-behavior.md**: C1–C8 — GIVEN/WHEN/THEN for multi-service
  suppression, single-owner routing, service-less passthrough, namespace-drift suppression,
  bilateral-drift passthrough, OpenAPI passthrough, determinism, and "every other pass
  unchanged". Each maps directly to a unit test.
- **quickstart.md**: unit / determinism / eval commands and the "done" diff shape.

### Agent context update

Run `.specify/scripts/bash/update-agent-context.sh claude` — adds no new tech (TS/Node/zod
already present); records the 011 line only.

## Phase 2 — (handled by `/speckit.tasks`)

Task ordering will be, TDD-first:

1. Add failing unit tests for C1–C5 in `evidence-passes.test.ts` (C6–C8 already covered by
   existing tests / integration — assert they stay green).
2. Add the two constants + `serviceIdsOf` / `ownersOf` / `pkgHolders` locals to
   `evidence-passes.ts`.
3. Rewrite the identical-copy branch of `schemaPass` (owner-aware).
4. Add the package-namespace guard to the drift branch.
5. Run importer `test` + `lint` + `typecheck`; confirm no other pass moved.
6. Run eval `--set online-boutique --runs 3`; confirm precision ≈ 0.93, recall 1.0, 14/14
   gRPC; run `--set fixtures` and confirm within tolerance.
7. Regenerate `eval/baseline.json` for `online-boutique`.
8. Docs: `CHANGELOG.md` entry; point `specs/009` D14 follow-up at 011; `proof.md`.

## Complexity Tracking

No constitution violations — table intentionally empty.
