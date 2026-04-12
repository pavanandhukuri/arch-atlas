# Data Model: Diagram Enhancements

**Feature**: 003-diagram-enhancements
**Date**: 2026-03-29
**Source**: `packages/core-model/src/types.ts`

---

## New Types

### `ContainerSubtype`

```typescript
/**
 * Visual subtype for container elements.
 * Controls the shape rendered in the container view.
 * Only valid on elements with kind === 'container'.
 */
export type ContainerSubtype =
  | 'default' // Standard rounded rectangle (existing behavior)
  | 'database' // Cylinder shape
  | 'storage-bucket' // Trapezoid/bucket shape
  | 'static-content' // Folder shape with tab
  | 'user-interface' // Browser window shape
  | 'backend-service'; // Terminal/server shape
```

### `ElementFormatting`

```typescript
/**
 * Per-element color overrides.
 * All fields are optional; absent fields fall back to the renderer's
 * default C4 color for that element kind.
 * Color strings MUST match /^#[0-9a-fA-F]{6}$/ (6-digit hex).
 * Not applicable to external system elements (isExternal === true);
 * studio disables the formatting panel for those elements.
 */
export interface ElementFormatting {
  backgroundColor?: string; // e.g. '#ffffff'
  borderColor?: string; // e.g. '#1168bd'
  fontColor?: string; // e.g. '#000000'
}
```

---

## Modified Types

### `Element` (extended)

```typescript
export interface Element {
  id: string;
  kind: ElementKind;
  name: string;
  description?: string;
  parentId?: string;
  tags?: string[];
  technology?: string;
  componentType?: string;
  codeRef?: CodeReference;
  attributes?: Record<string, unknown>;

  // --- NEW FIELDS ---

  /**
   * Marks a system as belonging to an external organization.
   * Only valid when kind === 'system'.
   * External systems:
   *   - Render in a distinct muted color
   *   - Cannot be drilled into (no container view)
   *   - Cannot have children (parentId pointing to this element is invalid)
   *   - Cannot have formatting overrides (formatting panel is disabled in studio)
   */
  isExternal?: boolean;

  /**
   * Visual subtype for container elements.
   * Only valid when kind === 'container'.
   * Controls the PixiJS shape drawn in the container view.
   * Defaults to 'default' (rounded rectangle) when absent.
   */
  containerSubtype?: ContainerSubtype;

  /**
   * Per-element color overrides applied by the renderer.
   * Only valid when isExternal !== true.
   * All color strings must be 6-digit hex (e.g. '#1168bd').
   */
  formatting?: ElementFormatting;
}
```

---

## State Transitions

### System: Internal ↔ External

```
[Internal System]
    │
    │  user selects "Mark as External"
    │
    ├── has children? → show warning dialog
    │       │
    │       ├── user cancels → stays [Internal System]
    │       │
    │       └── user confirms → delete all children
    │                           → isExternal = true
    │                           → formatting = undefined
    │                           → [External System]
    │
    └── no children → isExternal = true
                    → [External System]

[External System]
    │
    │  user selects "Mark as Internal"
    │
    └── isExternal = false → [Internal System, empty container view]
```

### Element: Unformatted ↔ Formatted

```
[Element, default colors]
    │
    │  user selects color in PropertiesPanel
    │
    └── updateModel({ ...element, formatting: { backgroundColor: '#...' } })
        → canvas repaints within next animation frame
        → autosave triggered (dirty = true)
        → [Element, custom colors]

[Element, custom colors]
    │
    │  user clicks "Reset to Default"
    │
    └── updateModel({ ...element, formatting: undefined })
        → [Element, default colors]
```

---

## Validation Rules (additions to `packages/core-model/src/rules/`)

### New rule: `validate-element-attributes.ts`

| Rule                            | Condition                                                                                     | Error Code          | Severity            |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| `isExternal` kind guard         | `element.isExternal === true && element.kind !== 'system'`                                    | `INVALID_ATTRIBUTE` | error               |
| `containerSubtype` kind guard   | `element.containerSubtype !== undefined && element.kind !== 'container'`                      | `INVALID_ATTRIBUTE` | error               |
| External system has no children | `element.isExternal && elements.some(e => e.parentId === element.id)`                         | `INVALID_HIERARCHY` | error               |
| Formatting color format         | `formatting.backgroundColor` / `borderColor` / `fontColor` not matching `/^#[0-9a-fA-F]{6}$/` | `INVALID_ATTRIBUTE` | error               |
| Formatting on external system   | `element.isExternal && element.formatting !== undefined`                                      | `INVALID_ATTRIBUTE` | warning (not error) |

---

## Persistence

No new persistence layer required. All new fields are serialized as part of the existing `Element` object in the `.arch.json` file (or Google Drive equivalent). The `StorageProvider` interface is unchanged.

**Example persisted element (database container, custom colors)**:

```json
{
  "id": "db-001",
  "kind": "container",
  "name": "User Database",
  "description": "Stores user accounts and sessions",
  "parentId": "system-001",
  "containerSubtype": "database",
  "formatting": {
    "backgroundColor": "#fef3c7",
    "borderColor": "#d97706",
    "fontColor": "#92400e"
  }
}
```

**Example persisted element (external system)**:

```json
{
  "id": "ext-001",
  "kind": "system",
  "name": "SendGrid",
  "description": "Email delivery service",
  "isExternal": true
}
```

---

## Renderer Interface Changes

The `updateLayout()` call receives `Element[]` from the model. The renderer reads `element.isExternal`, `element.containerSubtype`, and `element.formatting` to determine visual treatment. No new renderer API methods are required; the existing `updateLayout(model, view, metadata)` signature is sufficient.

**Visual rules applied in renderer**:

| Element property                         | Visual effect                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `isExternal === true`                    | Muted grey fill (`#bbbbbb`), grey border, grey label text; no drill-down cursor |
| `containerSubtype === 'database'`        | Cylinder shape (ellipse top, rect body, ellipse bottom)                         |
| `containerSubtype === 'storage-bucket'`  | Trapezoid shape (wider top, narrower bottom)                                    |
| `containerSubtype === 'static-content'`  | Folder shape (rectangle with tab on upper-left)                                 |
| `containerSubtype === 'user-interface'`  | Browser window shape (title bar + 3 dot circles + body)                         |
| `containerSubtype === 'backend-service'` | Rectangle with `>_` terminal indicator in top-left                              |
| `formatting.backgroundColor`             | Override fill color                                                             |
| `formatting.borderColor`                 | Override border/stroke color                                                    |
| `formatting.fontColor`                   | Override label text color                                                       |
