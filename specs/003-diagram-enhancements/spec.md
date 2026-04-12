# Feature Specification: Diagram Enhancements

**Feature Branch**: `003-diagram-enhancements`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "Add external system marking, new container diagram types, and element color/formatting options"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Mark System as External (Priority: P1)

As an architect, I want to mark a system in the system context view as "external" so that viewers understand it is outside my organization's control and cannot be explored further.

**Why this priority**: This is a fundamental architectural distinction in C4 diagrams. External vs. internal systems communicate ownership boundaries clearly, making it the most impactful correctness feature.

**Independent Test**: Can be tested by opening the system context view, right-clicking or selecting a system, toggling its "external" status, and verifying visual differentiation. Delivers clear ownership communication even without container diagram improvements.

**Acceptance Scenarios**:

1. **Given** a system exists in the system context view, **When** the user opens the system's options/context menu, **Then** an option to "Mark as External" is presented.
2. **Given** a user marks an internal system (with existing containers) as external, **When** they confirm the action, **Then** a warning dialog appears stating that all underlying containers will be permanently deleted.
3. **Given** the warning dialog is shown, **When** the user cancels, **Then** the system remains internal with all containers intact.
4. **Given** the warning dialog is shown, **When** the user confirms, **Then** all containers are deleted, and the system is marked external.
5. **Given** a system is marked as external, **When** the user attempts to double-click or "drill down" into it, **Then** the drill-down action is disabled and the system cannot be opened.
6. **Given** a system is marked as external, **Then** it renders in a visually distinct color (e.g., muted/grey or a distinct hue) compared to internal systems.
7. **Given** an external system exists, **When** the user opens its options menu, **Then** an option to "Mark as Internal" is available to reverse the status.

---

### User Story 2 - New Container Diagram Types (Priority: P2)

As an architect, I want to use additional container shape types—Static Content (Folder), User Interface, Backend Service, Storage Bucket, and Database—in the container view toolbar so that I can accurately represent different technology archetypes visually.

**Why this priority**: More expressive shape vocabulary improves diagram accuracy and communication. Builds on the existing container view infrastructure and is independent of external system marking.

**Independent Test**: Can be tested by opening the container view, verifying the new shape types appear in the left toolbar, dragging each onto the canvas, and confirming correct visual rendering.

**Acceptance Scenarios**:

1. **Given** a user is in the container view, **When** they look at the left toolbar, **Then** they see the following new shape types: Static Content (Folder icon), User Interface (browser/window icon), Backend Service (terminal/server icon), Storage Bucket (cloud bucket icon), and Database (cylinder icon).
2. **Given** a new shape type is in the toolbar, **When** the user drags it onto the canvas, **Then** a new element of the corresponding type is created with an appropriate default label.
3. **Given** a shape is placed on the canvas, **When** rendered, **Then** it uses a visually distinct icon or shape outline that matches its type (e.g., cylinder for Database, folder tabs for Static Content, window chrome for User Interface).
4. **Given** any new shape type is created, **When** the user interacts with it, **Then** it supports the same baseline interactions as existing shapes (move, resize, label edit, connect with arrows, delete).

---

### User Story 3 - Element Color and Formatting (Priority: P3)

As an architect, I want to customize the color and basic formatting of any element on the canvas—including border/background color and font color—so that I can add visual grouping, emphasis, or organizational meaning to diagrams.

**Why this priority**: Color and formatting are enhancing features that improve visual clarity and expressiveness, but the diagram is still functional without them.

**Independent Test**: Can be tested by selecting any node element, verifying the right-side properties panel opens, changing background color, border color, and font color, and confirming the element updates live on the canvas.

**Acceptance Scenarios**:

1. **Given** a user selects a node element on the canvas, **When** the right-side properties panel opens, **Then** options for background color, border color, and font color are available.
2. **Given** the formatting panel is open, **When** the user picks a new background color, **Then** the element's background updates immediately on the canvas.
3. **Given** the formatting panel is open, **When** the user picks a new font color, **Then** all text within the element updates to that color.
4. **Given** the formatting panel is open, **When** the user picks a new border color, **Then** the element's border updates to that color.
5. **Given** a user has customized colors on an element, **When** the diagram is saved and re-opened, **Then** all custom colors are preserved.
6. **Given** a user wants to reset colors, **When** they choose a "Reset to Default" option, **Then** the element returns to its default color scheme.

---

### Edge Cases

