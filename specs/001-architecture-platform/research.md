# Research: Semantic Architecture Platform (MVP)

**Feature**: `specs/001-architecture-platform/spec.md`  
**Date**: 2026-01-11

This document consolidates key technical decisions needed to plan MVP delivery.

## Decision: Single source of truth is file-first

- **Decision**: The canonical architecture model MUST be represented as an exportable file. Users can
  open an existing file or create a new one. While editing, changes are autosaved locally in the
  browser; users explicitly export a canonical file.
- **Rationale**: Aligns with open formats + Git-based review workflows; works without a backend/SaaS.
- **Alternatives considered**:
  - Server-first workspaces: rejected for MVP (adds auth, persistence, infra).
  - Hybrid offline/online: deferred until collaboration is a requirement.

## Decision: Autosave storage uses browser-local persistence

- **Decision**: Autosave is stored locally in the browser to protect user work between explicit exports.
  (Implementation detail to be chosen during build: a browser persistence mechanism suitable for large
  payloads.)
- **Rationale**: Avoids data loss while keeping the canonical artifact an explicit, version-controlled
  file.
- **Failure handling**: If local persistence is unavailable/full, the user MUST be warned and guided to
  export immediately.

## Decision: Import/export is strict and schema-versioned

- **Decision**: Import MUST be strict: unknown schema versions or unknown fields are rejected; no partial
  apply. Export includes schema version and is validated before writing.
- **Rationale**: Prevents silent corruption and makes CI automation predictable.
- **Alternatives considered**:
  - Permissive round-tripping of unknown fields: deferred; increases complexity and ambiguity.
  - Best-effort migrations: deferred; add only once schema evolution is stable and tested.

## Decision: Layout/view metadata is required in exported files

- **Decision**: Exported model files MUST include required view/layout metadata needed for deterministic
  rendering and navigation.
- **Rationale**: Deterministic navigation becomes reproducible across machines and time; supports
  reviewable diffs for layout changes.
- **Tradeoff**: Layout becomes part of the exported artifact and may require conflict resolution in Git.

## Decision: MVP is single-user; collaboration via Git

- **Decision**: MVP editor is single-user (no realtime collaboration). Teams collaborate by exporting
  files and reviewing changes (diffs/PRs).
- **Rationale**: Avoids complex concurrency and authorization in MVP while still enabling team workflows.
- **Deferred**: Real-time collaboration and in-app merges/conflict resolution.

## Decision: “Code-level detail” is lightweight in MVP

- **Decision**: MVP supports “code-level” as an abstract layer (modules/files/symbols) without deep
  codebase analysis.
- **Rationale**: Delivers progressive zoom without committing to a specific static-analysis strategy.
- **Deferred**: LLM importer add-on and richer static analysis.

## Decision: Monorepo tooling and boundaries

- **Decision**: Use workspaces + a build orchestrator to enforce package boundaries and incremental
  builds/tests. Packages MUST expose public entrypoints; no cross-package deep imports.
- **Rationale**: Matches constitution principles and supports replaceable consumers (Studio, renderer).

## Decision: Rendering and interaction approach

- **Decision**: Use a headless-ish rendering layer (separable from Studio UI) to support a single
  continuous map with pan/zoom and semantic zoom.
- **Rationale**: Keeps core reusable and makes rendering testable independently of the app shell.

