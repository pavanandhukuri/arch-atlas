# Feature Specification: Architecture DSL Module

**Feature Branch**: `004-architecture-dsl`
**Created**: 2026-04-19
**Status**: Draft
**Input**: User description: "Architecture DSL module to support LLM importer"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Author Diagram from Text (Priority: P1)

An architect writes a concise plain-text description of their system using the DSL format and the system converts it into a fully structured architecture model that can be visualized in the diagram canvas.

**Why this priority**: This is the foundational capability that every downstream use case (LLM importer, CLI tooling, templates) depends on. Without a working text-to-model path, nothing else in this roadmap can proceed.

**Independent Test**: Can be fully tested by authoring a DSL snippet with 3+ elements and 2+ relationships, feeding it to the parser, and verifying the resulting model contains all declared elements and relationships with correct attributes. Delivers standalone value as a developer-facing import tool.

**Acceptance Scenarios**:

1. **Given** a valid DSL text document, **When** it is parsed, **Then** the result contains one `ArchitectureModel` with all declared elements, relationships, and attributes intact.
2. **Given** a DSL document declaring a parent element with nested child elements, **When** it is parsed, **Then** the child elements reference their parent's id correctly.
3. **Given** a DSL document declaring a relationship between two elements by name, **When** it is parsed, **Then** the relationship's `sourceId` and `targetId` resolve to the correct element ids.
4. **Given** a DSL document that references an element name that does not exist, **When** it is parsed, **Then** the parser returns a descriptive error including the offending reference.
5. **Given** the parsed model, **When** loaded into the diagram canvas, **Then** all elements are visible and all relationships render as arrows between their respective elements.

---

### User Story 2 - Export Existing Diagram as DSL Text (Priority: P2)

An architect working on an existing diagram can export it to DSL text, edit the text by hand (or with AI assistance), and re-import the edited text to update the diagram.

**Why this priority**: Round-trip fidelity (model → text → model) is required for the LLM importer and for developer workflows. It also serves as the primary correctness test of the serializer.

**Independent Test**: Can be tested by loading an existing `.arch.json` file, exporting it to DSL text, re-importing the text, and asserting that the resulting model is structurally equivalent to the original.

**Acceptance Scenarios**:

1. **Given** an existing architecture model with elements, relationships, and formatting attributes, **When** it is serialized to DSL text, **Then** the output is a valid DSL document that can be parsed without errors.
2. **Given** a DSL document produced by the serializer, **When** it is parsed back, **Then** the resulting model is structurally equivalent to the original (all ids, names, relationships, and attributes preserved).
3. **Given** a model containing all supported element kinds (landscape, system, person, container, component, code), **When** serialized, **Then** each kind appears with its correct classification in the DSL output.
4. **Given** a serialized DSL document, **When** a developer edits a relationship label and re-parses, **Then** only the modified relationship changes in the resulting model.

---

### User Story 3 - LLM-Generated DSL Import (Priority: P3)

An AI assistant produces a DSL text document describing a system's architecture. That text is fed directly into the parser and rendered as a diagram in arch-atlas without manual editing.

**Why this priority**: This is the target use case motivating the whole DSL effort. It validates that the format is machine-writable, self-contained, and forgiving enough for AI-generated output.

**Independent Test**: Can be tested by having an LLM produce a DSL snippet for a known architecture, parsing it, and verifying the resulting model matches the expected elements and relationships. Delivers the first end-to-end AI-assisted diagram creation flow.

**Acceptance Scenarios**:

1. **Given** a DSL document produced by an LLM with no additional context or schema provided, **When** it is parsed, **Then** the parser returns a valid model or clear, actionable errors (not crashes).
2. **Given** an LLM output that includes minor formatting inconsistencies (extra whitespace, inconsistent casing), **When** parsed, **Then** the parser normalizes these and succeeds.
3. **Given** an LLM output that omits optional attributes, **When** parsed, **Then** the parser uses sensible defaults for all missing optional fields.
4. **Given** a parsed LLM-generated model, **When** rendered in the canvas, **Then** all declared systems and relationships are visible and navigable without any manual correction required.

---

### Edge Cases

