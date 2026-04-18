# Contract: Element Type Extensions

**Feature**: 003-diagram-enhancements
**Date**: 2026-03-29
**Scope**: Changes to the public contract of `@arch-atlas/core-model` and `@arch-atlas/renderer`

---

## @arch-atlas/core-model — Type Extensions

### New exports from `packages/core-model/src/types.ts`

Both `ContainerSubtype` and `ElementFormatting` are exported from the package's public API (`packages/core-model/src/index.ts`).

#### `ContainerSubtype` (new)

```typescript
export type ContainerSubtype =
  | 'default'
  | 'database'
  | 'storage-bucket'
  | 'static-content'
  | 'user-interface'
  | 'backend-service';
```

**Contract**:

- `'default'` is the implicit value when `containerSubtype` is absent; renderers MUST treat absent and `'default'` identically.
- Consumers MUST NOT assume this is an exhaustive list; renderers SHOULD render unknown subtypes as `'default'` for forward-compatibility.

#### `ElementFormatting` (new)

```typescript
export interface ElementFormatting {
  backgroundColor?: string;
  borderColor?: string;
  fontColor?: string;
}
```

**Contract**:

- All present color strings MUST match `/^#[0-9a-fA-F]{6}$/`.
- Absent fields MUST be treated as "use renderer default" (not as transparent/black).
- An empty object `{}` is semantically equivalent to `undefined`; validation emits a warning.

#### `Element` (extended)

```typescript
// New optional fields on the existing Element interface
isExternal?: boolean;           // kind === 'system' only
containerSubtype?: ContainerSubtype;  // kind === 'container' only
formatting?: ElementFormatting; // not valid when isExternal === true
```

**Contract**:

- Adding these fields is **non-breaking** — all fields are optional and absent values restore prior behaviour.
- Consumers that do not read these fields continue to function correctly.
- The `validateModel()` function now returns errors for constraint violations (see data-model.md validation rules).

### New error codes (additions to `ErrorCode`)

```typescript
// Added to existing ErrorCode union in errors.ts
| 'INVALID_ATTRIBUTE'
```

Used for kind-guard violations and malformed color strings.

---

## @arch-atlas/renderer — Rendering Contract

The `createRenderer()` function and `updateLayout()` method signatures are **unchanged**. The renderer reads new fields from `Element` objects passed inside the model argument.

### Rendering guarantees

| Condition                                                      | Guaranteed behaviour                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `element.isExternal === true`                                  | Element renders in muted grey; no drill-down cursor; `onDrillDown` callback NOT fired for this element |
| `element.containerSubtype` is a known value                    | Element rendered with corresponding shape                                                              |
| `element.containerSubtype` is unknown or absent                | Element rendered as `'default'` (rounded rectangle)                                                    |
| `element.formatting.backgroundColor` present                   | Applied as fill color; overrides kind default                                                          |
| `element.formatting.borderColor` present                       | Applied as stroke color; overrides kind default                                                        |
| `element.formatting.fontColor` present                         | Applied as label text color; overrides kind default                                                    |
| `element.isExternal === true` AND `element.formatting` present | `formatting` is silently ignored; external color treatment takes precedence                            |

### Backward compatibility

Existing `.arch.json` files without the new fields continue to load and render correctly. No migration step is required.

---

## apps/studio — New Component Contract

### `PropertiesPanel`

**Location**: `apps/studio/src/components/properties-panel/PropertiesPanel.tsx`

**Props**:

```typescript
interface PropertiesPanelProps {
  element: Element | null; // null → panel is hidden
  onFormatChange: (elementId: string, formatting: ElementFormatting | undefined) => void;
}
```

**Contract**:

- Panel is visible only when `element` is non-null AND `element.isExternal !== true`.
- Color swatches: minimum 12 predefined colors covering the C4 palette + neutral tones.
- "Reset to Default" option clears `formatting` (calls `onFormatChange(id, undefined)`).
- Panel does not own state; it reads from `element.formatting` and delegates all changes via `onFormatChange`.

---

## JSON Schema (packages/model-schema)

The `element.schema.json` file must be updated to reflect the new optional fields. This is a **backward-compatible** (additive) schema change — existing documents remain valid.

New fields to add under the `properties` key of the element schema object:

```json
"isExternal": {
  "type": "boolean",
  "description": "Marks a system as belonging to an external organization. Only valid when kind is 'system'."
},
"containerSubtype": {
  "type": "string",
  "enum": ["default", "database", "storage-bucket", "static-content", "user-interface", "backend-service"],
  "description": "Visual subtype for container elements. Only valid when kind is 'container'."
},
"formatting": {
  "type": "object",
  "description": "Per-element color overrides. Not valid for external systems.",
  "properties": {
    "backgroundColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
    "borderColor":     { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
    "fontColor":       { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" }
  },
  "additionalProperties": false
}
```
