# Research: Diagram Enhancements

**Feature**: 003-diagram-enhancements
**Date**: 2026-03-29

---

## Decision 1: Where to store `isExternal` and `containerSubtype`

**Decision**: Add `isExternal?: boolean` and `containerSubtype?: ContainerSubtype` directly to the existing `Element` interface in `packages/core-model/src/types.ts`.

**Rationale**: The `Element` interface already holds `technology`, `componentType`, and `codeRef` as kind-specific optional fields. Adding `isExternal` (system-only) and `containerSubtype` (container-only) follows the same established pattern. Using `attributes: Record<string, unknown>` as a bag would bypass type safety — rejected by Constitution Principle II.

**Alternatives considered**:

- Subtype interfaces (e.g., `SystemElement extends Element`) — would require discriminated unions throughout the codebase and breaking changes in all consumers; overkill for two optional fields.
- `attributes` bag — untyped, violates strict TypeScript contract requirements.

---

## Decision 2: Where to store per-element formatting

**Decision**: Add `formatting?: ElementFormatting` to the `Element` interface, where `ElementFormatting` is a new interface with optional `backgroundColor`, `borderColor`, and `fontColor` string fields (hex format, e.g. `#1168bd`).

**Rationale**: Formatting is element-scoped and must survive save/reload cycles. Storing it on `Element` means it's automatically included in the existing JSON serialization path (`.arch.json`), requires no new persistence layer, and is validated by the existing `validateModel()` pipeline once schema rules are added.

**Alternatives considered**:

- Separate `FormattingOverrides` map keyed by element ID alongside the model — would require a parallel persistence path and a new top-level field on `ArchitectureModel`; more complex for no benefit at this scale.
- View-level formatting — formatting is per-element identity, not per-view; same element appears consistently regardless of which view level you're viewing from.

---

## Decision 3: Naming — disambiguating "external" concepts

**Decision**: The new flag is named `isExternal: boolean` on `Element`. The renderer's existing concept of elements rendered "outside the current view scope" (neighboring systems shown for context) uses a separate `isInScope` prop passed at render time and is not stored on the model. These two concepts must not be confused.

**Naming clarity**:

- `element.isExternal = true` → model-level flag: "this system belongs to an external organization"
- Renderer `metadata.isInScope = false` → render-time flag: "this element is not the focus of the current diagram view"

Both flags affect visual styling but are orthogonal. An external-organization system (`isExternal=true`) that is the focus system of the current view will have `isInScope=true` — it would show in its distinctive external color, not in the muted scope-boundary style.

---

## Decision 4: PixiJS shape approach for new container subtypes

**Decision**: Implement each new container subtype as a custom PixiJS `Graphics` drawing function within `renderer.ts`. No new PixiJS plugins or external shape libraries are required.

**Shape strategies**:

| Subtype           | Visual           | Drawing Approach                               |
| ----------------- | ---------------- | ---------------------------------------------- |
| `database`        | Cylinder         | Two ellipses (top + bottom) + rectangle body   |
| `storage-bucket`  | Trapezoid bucket | Quadrilateral with wider top, narrower bottom  |
| `static-content`  | Folder           | Rectangle with tab cutout on upper-left corner |
| `user-interface`  | Browser window   | Rectangle + title bar strip + 3 dot circles    |
| `backend-service` | Terminal         | Rectangle + `> _` text indicator in top-left   |

All shapes share the same interaction model (click, drag, connect) as existing containers since they use the same event attachment pattern in the renderer.

**Rationale**: PixiJS `Graphics` API is already used for all existing shapes (rounded rects, person icon). Pure draw code requires no new dependencies and keeps CSP compliance.

**Alternatives considered**:

- SVG sprites — cannot be rendered inside a PixiJS WebGL canvas without a texture step; adds complexity.
- External icon libraries (e.g., react-icons) — would render outside the canvas, not inside it; doesn't apply.

---

## Decision 5: Properties panel implementation

**Decision**: The right-side properties panel is a React component (`PropertiesPanel.tsx`) rendered outside the PixiJS canvas (as a sidebar in `studio-page.tsx`), shown when `selectedElementId` is set. It reads the selected element's current formatting and dispatches model updates through the existing `ModelStore.updateModel()` path.

**Color picker**: A predefined palette of 12–16 swatches (matching C4 palette + common colors) is sufficient for v1. No external color picker library needed — rendered as a CSS grid of colored `<button>` elements.

**Live preview**: Selecting a color immediately calls `updateModel()` on the store. Since the renderer's `updateLayout()` is called on every store change, the canvas updates within the next animation frame.

**Rationale**: Keeps the panel in React (not inside PixiJS), consistent with ElementEditor and RelationshipEditor patterns. No new state management needed — `ModelStore` already handles dirty tracking and autosave.

**Alternatives considered**:

- In-canvas floating toolbar — complex hit-testing, breaks keyboard accessibility, harder to test.
- Right-click context menu — rejected during clarification (Q4, answered B: properties panel).

---

## Decision 6: Validation rules for new element attributes

**Decision**: Add the following validation rules to `packages/core-model/src/rules/`:

1. `isExternal` — only valid on elements with `kind === 'system'`; error if set on any other kind.
2. `containerSubtype` — only valid on elements with `kind === 'container'`; error if set on any other kind.
3. External systems — MUST NOT have children (elements with `parentId` pointing to an external system) after marking; enforced in the studio UI (warning + delete) and as a validation error.
4. `formatting.backgroundColor`, `formatting.borderColor`, `formatting.fontColor` — if present, MUST match `/^#[0-9a-fA-F]{6}$/` (6-digit hex); error if malformed.
5. External system elements — MUST NOT have a non-null `formatting` object; or `formatting` is silently ignored for external elements (studio disables the panel, validator emits a warning, not an error, to allow forward-compatibility).

**Rationale**: Validation at the `core-model` level prevents invalid states from being persisted, regardless of which UI path creates them. This is especially important since the model can also be hand-edited as a JSON file.

---

## Decision 7: JSON schema update

**Decision**: Extend `packages/model-schema/` with the new fields. The existing schema files define the canonical JSON structure. The `model-schema` package is used for documentation and potential external tooling validation; it does not currently block runtime behaviour (the TypeScript types are authoritative at runtime).

New fields to add to the element schema:

- `isExternal` (boolean, optional)
- `containerSubtype` (enum of ContainerSubtype values, optional)
- `formatting` (object with optional `backgroundColor`, `borderColor`, `fontColor` strings, optional)

---

## Summary of Resolved Unknowns

| Unknown                                                 | Resolution                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Where does `isExternal` live?                           | On `Element` interface, `core-model/types.ts`                      |
| Where does `containerSubtype` live?                     | On `Element` interface, `core-model/types.ts`                      |
| Where does per-element formatting live?                 | On `Element.formatting`, persisted in `.arch.json`                 |
| How are new shapes rendered?                            | Custom PixiJS `Graphics` draw functions in `renderer.ts`           |
| How is the properties panel implemented?                | React sidebar component, outside the canvas                        |
| How is live preview achieved?                           | `updateModel()` → store change → `updateLayout()` → PixiJS repaint |
| What happens when a formatted element becomes external? | Studio disables the panel; validator emits a warning (not error)   |
