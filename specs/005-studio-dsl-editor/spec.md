# Feature Specification: Studio DSL Editor

**Feature Branch**: `004-architecture-dsl`
**Created**: 2026-04-19
**Status**: Draft
**Input**: DSL editor panel in Studio — Monaco-based text editor synced bidirectionally with the visual C4 canvas. Developer can edit DSL text and see the diagram update, or drag elements on canvas and see DSL update. Same page split-view layout.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Edit DSL and See Diagram Update (Priority: P1)

A developer opens the Studio, sees a split-view with the visual canvas on the left and a text editor on the right. They type or paste DSL text into the editor and the diagram updates automatically to reflect the architecture described.

**Why this priority**: This is the core value proposition — giving developers a text-first way to author diagrams without clicking.

**Independent Test**: Can be fully tested by opening Studio, typing valid DSL into the editor panel, and verifying the diagram renders the described elements and relationships.

**Acceptance Scenarios**:

1. **Given** the Studio is open with an empty canvas, **When** the developer types a valid DSL snippet into the editor panel, **Then** the canvas updates to display the elements and relationships described in the DSL.
2. **Given** the editor contains valid DSL, **When** the developer adds a new element and saves/pauses typing, **Then** the new element appears on the canvas without losing existing layout positions.
3. **Given** the editor contains DSL with a parse error, **When** the developer introduces a syntax mistake, **Then** the canvas does not change and an inline error indicator shows the line and error description.
4. **Given** the editor contains DSL with a parse error, **When** the developer fixes the error, **Then** the canvas updates to reflect the now-valid DSL.

---

### User Story 2 - Drag Canvas Element and See DSL Update (Priority: P2)

A developer moves or modifies elements on the visual canvas (drag, rename, add via toolbar), and the DSL editor panel reflects the updated model in text form.

**Why this priority**: Bidirectional sync makes the DSL editor feel native — users should be able to mix visual and text editing freely.

**Independent Test**: Can be fully tested by dragging an element on the canvas and verifying the DSL panel reflects the structural change (new element, removed element, or updated relationship).

**Acceptance Scenarios**:

1. **Given** the canvas has elements and the DSL panel shows their DSL representation, **When** the developer adds a new element via the canvas toolbar, **Then** the DSL panel updates to include the new element declaration.
2. **Given** the canvas has elements, **When** the developer deletes an element from the canvas, **Then** the corresponding declaration and any relationships referencing it are removed from the DSL panel.
3. **Given** the DSL panel is showing current model DSL, **When** the developer drags an element to a new position, **Then** the DSL panel does not change (layout/position is not part of DSL — structural changes only trigger DSL updates).

---

### User Story 3 - Persist DSL-authored Model (Priority: P3)

A developer authors a model via the DSL panel and saves it. On reload, the model is restored with both the structure and any custom layout positions preserved.

**Why this priority**: Without persistence, DSL authoring is ephemeral. Saving ties the feature into the existing storage system.

**Independent Test**: Can be fully tested by authoring a model in the DSL panel, saving, reloading the page, and verifying the model is restored correctly.

**Acceptance Scenarios**:

1. **Given** the developer has authored a model via DSL and the canvas has auto-laid it out, **When** they save, **Then** the model (structure + layout) is persisted via the existing storage mechanism.
2. **Given** a saved model is reloaded, **When** the Studio opens, **Then** the DSL panel shows the DSL representation of the restored model.

---

### Edge Cases

- What happens when the developer pastes a very large DSL document (hundreds of elements)?
- How does the editor behave when DSL is partially typed mid-word (don't re-parse on every keystroke — debounce)?
- What happens when both panels are edited simultaneously (race condition between canvas event and editor event)?
- What if the DSL references an element name that was previously valid but was deleted on the canvas?
- What happens when the user clears the entire DSL editor — does the canvas clear too?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The Studio MUST display a split-view layout with the visual canvas on one side and a DSL text editor on the other side on the same page.
- **FR-002**: The DSL editor MUST parse the text content and update the visual canvas when the user stops typing (debounced, not on every keystroke).
- **FR-003**: The DSL editor MUST display inline error indicators (line number + message) when the DSL contains parse errors, without clearing the canvas.
- **FR-004**: The visual canvas MUST serialize the current model to DSL and update the editor panel whenever the model changes via canvas interactions (add, delete, rename element or relationship).
- **FR-005**: Layout positions (x, y coordinates) MUST NOT be encoded in the DSL — position changes on the canvas MUST NOT trigger a DSL panel update.
- **FR-006**: When DSL is parsed and produces a new model, elements that already exist in the current model MUST retain their layout positions where possible (matched by element name).
- **FR-007**: New elements introduced via DSL MUST receive auto-layout positions via the layout engine.
- **FR-008**: The split-view ratio MUST be adjustable by the developer (resizable divider).
- **FR-009**: The DSL editor MUST support syntax highlighting for DSL keywords, strings, and comments.
- **FR-010**: The Studio MUST allow the developer to toggle the DSL panel visibility (show/hide).
- **FR-011**: The model authored or modified via DSL MUST be saveable and restorable using the existing storage mechanism.

### Key Entities

- **Split View**: The two-panel layout consisting of the canvas pane and the DSL editor pane with a resizable divider.
- **DSL Editor Panel**: The text editor component displaying DSL content, supporting syntax highlighting and inline error display.
- **Sync State**: The internal coordination layer that tracks the direction and debounce state of canvas↔editor synchronization to prevent feedback loops.
- **Layout Position Map**: A mapping of element names/ids to their current canvas positions, preserved across DSL re-parses.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer can describe a 10-element architecture model by typing DSL and see it rendered on the canvas within 1 second of stopping typing.
- **SC-002**: A developer can add an element via the canvas toolbar and see the DSL panel update within 500ms.
- **SC-003**: Parse errors are surfaced inline in the editor — the developer never needs to look away from the editor to understand what went wrong.
- **SC-004**: Switching between DSL editing and canvas editing 10 times in a session produces no desync, data loss, or visual glitches.
- **SC-005**: A model authored entirely via DSL survives a save-reload cycle with structure fully intact and layout positions preserved.

## Assumptions

- The Studio already has a canvas view with an `ArchitectureModel` state — the DSL editor panel is an additive panel, not a replacement.
- The existing `@arch-atlas/dsl` package (`parse` and `serialize`) is used as-is with no changes required for this feature.
- The existing `@arch-atlas/layout` package provides auto-layout for newly introduced elements.
- Syntax highlighting is implemented via a Monaco custom language definition (token-based, no LSP required for this iteration).
- Debounce delay for DSL-to-canvas sync is 400–600ms (standard editor debounce range).
- The storage mechanism from the flexible-storage feature (`StorageProvider`) is already available and will be reused without modification.
- Collaborative/multi-user editing is out of scope.
- Mobile/touch support for the split view is out of scope.
