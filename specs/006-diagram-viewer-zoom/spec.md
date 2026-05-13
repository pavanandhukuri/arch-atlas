# Feature Specification: Diagram Viewer and Zoom

**Feature Branch**: `006-diagram-viewer-zoom`  
**Created**: 2026-05-02  
**Status**: In Progress  
**Input**: User description: "Read-only diagram renderer — embeds the canvas as a pure view component with no editing controls. Can be used as a standalone page or embeddable component to share architecture diagrams. Also includes zoom in and zoom out on the editor and viewer. The viewer components and the editor must share a common package so the same rendering stack can be embedded in a standalone static bundle deployable to nginx."

## Clarifications

### Session 2026-05-02

- Q: How is the viewer surfaced in the app — toggle on existing editor, standalone route, or both? → A: Standalone shareable route (`/view/:id`) only; no in-editor toggle.
- Q: Should zoom respond to keyboard shortcuts? → A: Yes — Ctrl/Cmd `+` zooms in, Ctrl/Cmd `-` zooms out, Ctrl/Cmd `0` fits to view.

### Session 2026-05-07

- Q: Should the standalone bundle include a diagram picker UI or render one fixed diagram per deployment? → A: Include a picker listing all bundled `.arch.json` files so a single deployment can host multiple diagrams.
- Q: Is Google auth required in the standalone bundle? → A: No — the bundle loads pre-bundled static JSON files only; no auth or network requests to external services.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Read-Only Diagram View via Shareable Route (Priority: P1)

A developer or stakeholder wants to view an architecture diagram without accidentally modifying it. They navigate to a dedicated view URL (e.g., `/view/:id`) that loads a saved architecture model in read-only mode. The diagram renders fully — all elements, relationships, and labels are visible — but no editing controls appear. The URL can be shared with anyone who should see but not edit the diagram.

**Why this priority**: This is the core deliverable. Without a shareable read-only route, diagrams cannot be safely distributed. All other stories build on this.

**Independent Test**: Navigate to `/view/:id` for a saved model and confirm all elements and relationships render correctly, no palette or editing UI is visible, and no interaction modifies the model.

**Acceptance Scenarios**:

1. **Given** a saved architecture model with elements and relationships, **When** the user navigates to `/view/:id`, **Then** all elements, relationship lines, and labels are rendered and nothing is missing.
2. **Given** the viewer route is open, **When** the user clicks on an element, **Then** no editing panel, selection handles, or drag behaviour activates.
3. **Given** the viewer route is open, **When** the user attempts to drag an element, **Then** the element does not move and the model is unchanged.
4. **Given** the viewer route is open, **Then** no element palette, add-element controls, or DSL editor panel is visible.
5. **Given** the model has no elements, **When** the viewer route loads it, **Then** an empty-state message is shown instead of a blank canvas.
6. **Given** an invalid or non-existent model ID in the URL, **When** the viewer route loads, **Then** a clear error state is shown without crashing.

---

### User Story 2 - Zoom In and Zoom Out (Priority: P2)

A user viewing a large or complex diagram wants to zoom in to inspect a specific area or zoom out to see the full picture. They can zoom using on-screen buttons and the scroll wheel. The diagram scales smoothly. The same zoom capability works in both the read-only viewer route and the existing editable Studio canvas.

**Why this priority**: Zoom is essential usability for any diagram with more than a handful of elements. Without it, large diagrams are illegible. Applying it to both viewer and editor improves the whole product.

**Independent Test**: Open a diagram with 10+ elements in both viewer and editor, zoom in using scroll wheel and buttons, and confirm the diagram scales and remains readable at all zoom levels.

**Acceptance Scenarios**:

