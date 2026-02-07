# Data Model: Semantic Architecture Platform (MVP)

**Feature**: `specs/001-architecture-platform/spec.md`  
**Date**: 2026-01-11

## Goals

- Define a C4-inspired semantic model as the single source of truth.
- Support progressive semantic zoom (landscape → system → container → component → code).
- Keep the Studio as a consumer; domain rules belong in core packages.
- Ensure file-first export/import is schema-versioned and strict.
- Persist required view/layout metadata in the exported file for deterministic navigation.

## Entities

### ArchitectureModel

Represents the full architecture state.

- **schemaVersion**: string (required; governs strict import)
- **metadata**:
  - **title**: string
  - **description**: string (optional)
  - **createdAt**: ISO timestamp (optional)
  - **updatedAt**: ISO timestamp (optional)
- **elements**: array of `Element` (required)
- **relationships**: array of `Relationship` (required)
- **constraints**: array of `Constraint` (optional)
- **views**: array of `View` (required; includes layout metadata)

### Element

A typed node in the architecture hierarchy.

- **id**: string (required; stable identifier)
- **kind**: enum (required): `landscape | system | container | component | code`
- **name**: string (required)
- **description**: string (optional)
- **parentId**: string (optional; must reference an element of the immediate higher abstraction level)
- **tags**: string[] (optional)
- **attributes**: object (optional; restricted to JSON-serializable primitives/arrays/objects)
- **codeRef**: `CodeReference` (optional; only valid when kind = `code`)

### CodeReference (MVP)

Lightweight “code-level” abstraction, not deep analysis.

- **kind**: enum: `module | file | symbol`
- **ref**: string (identifier/path-like string)
- **repoHint**: string (optional; e.g., repository name)

### Relationship

A directed relationship with explicit meaning.

- **id**: string (required)
- **sourceId**: string (required; element id)
- **targetId**: string (required; element id)
- **type**: string (required; e.g., “depends_on”, “calls”, “uses”, “communicates_with”)
- **label**: string (optional)
- **description**: string (optional)
- **tags**: string[] (optional)

### Constraint

A rule validated against the semantic model.

- **id**: string (required)
- **type**: string (required; rule type identifier)
- **scope**: object (required; defines applicable element kinds/ids)
- **parameters**: object (optional)
- **severity**: enum (required): `error | warning`

### View

A semantic zoom slice of the model plus required layout metadata.

- **id**: string (required)
- **level**: enum (required): `landscape | system | container | component | code`
- **title**: string (required)
- **filter**: object (optional; what subset of the model is shown)
- **layout**: `LayoutState` (required)

### LayoutState (required in export)

Deterministic placement and presentation metadata for a given view.

- **algorithm**: string (required; versioned algorithm identifier, e.g., `deterministic-v1`)
- **nodes**: array of:
  - **elementId**: string (required)
  - **x**: number (required)
  - **y**: number (required)
  - **w**: number (optional)
  - **h**: number (optional)
  - **collapsed**: boolean (optional)
- **edges**: array of:
  - **relationshipId**: string (required)
  - **path**: object (optional; routing hints)
- **viewport**: object (optional; default viewport/pan/zoom hint)

### ChangeProposal (MVP-ready shape)

Represents a reviewable set of edits (useful for diff/patch workflows).

- **id**: string
- **summary**: string
- **changes**: array of `Change`

### Change

- **op**: enum: `add | update | delete`
- **targetType**: enum: `element | relationship | constraint | view`
- **targetId**: string
- **value**: object (new value for add/update)

## Core validation rules (MVP)

- **IDs**: `Element.id` and `Relationship.id` MUST be unique.
- **Hierarchy**: `parentId` (if set) MUST point to an element exactly one level higher.
- **Reference integrity**: relationship endpoints MUST exist.
- **View/layout integrity**:
  - `views[].layout` MUST exist (required in export).
  - Every `layout.nodes[].elementId` MUST reference an element.
- **Strict import**:
  - Unknown top-level fields or unknown fields within known objects are rejected.
  - Unknown `schemaVersion` is rejected.