- Duplicate element names within the same scope are a hard parse error; the parser returns a structured error identifying the duplicate name and both locations.
- How does the parser handle circular parent-child nesting declarations?
- What happens when a relationship references an element declared later in the document (forward reference)?
- How does the system handle DSL text that is empty or contains only whitespace?
- What happens when an element's required `name` field is missing?
- How does the parser handle unknown element kinds or attribute names?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The DSL MUST support declaring all element kinds defined in the core model: `landscape`, `system`, `person`, `container`, `component`, and `code`.
- **FR-002**: The DSL MUST support declaring named, directional relationships between elements, including relationship type and optional label/description.
- **FR-003**: The DSL MUST support element nesting to express parent-child hierarchy (e.g., containers within a system, components within a container).
- **FR-004**: The DSL MUST support optional per-element attributes: `description`, `technology`, `tags`, `isExternal`, `containerSubtype`, and color formatting overrides.
- **FR-005**: The parser MUST return a valid, fully-resolved `ArchitectureModel` for every syntactically correct DSL document.
- **FR-006**: The parser MUST return at least one structured error object for every invalid DSL document; each error object MUST carry an error code, a human-readable message, and a location (line number or element name) sufficient to identify the problem without additional tooling.
- **FR-007**: The serializer MUST convert any valid `ArchitectureModel` into DSL text that round-trips without data loss.
- **FR-008**: The DSL format MUST be self-contained and represent a complete model snapshot: a document requires no external schema files, configuration, or imports to be parsed, and parsing it always produces a full replacement `ArchitectureModel` (additive/patch mode is out of scope).
- **FR-009**: Forward references MUST be supported — elements may be referenced by name in a relationship before their declaration appears in the document.
- **FR-010**: The DSL MUST be exposed as a standalone importable module (not bound to the studio application).
- **FR-011**: Declaring two elements with the same name within the same scope MUST produce a structured parse error identifying both locations; the parser MUST NOT silently overwrite or ignore either declaration.
- **FR-012**: The parser MUST enforce referential integrity — every relationship endpoint and every parent reference MUST resolve to a declared element. Unresolved references MUST produce structured errors; no partial model is returned when referential integrity fails.
- **FR-013**: A DSL document MAY include an optional version declaration; when present the parser MUST validate it matches a supported version and return a structured error if not. When absent, the parser MUST assume the current version.

### Key Entities

- **DSL Document**: A single plain-text artifact that fully describes one `ArchitectureModel` including all elements and relationships. May optionally open with a version declaration.
- **Element Declaration**: A statement in the DSL that introduces a named element with its kind, optional attributes, and optional child declarations.
- **Relationship Declaration**: A statement in the DSL that introduces a directed connection between two named elements with a type and optional metadata.
- **Parse Result**: The output of the parser — either a valid `ArchitectureModel` or a non-empty list of structured error objects, each with an `errorCode` (string), `message` (human-readable string), and `location` (line number or element name).
- **Serialized DSL**: The text output of the serializer that faithfully represents a given `ArchitectureModel`.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of valid `ArchitectureModel` instances (as produced by the studio today) can be serialized to DSL text and parsed back with no structural data loss.
- **SC-002**: Every parse error includes the specific problem and enough context (line number or element name) for a developer to fix it without additional tooling.
- **SC-003**: A developer familiar with architecture diagrams can author a complete 5-element, 4-relationship system context diagram using the DSL in under 5 minutes without reading source code.
- **SC-004**: A complete architecture description for a realistic system (10+ elements, 10+ relationships) fits in under 80 lines of DSL text.
- **SC-005**: An LLM prompted with a brief system description and the DSL format rules produces a parseable document on the first attempt at least 90% of the time in evaluation runs.

## Assumptions

- The DSL describes a single `ArchitectureModel` (one file = one model); multi-model documents are out of scope.
- Element ids in the parsed model are derived deterministically from element names (e.g., slugified), so authors do not need to supply ids.
- The DSL does not need to encode view positions (x/y coordinates); layout is computed automatically by the existing `@arch-atlas/layout` package.
- Constraints and change-proposals from the core model are out of scope for v1 of the DSL.
- The DSL module is a new package (`@arch-atlas/dsl`) within the existing monorepo, following established package conventions.

## Clarifications

### Session 2026-04-19

- Q: Should the DSL describe a complete replacement model, or also support additive/patch operations on an existing model? → A: Complete replacement only — one DSL document = one full model snapshot.
- Q: Should parse errors be structured objects (machine-readable) or plain human-readable strings? → A: Structured objects — each error carries an error code, human-readable message, and location (line number or element name).
- Q: Should duplicate element names be a hard error or silently resolved (last-wins / first-wins)? → A: Hard error — parser returns a structured error identifying the duplicate name and both locations.
- Q: Should the parser enforce referential integrity (all relationship endpoints and parent refs resolve), or leave that to callers? → A: Enforce at parse time — unresolved references produce structured errors; no partial model is returned.
- Q: Should v1 include a DSL version declaration in the document, or defer versioning entirely? → A: Optional version header — documents MAY declare a DSL version; parser defaults to current version when absent.