1. **Given** a diagram is open in the viewer or editor, **When** the user scrolls up (or clicks zoom-in), **Then** the diagram scales larger, centred on the cursor position.
2. **Given** a diagram is open in the viewer or editor, **When** the user scrolls down (or clicks zoom-out), **Then** the diagram scales smaller.
3. **Given** the user has zoomed in or out, **When** they click a "fit to view" control, **Then** the diagram scales to fill the available viewport and resets pan position.
4. **Given** a diagram is open in the viewer or editor, **When** the user presses Ctrl/Cmd `+`, **Then** the diagram zooms in centred on the midpoint; Ctrl/Cmd `-` zooms out; Ctrl/Cmd `0` fits to view.
5. **Given** the maximum zoom level is reached, **When** the user tries to zoom in further, **Then** the diagram stops scaling.
6. **Given** the minimum zoom level is reached, **When** the user tries to zoom out further, **Then** the diagram stops scaling.

---

### User Story 3 - Standalone Distributable Viewer Bundle (Priority: P3)

A team wants to publish architecture diagrams on an internal website or share them without requiring any cloud accounts or authentication. An engineer builds the standalone viewer bundle, drops one or more `.arch.json` files into the `diagrams/` folder, and deploys the resulting `dist/` output to nginx (or any static web server). Visitors open the page, see a list of available diagrams, pick one, and view it in a read-only canvas with full zoom support. No server, no auth, no external API calls.

**Why this priority**: Makes arch-atlas diagrams distributable artifacts — the diagram rendering stack becomes an embeddable, deployable product rather than a Studio-only feature. Depends on US1 and US2 being complete.

**Independent Test**: Run `pnpm --filter @arch-atlas/viewer build`, copy `dist/` to an nginx server, place a `.arch.json` file in `dist/diagrams/`, reload — confirm the diagram appears in the picker and renders correctly.

**Acceptance Scenarios**:

1. **Given** the built bundle is served from nginx with one `.arch.json` in `diagrams/`, **When** a user opens the root URL, **Then** the diagram name appears in a picker list.
2. **Given** the picker lists multiple diagrams, **When** the user selects one, **Then** the canvas renders that diagram in read-only mode.
3. **Given** the bundle is open, **Then** no editing controls, palette, or Google auth flow appears.
4. **Given** a diagram is loaded in the standalone bundle, **When** the user scrolls or uses the zoom buttons, **Then** zoom behaves identically to the Studio viewer.
5. **Given** the standalone bundle is deployed, **Then** it loads completely from static files with no requests to external APIs or auth endpoints.

---

### Edge Cases

- What happens when the model has no elements? The viewer shows an empty-state message rather than a blank canvas.
- What happens when the diagram is very large (50+ elements)? Fit-to-view should scale the whole diagram into the viewport.
- What happens when the user zooms in very far and then clicks fit-to-view? The viewport resets cleanly to the default scale and pan.
- What happens when the model ID in the URL is invalid or not found? A clear error state is shown without crashing.
- What happens when the standalone bundle's `diagrams/` folder is empty? The picker shows an "no diagrams available" message.
- What happens when a bundled `.arch.json` file is malformed? The viewer shows an error state for that diagram without crashing the whole picker.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST provide a standalone read-only diagram route at `/view/:id` that renders a saved architecture model without any editing controls.
- **FR-002**: The read-only route MUST NOT expose element palette, drag-to-move, add-element, or delete-element interactions.
- **FR-003**: The read-only route MUST be directly navigable by URL so the link can be shared with others.
- **FR-004**: The read-only route MUST display all elements, relationships, and labels from the model.
- **FR-005**: The read-only route MUST show an empty-state message when the model contains no elements.
- **FR-006**: The read-only route MUST show a clear error state when the model ID is invalid or the model cannot be loaded.
- **FR-007**: The system MUST support zoom in and zoom out on the diagram canvas in both the read-only viewer route and the existing editable Studio canvas.
- **FR-008**: Zoom MUST be triggerable via scroll wheel (mouse wheel and trackpad pinch-to-zoom).
- **FR-009**: Zoom MUST be triggerable via visible on-screen zoom-in and zoom-out buttons.
- **FR-010**: Zoom MUST be triggerable via keyboard shortcuts: Ctrl/Cmd `+` zooms in, Ctrl/Cmd `-` zooms out, Ctrl/Cmd `0` fits to view.
- **FR-011**: The system MUST provide a "fit to view" control that scales and repositions the diagram to fill the available viewport.
- **FR-012**: Zoom level MUST be clamped to a defined minimum and maximum to prevent unusable states.
- **FR-013**: Scroll-wheel zoom MUST centre on the cursor position; button and keyboard zoom MUST centre on the diagram midpoint.
- **FR-014**: The viewer UI components (`DiagramViewer`, `ZoomControls`, `MapCanvas`) and the `useZoom` hook MUST live in a dedicated workspace package (`@arch-atlas/viewer-components`) importable by both the Studio app and the standalone viewer bundle.
- **FR-015**: A standalone distributable viewer bundle (`apps/viewer`) MUST be buildable as static files deployable to any web server with no server-side runtime required.
- **FR-016**: The standalone bundle MUST load diagrams exclusively from `.arch.json` files co-located in the deployment's `diagrams/` directory — no external API calls, no authentication.
- **FR-017**: The standalone bundle MUST include a diagram picker listing all available bundled diagrams by name.
- **FR-018**: The standalone bundle MUST render the selected diagram using the same `DiagramViewer` and `ZoomControls` from `@arch-atlas/viewer-components` as the Studio viewer route.