- What happens when a user marks a system with no containers as external? (No warning should appear; system is simply marked external.)
- What happens when a user tries to connect an arrow from/to an external system? (Should remain allowed — relationships to external systems are valid in C4.)
- What happens when a new container shape type has very long label text? (Label should wrap or truncate consistently with existing shapes.)
- What happens if a user applies a very dark background color with default font color? (Font remains its chosen color; no automatic contrast enforcement for v1, but reset option must be available.)
- What happens when a diagram with custom colors is exported or shared? (Custom colors must be part of the saved diagram data.)

## Requirements _(mandatory)_

### Functional Requirements

**External System Marking**

- **FR-001**: System MUST provide an option on each system element in the system context view to toggle its "external" status.
- **FR-002**: System MUST visually differentiate external systems from internal systems using a distinct color or visual treatment.
- **FR-003**: External system elements MUST NOT be drillable — attempting to open/navigate into them must have no effect or display a disabled indicator.
- **FR-004**: When marking an existing internal system that has containers as external, the system MUST display a warning that all underlying containers will be permanently deleted.
- **FR-005**: The warning MUST require explicit user confirmation before any containers are deleted or the system type changes.
- **FR-006**: Users MUST be able to reverse an external system back to internal status. When reverted, the system's container view starts empty (containers previously deleted are not restored).
- **FR-007**: When a system with no containers is marked external, no warning dialog is required.

**New Container Diagram Types**

- **FR-008**: The container view left toolbar MUST include five new draggable element types: Static Content (Folder), User Interface, Backend Service, Storage Bucket, and Database.
- **FR-009**: Each new element type MUST render with a visually distinct shape or icon that reflects its semantic meaning (folder tabs, browser window, terminal/server, cloud bucket, cylinder).
- **FR-010**: Each new element type MUST support all standard container element interactions: placement, movement, resizing, label editing, arrow connections, and deletion.
- **FR-011**: Each new element type MUST have a meaningful default label upon creation (e.g., "Database", "User Interface", "Backend Service").

**Element Color and Formatting**

- **FR-012**: Users MUST be able to select any node element on the canvas and access formatting options for background color, border color, and font color. Relationship arrows/edges are excluded from color formatting in v1. Exception: external system elements have a fixed color treatment and the formatting panel's color options MUST be disabled for them.
- **FR-013**: Color changes MUST be reflected on the canvas immediately (live preview).
- **FR-014**: Custom color settings MUST be persisted as part of the diagram's saved state.
- **FR-015**: Users MUST be able to reset an element's colors to its default values.
- **FR-016**: The color selection interface MUST support at minimum a predefined color palette or color picker input.

### Key Entities

- **System Element**: A node in the system context view; has an `isExternal` boolean, display color override, and a conditional drill-down link to a container view.
- **Container Element**: A node in the container view; has a `type` attribute (existing types + 5 new types), label, position, size, and formatting properties (background color, border color, font color).
- **Diagram State**: The persisted representation of the canvas; includes all element types, positions, labels, external flags, and per-element formatting overrides.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Architects can mark any system as external in 2 interactions or fewer (e.g., right-click → toggle).
- **SC-002**: When a system with containers is marked external, a warning dialog appears 100% of the time before any data is deleted.
- **SC-003**: All 5 new container shape types are accessible from the toolbar and placeable on the canvas without errors.
- **SC-004**: Users can change an element's background, border, and font color in under 30 seconds.
- **SC-005**: Custom colors survive save/reload cycles with 100% fidelity — no color resets on re-open.
- **SC-006**: External systems are visually distinct enough that users can identify them without reading element labels.

## Clarifications

### Session 2026-03-29

- Q: When a user reverts an external system back to internal, what is the initial state of its container view? → A: Empty container view (fresh start, consistent with the permanent deletion warning)
- Q: When an element is marked external, does custom color formatting take precedence or is the external color locked? → A: External color is locked; the formatting panel's color options are disabled for external system elements
- Q: Should color formatting apply to relationship arrows/edges as well as node elements? → A: Nodes only for v1; arrows retain default styling
- Q: Where should the formatting panel surface in the UI? → A: Right-side properties panel, revealed when an element is selected

## Assumptions

- The existing system context view has per-element context menus or selection panels where new options can be added.
- The existing container view has a left toolbar that supports adding new draggable element types.
- Diagram state is already persisted; color/formatting data will be added to the same persistence mechanism.
- A color palette (predefined colors) is sufficient for v1; freeform hex/RGB input is a nice-to-have but not required.
- Formatting options apply uniformly to all element types, including the new container types.
- Existing relationships/arrows connected to a system are preserved when the system is marked external; only the system's containers are deleted, not the system node itself or its context-level connections.
- Mobile/touch support for the formatting panel is out of scope for v1.
