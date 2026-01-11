<!--
Sync Impact Report

- Version change: 0.1.0 → 0.1.0 (no bump; pending initial commit/ratification)
- Modified principles: N/A (template placeholders replaced)
- Added sections: N/A
- Modified sections:
  - "Development Workflow & Quality Gates" (adds minimum coverage requirement + OSS hygiene gates)
  - "Repository Structure & Technology Standards" (adds OSS meta-files expectations)
  - "Governance" (adds OSS maintainer + contribution governance expectations)
- Removed sections: N/A
- Templates requiring updates:
  - ✅ Updated: `.specify/templates/plan-template.md`
  - ✅ Updated: `.specify/templates/spec-template.md`
  - ✅ Updated: `.specify/templates/tasks-template.md`
  - ⚠ Pending (not present in repo): `.specify/templates/commands/*.md`
- Runtime guidance / OSS meta files:
  - ✅ Added: `README.md`
  - ✅ Added: `CONTRIBUTING.md`
  - ✅ Added: `CODE_OF_CONDUCT.md`
  - ✅ Added: `SECURITY.md`
  - ✅ Added: `LICENSE`
  - ✅ Added: `CHANGELOG.md`
  - ✅ Added: `.github/pull_request_template.md`
  - ✅ Added: `.github/ISSUE_TEMPLATE/bug_report.md`
  - ✅ Added: `.github/ISSUE_TEMPLATE/feature_request.md`
- Deferred TODOs:
  - TODO(RATIFICATION_DATE): Original ratification date is unknown; set this once agreed by maintainers.
  - TODO(LICENSE): Choose an OSS license and replace the placeholder license text before public release.
  - TODO(CONTACT_EMAIL): Set an email (or alternative process) for CoC + security reporting.
-->

# Arch Atlas Monorepo Constitution

This constitution governs development in this repository (even if related projects live in other repos).

## Core Principles

### I. Product-Centered Monorepo Boundaries
This repository MUST be structured as a monorepo with explicit boundaries (e.g., `apps/`, `packages/`,
`services/`, `tools/`). Each package/app MUST have a clear responsibility, stable public API, and owned
dependencies. Cross-package imports MUST go through declared package entrypoints; do not reach into
internal modules across package boundaries.

Rationale: Keeps the C4 builder evolvable while preventing “spaghetti” coupling across UI, core models,
renderers, exporters, and (optional) LLM integrations.

### II. Type Safety & Explicit Contracts at Boundaries
TypeScript code MUST compile with strict type checking enabled. Any boundary to the outside world
(HTTP, file import/export, plugin interfaces, persistence, LLM/tool calls) MUST have explicit schemas
and validation. “Implicit contracts” (hand-wavy JSON shapes, `any`, unchecked casts) are prohibited.

Rationale: Architecture tools live or die by correctness—bad models and silent coercions create bad
diagrams and broken exports.

### III. Test-Driven Development (NON-NEGOTIABLE)
All production code changes MUST be developed test-first: write a test, ensure it fails, implement the
minimal change to pass, then refactor. Every PR that changes behavior MUST include automated tests at
the right level (unit/integration/e2e) and MUST keep the test suite green.

Rationale: TDD is the quality and change-safety mechanism for a tool that will evolve rapidly.

### IV. Security & Privacy by Design
Security is a feature. Code MUST follow least-privilege principles, validate and sanitize all inputs, and
prevent common web risks (XSS/CSRF/injection, insecure deserialization, SSRF, authz bypass). Secrets MUST
never be committed. If any LLM integration exists, it MUST:

- treat prompts/outputs as untrusted input,
- avoid sending secrets or sensitive customer data to external providers,
- implement provider allowlists + timeouts + retries, and
- log safely (redaction by default).

Rationale: This repo will likely process architecture details that may be sensitive; supply-chain and
prompt-injection risks are real.

### V. Latest Supported Versions & Supply-Chain Hygiene
Projects in this monorepo MUST target currently supported runtimes (no EOL Node/Python) and keep
dependencies current. Dependencies MUST be pinned via lockfiles and updated continuously (automation
recommended). CI MUST include dependency vulnerability scanning and MUST block known critical issues
unless an explicit, time-bounded exception is approved.

Rationale: The fastest path to insecurity is stale dependencies and unmaintained runtimes.

## Repository Structure & Technology Standards

- **Languages**:
  - **Primary**: TypeScript for the web-based C4 builder.
  - **Optional**: Python for LLM/tool integrations, kept in clearly separated packages/apps.
- **Workspaces**: Use a workspace strategy so each project can be built, tested, and versioned with clear
  ownership. Each project MUST document how to run tests and how to release/publish (if applicable).
- **Source layout** (recommended, adapt per plan.md): `apps/` (user-facing web), `packages/` (C4 core
  models, rendering, exporters/importers, shared UI), `services/` (optional backends), `tools/` (dev
  tooling/scripts).
- **Generated artifacts**: Generated diagrams/exports MUST be reproducible and MUST not be committed
  unless explicitly required (and documented).
- **Open source meta-files**: This repository MUST maintain:
  - `README.md` (clear purpose, quickstart, repo structure, support channels)
  - `CONTRIBUTING.md` (how to develop, test, submit PRs)
  - `CODE_OF_CONDUCT.md` (behavior expectations + enforcement contact/process)
  - `SECURITY.md` (how to report vulnerabilities privately)
  - `LICENSE` (must be an explicit OSI-approved license before public release)
  - `.github/` templates for issues/PRs to standardize high-quality contributions

## Development Workflow & Quality Gates

- **Definition of Done (PR-level)**:
  - **Tests**: Added/updated tests exist, and CI is green.
  - **Coverage**: Total coverage MUST be **≥ 80%** for the changed project(s) (line or statement coverage,
    per the repo’s configured tooling). Any exception MUST be explicit and time-bounded.
  - **Security**: Threat model notes are included for security-relevant changes; no secrets in code or logs.
  - **Compatibility**: Breaking changes are explicitly called out with a migration plan.
  - **Dependencies**: New dependencies are justified, maintained, and scoped to the minimum surface area.
  - **Open source hygiene**: If the change affects user/developer experience, `README.md` and/or
    `CONTRIBUTING.md` MUST be updated accordingly. User-facing changes SHOULD be reflected in
    `CHANGELOG.md`.
- **Reviews**:
  - PRs MUST be reviewed by at least one maintainer.
  - Security-sensitive changes (auth, permissions, LLM integration, data export/import) require explicit
    security review in the PR description.
- **Exceptions**:
  - Any exception to these rules MUST be documented (what/why/risk/mitigation) and time-bounded.

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

This constitution supersedes other development practices in this repo.

- **Amendments**: Changes MUST be proposed via PR with a rationale and migration plan (if behavior
  changes). Material additions/changes bump MINOR; breaking governance/principle changes bump MAJOR.
- **Compliance checks**: Reviewers MUST explicitly check PRs for compliance with the Core Principles and
  Quality Gates. If a PR is non-compliant, it MUST either be fixed or include an approved exception.
- **Periodic review**: Maintainers SHOULD re-review this constitution at least quarterly to keep security
  and dependency guidance aligned with current best practices.
- **Open source governance**:
  - Maintainers MUST keep contribution pathways healthy (triage issues/PRs, label meaning, review SLAs
    where feasible).
  - Community-facing policy changes (license, Code of Conduct, security reporting process) require
    maintainer approval and MUST be clearly documented in the repo root.

**Version**: 0.1.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2026-01-11
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
