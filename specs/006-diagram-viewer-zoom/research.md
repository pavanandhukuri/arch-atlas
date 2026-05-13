# Research: Diagram Viewer and Zoom

**Branch**: `006-diagram-viewer-zoom` | **Date**: 2026-05-02

---

## Decision 1: Where read-only mode is enforced

**Decision**: `readOnly` option lives in `packages/renderer` (`createRenderer(container, options)`), not in `MapCanvas` or higher.

**Rationale**: The renderer registers `pointerdown`/`pointermove` handlers directly on PixiJS `Graphics` objects for element dragging (confirmed at `renderer.ts:788–826`). Visual drag happens inside the renderer before any callback fires. A wrapper component cannot intercept this; the option must be passed at renderer creation time. Placing it in the renderer package also makes it reusable for any future non-Studio consumer.

**Alternatives considered**:

- Wrapping `MapCanvas` and ignoring drag callbacks — rejected because elements would still move visually even though callbacks are suppressed.
- CSS `pointer-events: none` on the canvas — rejected because it also blocks zoom scroll-wheel events which we need.

---

## Decision 2: Zoom event wiring location

**Decision**: A `useZoom` hook in `@arch-atlas/viewer-components` manages zoom state and wires scroll-wheel + keyboard events; it calls `renderer.setZoom()` imperatively via a ref. The renderer's `setZoom(zoom)` already exists at `renderer.ts:1109`.

**Rationale**: Zoom state (current level, min, max) is UI state that belongs in React. The renderer exposes an imperative `setZoom(number)` which is the right boundary — the renderer owns the visual transform, React owns the state. This mirrors the existing pattern for `updateLayout()` (called imperatively from `MapCanvas`).

**Cursor-centred zoom math**: When zooming via scroll wheel, the viewport offset must be adjusted so the point under the cursor stays fixed. Formula: `newPan = cursorPos - (cursorPos - oldPan) * (newZoom / oldZoom)`. This requires access to the renderer's `pan()` method, which already exists.

**Alternatives considered**:

- Embedding zoom state in the renderer — rejected because it would duplicate React state and make testing harder.
- Using CSS `transform: scale()` on the canvas container — rejected because it conflicts with PixiJS's own stage transform and breaks hit-testing.

---

## Decision 3: Viewer route and model loading

**Decision**: `/view/[id]` is a Next.js 14 App Router dynamic route where `[id]` is a Google Drive file ID. The viewer page uses the existing `GoogleDriveProvider.load()` to fetch the model. Google auth is required (reuses the existing `useGoogleDriveAuth` hook).

**Rationale**: Google Drive file IDs are stable, URL-safe strings. `GoogleDriveProvider.load({ ref: id, type: 'google-drive', ... })` already handles fetch, parse, and error codes. Local filesystem files cannot produce shareable URLs (browser security) — this is an acceptable limitation documented in Assumptions.

**Alternatives considered**:

- URL-encoding the full model in query params — rejected because large models would exceed URL length limits and it's not a stable shareable link.
- A `?src=` query param fetching from an arbitrary URL — rejected due to SSRF/phishing risk; an attacker-controlled URL would render content under the trusted domain.
- A new storage-agnostic ID system — rejected as out of scope; adds a new persistence layer when Drive IDs already serve the purpose.

---

## Decision 4: Zoom constants placement

**Decision**: Export `ZOOM_MIN = 0.1` and `ZOOM_MAX = 4.0` from `packages/renderer/src/renderer.ts` so `useZoom`, `ZoomControls`, and any future consumers share a single source of truth.

**Rationale**: Min/max are renderer concerns (they clamp the PixiJS stage scale). Centralising them prevents drift between the renderer's internal clamp and the hook's state.

---

## Decision 5: ZoomControls UI placement

**Decision**: `ZoomControls` is a floating overlay positioned `absolute` inside the canvas container (bottom-right corner). Used identically in `DiagramViewer` and wired into `studio-page.tsx` for the editor.

**Rationale**: Absolute positioning keeps the control visually attached to the canvas regardless of page layout. The same component in both contexts satisfies SC-005 ("zoom controls work identically in viewer and editor").

---

## Decision 6: Shared viewer components package

**Decision**: Extract `MapCanvas`, `DiagramViewer`, `ZoomControls`, and `useZoom` into a new workspace package `packages/viewer-components` (`@arch-atlas/viewer-components`). Both `apps/studio` and `apps/viewer` import from this package.

**Rationale**: Without a shared package, the standalone viewer bundle would have to duplicate or vendor the components, causing divergence. A workspace package lets pnpm link the source directly during development and allows the standalone Vite bundle and the Next.js Studio to share exactly the same code. `packages/renderer` sets the precedent — shared engine code lives in `packages/`.

**`'use client'` directives**: These are Next.js App Router hints. In a Vite/React context they are treated as plain string literals and have no effect. They can remain in the shared package to support Studio without breaking the standalone bundle.

**Alternatives considered**:

- Keeping components in `apps/studio` and importing them from there into `apps/viewer` — rejected because cross-app imports violate monorepo boundaries (constitution gate I).
- Duplicating components in `apps/viewer` — rejected because it creates divergence and doubles maintenance burden.

---

## Decision 7: Build tool for standalone viewer

**Decision**: Use Vite (with `@vitejs/plugin-react`) for `apps/viewer`. Output is a static `dist/` folder containing `index.html`, hashed JS/CSS bundles, and a `diagrams/` directory.

**Rationale**: Vite produces a fully static output with no server-side runtime, which is the requirement. Next.js `output: 'export'` could also produce static files but adds Next.js overhead (routing conventions, `app/` directory) for what is a single-page app. Vite is lighter, faster to build, and has no framework-imposed file structure constraints.

**Diagram discovery at runtime**: The picker lists diagrams by fetching `diagrams/manifest.json` — a static JSON file generated at build time or maintained manually, listing `{ id, title, file }` entries. Fetching a manifest avoids hardcoding diagram names in the bundle and allows operators to add diagrams post-build by updating `manifest.json` without rebuilding.

**Alternatives considered**:

- Next.js static export — rejected; adds unnecessary framework complexity for a single-page viewer.
- Inlining all diagram JSON into the bundle at build time — rejected because adding a diagram would require a rebuild; manifest approach allows post-deploy updates.
