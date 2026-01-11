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

## Decision: "Code-level detail" is lightweight in MVP

- **Decision**: MVP supports "code-level" as an abstract layer (modules/files/symbols) without deep
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

---

# Security Hardening Notes

## File Import Sanitization

### Current Implementation (MVP)

The import policy enforces strict validation:

1. **Schema Version Validation**
   - Rejects files with missing `schemaVersion` field
   - Rejects files with unknown schema versions
   - Only accepts known versions: `['0.1.0']`

2. **Unknown Fields Rejection**
   - Validates top-level fields against known schema
   - Rejects files with any unknown fields
   - Known fields: `schemaVersion`, `metadata`, `elements`, `relationships`, `constraints`, `views`

3. **JSON Parsing Safety**
   - Uses standard `JSON.parse()` with try/catch
   - Returns structured errors on parse failure
   - No `eval()` or dynamic code execution

### Recommendations for Production

1. **Deep Field Validation**
   - Current implementation only validates top-level fields
   - Consider JSON Schema validation for nested fields
   - Use a library like `ajv` for full schema enforcement

2. **File Size Limits**
   - Implement maximum file size check (e.g., 10MB)
   - Prevent memory exhaustion from large JSON files

3. **Content-Type Validation**
   - Verify MIME type is `application/json`
   - Consider magic number validation for additional security

4. **Sanitization of User-Provided Strings**
   - Element names, descriptions, and metadata fields are user-provided
   - Ensure proper escaping when rendering in HTML
   - React provides XSS protection by default, but be cautious with `dangerouslySetInnerHTML`

## Safe UI Rendering

### Current Implementation

1. **React XSS Protection**
   - All user content rendered via React's JSX (automatic escaping)
   - No use of `dangerouslySetInnerHTML` in current implementation
   - Text inputs and textareas properly bound to state

2. **File Download Safety**
   - Export uses `Blob` and `URL.createObjectURL`
   - URLs properly revoked after download
   - Filename sanitized (lowercase, spaces to hyphens)

### Recommendations for Production

1. **Content Security Policy (CSP)**
   - Add CSP headers to prevent inline script execution
   - Restrict script sources to trusted domains
   - Example: `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';`

2. **Input Validation**
   - Enforce maximum lengths for names and descriptions
   - Validate element IDs follow expected format
   - Sanitize filenames on export to prevent path traversal

3. **LocalStorage Security**
   - Autosave data stored in localStorage (browser-local only)
   - Consider encrypting sensitive model data before storage
   - Warn users about browser access to localStorage

4. **Canvas/PixiJS Security**
   - PixiJS renders WebGL content from trusted model data
   - No user-provided URLs or external resources loaded
   - If adding image/icon support, validate URLs and use CORS

## Threat Model

### In Scope for MVP

- **Malicious JSON Import**: User imports crafted JSON to exploit parser or validation
- **XSS via User Content**: User creates elements with malicious names/descriptions
- **LocalStorage Tampering**: Attacker modifies autosaved data in browser storage

### Out of Scope for MVP (Future Considerations)

- **Multi-user Collaboration**: Not implemented in MVP (single-user mode)
- **Server-Side Attacks**: Studio is browser-only, no backend API
- **Supply Chain Attacks**: Covered by dependabot and pnpm audit (see constitution)

## Action Items

- [X] Implement strict import validation (schema version + unknown fields)
- [X] Use React's built-in XSS protection (no dangerouslySetInnerHTML)
- [X] Sanitize export filenames
- [ ] Add CSP headers (deferred to deployment phase)
- [ ] Implement file size limits for import (recommend 10MB max)
- [ ] Add input length validation for element names/descriptions
- [ ] Consider JSON Schema validation library for deep validation
- [ ] Add security section to CONTRIBUTING.md reminding contributors about XSS risks

## References

- OWASP JSON Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Security_Cheat_Sheet.html
- React Security Best Practices: https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml
- Content Security Policy Guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