### Key Entities

- **Diagram Viewer**: A self-contained, read-only rendering component that accepts an architecture model and displays it without editing affordances; surfaced at the `/view/:id` route and in the standalone bundle.
- **Zoom State**: The current scale factor and viewport pan offset of the canvas; applicable to both the viewer route and the editor.
- **Viewer Components Package**: A shared workspace package (`@arch-atlas/viewer-components`) containing `MapCanvas`, `DiagramViewer`, `ZoomControls`, and `useZoom` — the common dependency between Studio and the standalone bundle.
- **Diagram Manifest**: The list of `.arch.json` files bundled into the standalone viewer, used to populate the picker UI.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A diagram with 20 elements and 15 relationships renders completely at the `/view/:id` route within 2 seconds of page load.
- **SC-002**: Zero editing actions (move, add, delete) are achievable in the read-only route — all edit interactions result in no model mutation.
- **SC-003**: Zoom via scroll wheel produces a visible scale change within one animation frame with no perceptible lag on diagrams up to 50 elements.
- **SC-004**: The fit-to-view control restores the default viewport in under 300 ms.
- **SC-005**: Zoom controls work identically in both the read-only viewer route and the editable Studio canvas.
- **SC-006**: The standalone bundle `dist/` output contains only static files and can be served by nginx with no configuration beyond `root` pointing to `dist/`.
- **SC-007**: Adding a new `.arch.json` to `dist/diagrams/` and refreshing the page makes it appear in the picker without rebuilding.

## Assumptions

- The existing editable canvas already renders the model correctly; the viewer reuses that rendering without rewriting it.
- Model loading at `/view/:id` uses the same storage mechanism already implemented (Google Drive); no new storage layer is needed for the Studio route.
- Zoom state (scale + pan offset) is local UI state and is not persisted to the saved model file.
- Minimum zoom is defined as approximately 0.1×; maximum is 4.0×. Both constants live in `@arch-atlas/renderer`.
- Pan (drag-to-scroll the canvas) is out of scope for this feature; zoom must not break any existing pan behaviour.
- On-screen zoom controls consist of "+" and "−" buttons plus a fit-to-view button.
- Authentication / access control for the shareable URL is out of scope; the route is accessible to anyone with the link.
- The standalone bundle uses a `diagrams/manifest.json` file (auto-generated at build time or manually maintained) to enumerate available diagrams for the picker.
- The standalone bundle is built with Vite (not Next.js); `'use client'` directives in `@arch-atlas/viewer-components` are harmless string literals in a Vite/React context.
- Moving shared components to `@arch-atlas/viewer-components` requires updating Studio's import paths and test mocks — this is expected churn, not a regression.
