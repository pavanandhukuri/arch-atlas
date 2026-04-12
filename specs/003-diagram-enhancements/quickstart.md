# Quickstart: Diagram Enhancements

**Feature**: 003-diagram-enhancements
**Date**: 2026-03-29

This guide explains how to develop, test, and verify the three capabilities delivered by this feature.

---

## Prerequisites

```bash
# From the repository root
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages (core-model, layout, renderer, model-schema)
```

---

## Development Flow

This feature touches three packages in dependency order:

```
packages/core-model  →  packages/renderer  →  apps/studio
```

Always build and test `core-model` before working on `renderer`, and build `renderer` before working on `studio`.

### 1. core-model changes

```bash
cd packages/core-model
pnpm test --watch     # TDD: write failing test, implement, pass
pnpm build
```

Key files to modify:

- `src/types.ts` — add `ContainerSubtype`, `ElementFormatting`, extend `Element`
- `src/errors.ts` — add `INVALID_ATTRIBUTE` to `ErrorCode`
- `src/rules/` — add `validate-element-attributes.ts`, update `hierarchy.ts`
- `src/validate.ts` — include new rule in validation pipeline
- `src/index.ts` — export new types

### 2. renderer changes

```bash
cd packages/renderer
pnpm test --watch
pnpm build
```

Key file to modify:

- `src/renderer.ts` — add shape drawing functions, external system styling, formatting overrides

Shape drawing functions to add:

- `drawDatabase(g: Graphics, w: number, h: number)` — cylinder
- `drawStorageBucket(g: Graphics, w: number, h: number)` — trapezoid
- `drawStaticContent(g: Graphics, w: number, h: number)` — folder with tab
- `drawUserInterface(g: Graphics, w: number, h: number)` — browser window
- `drawBackendService(g: Graphics, w: number, h: number)` — terminal rectangle

### 3. studio changes

```bash
cd apps/studio
pnpm test --watch
pnpm dev              # Development server at http://localhost:3000
```

Key files to modify/create:

- `src/components/element-palette/ElementPalette.tsx` — new container subtype buttons
- `src/components/model-editor/ElementEditor.tsx` — isExternal toggle + warning
- `src/components/properties-panel/PropertiesPanel.tsx` — NEW file
- `src/app/studio-page.tsx` — wire up PropertiesPanel, handle external warning

---

## Running Tests

```bash
# From repo root — runs all packages via Turbo
pnpm test

# Per-package
cd packages/core-model && pnpm test
cd packages/renderer && pnpm test
cd apps/studio && pnpm test

# Coverage report
cd apps/studio && pnpm test --coverage
```

**Coverage target**: ≥ 80% for each changed package.

---

## Manual Verification Checklist

### External System Marking

- [ ] In system context view, select a system → options show "Mark as External"
- [ ] Mark a system with containers → warning dialog appears before deletion
- [ ] Cancel warning → system unchanged, containers intact
- [ ] Confirm warning → system shows in grey/muted color, drill-down disabled
- [ ] Double-click external system → no navigation occurs
- [ ] External system options show "Mark as Internal"
- [ ] Revert to internal → container view opens empty

### New Container Types

- [ ] Open container view → toolbar shows all 5 new types (with labels)
- [ ] Drag each type onto canvas → correct shape renders
- [ ] Cylinder for Database, folder tab for Static Content, browser chrome for User Interface, bucket for Storage Bucket, `>_` for Backend Service
- [ ] All new shapes support: move, resize, label edit, arrow connect, delete

### Color Formatting

- [ ] Select any non-external node → right-side properties panel appears
- [ ] Pick background color → canvas updates immediately (no save needed)
- [ ] Pick border color → border updates immediately
- [ ] Pick font color → label text updates immediately
- [ ] Save and reload diagram → all colors preserved
- [ ] Click "Reset to Default" → element returns to kind's default C4 colors
- [ ] Select external system → properties panel hidden / color options disabled

---

## Architecture Notes for Implementers

- **No new runtime dependencies** — all changes use existing PixiJS, React, and TypeScript capabilities.
- **TDD required** — write the test first, confirm it fails, then implement.
- **Formatting is on Element, not View** — the same element shows its custom colors regardless of which diagram level it appears in.
- **The `'default'` subtype** — renderers MUST treat `containerSubtype === 'default'` and `containerSubtype === undefined` identically, for forward-compatibility.
- **Color validation** — enforce `/^#[0-9a-fA-F]{6}$/` at both the model-validation layer (core-model) and the input layer (PropertiesPanel — only offer valid swatches, no free-text input in v1).
