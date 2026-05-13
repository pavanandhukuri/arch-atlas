# Tasks: Diagram Viewer and Zoom

**Input**: Design documents from `/specs/006-diagram-viewer-zoom/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — constitution mandates TDD (write test → confirm fail → implement).

**Organization**: Tasks grouped by user story. Phase 2 (Foundational) MUST complete before any story begins.

---

## Phase 1: Setup

**Purpose**: No new packages or build config required — existing monorepo infrastructure is sufficient.

- [x] T001 Verify `packages/renderer` builds and tests pass with `pnpm --filter @arch-atlas/renderer test` before making any changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Renderer-level changes that BOTH user stories depend on. US1 needs `readOnly`; US2 needs `ZOOM_MIN`/`ZOOM_MAX`. MapCanvas bridges both.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add `readOnly?: boolean` to `RendererOptions` in `packages/renderer/src/renderer.ts`; when `true`, skip registering `pointerdown`/`pointermove` drag and connection handlers on element boxes (search for `box.on('pointerdown'` and gate behind `!options.readOnly`)
- [x] T003 Add exported constants `ZOOM_MIN = 0.1` and `ZOOM_MAX = 4.0` to `packages/renderer/src/renderer.ts` and re-export them from `packages/renderer/src/index.ts`
- [x] T004 Add `readOnly?: boolean` prop to `MapCanvasProps` in `apps/studio/src/components/map-canvas/MapCanvas.tsx`; pass it into the `createRenderer(container, { readOnly })` call

**Checkpoint**: `packages/renderer` build + tests still pass; `MapCanvas` compiles with `readOnly` prop.

---

## Phase 3: User Story 1 — Read-Only Diagram View (Priority: P1) 🎯 MVP

**Goal**: Standalone `/view/[id]` route loads a model from Google Drive and renders it with no editing controls.

**Independent Test**: Navigate to `/view/[someFileId]` with a valid authenticated session; confirm the diagram renders, no palette/edit controls appear, and clicking/dragging elements does nothing.

### Tests for User Story 1

> **Write tests FIRST — confirm they FAIL before implementing.**

- [x] T005 [P] [US1] Write unit tests for `DiagramViewer` component covering: renders model, renders empty-state when model has no elements, renders loading state, renders error state — in `apps/studio/test/components/DiagramViewer.test.tsx`
- [x] T006 [P] [US1] Write unit test asserting `MapCanvas` is called with `readOnly={true}` when rendered inside `DiagramViewer` — add to `apps/studio/test/components/DiagramViewer.test.tsx`

### Implementation for User Story 1

- [x] T007 [US1] Create `apps/studio/src/components/diagram-viewer/DiagramViewer.tsx` — `'use client'` component with props `{ model, view, isLoading?, error? }`; renders `<MapCanvas readOnly model={model} view={view} .../>` when model is non-null; renders empty-state `<p>This diagram has no elements yet.</p>` when model has zero elements; renders loading indicator when `isLoading`; renders error message when `error` is non-null (see contracts/diagram-viewer-component.md)
- [x] T008 [US1] Create `apps/studio/src/components/diagram-viewer/index.ts` — re-export `DiagramViewer` and `DiagramViewerProps`
- [x] T009 [US1] Create `apps/studio/src/app/view/[id]/viewer-page.tsx` — `'use client'` component; accepts `fileId: string` prop; uses `useGoogleDriveAuth` hook for auth state; on mount calls `GoogleDriveProvider.load({ ref: fileId, type: 'google-drive', fileName: '', lastKnownModified: null })`; maps result to `DiagramViewer` props (loading/error/model); renders `DiagramViewer` with the first view from `model.views[0]`
- [x] T010 [US1] Create `apps/studio/src/app/view/[id]/page.tsx` — Next.js server component; reads `params.id`; renders `<Suspense fallback={...}><ViewerPage fileId={params.id} /></Suspense>`; add `export const dynamic = 'force-dynamic'`

**Checkpoint**: US1 independently testable — `DiagramViewer` tests pass; navigating to `/view/[id]` renders the read-only diagram.

---

## Phase 4: User Story 2 — Zoom In and Zoom Out (Priority: P2)

**Goal**: Zoom via scroll wheel, keyboard shortcuts (Ctrl/Cmd +/-/0), and on-screen buttons — works in both viewer and editor.

**Independent Test**: Open any diagram in viewer or editor; scroll up to zoom in, Ctrl/Cmd `+` to zoom in, click `+` button; verify diagram scales and ZoomControls percentage label updates; Ctrl/Cmd `0` fits diagram.

### Tests for User Story 2

> **Write tests FIRST — confirm they FAIL before implementing.**

- [x] T011 [P] [US2] Write unit tests for `useZoom` hook in `apps/studio/test/hooks/useZoom.test.ts` covering: initial level is 1.0; `zoomIn` multiplies by 1.2 clamped to ZOOM_MAX; `zoomOut` divides by 1.2 clamped to ZOOM_MIN; `fitToView` resets level to 1.0; scroll-wheel up fires zoomIn; Ctrl/Cmd `+` fires zoomIn and prevents browser default; Ctrl/Cmd `0` fires fitToView
- [x] T012 [P] [US2] Write unit test for `ZoomControls` component in `apps/studio/test/components/ZoomControls.test.tsx` covering: renders zoom percentage label; clicking `+` calls `onZoomIn`; clicking `−` calls `onZoomOut`; clicking fit-to-view calls `onFitToView`; all buttons have correct `aria-label`

### Implementation for User Story 2

- [x] T013 [US2] Create `apps/studio/src/hooks/useZoom.ts` — implements `UseZoomResult` interface; `attachToRenderer(renderer, container)` adds `wheel` and `keydown` listeners; returns cleanup function; `zoomIn`/`zoomOut` step by ×1.2 clamped to `[ZOOM_MIN, ZOOM_MAX]`; `fitToView` resets to 1.0 and calls `renderer.pan(0, 0)` then `renderer.setZoom(1.0)`
- [x] T014 [US2] Create `apps/studio/src/components/zoom-controls/ZoomControls.tsx` — floating overlay `position: absolute; bottom: 12px; right: 12px`; renders `−` / `+` / fit-to-view buttons with aria-labels; zoom percentage label with `aria-live="polite"`
- [x] T015 [US2] Create `apps/studio/src/components/zoom-controls/index.ts` — re-export `ZoomControls` and `ZoomControlsProps`
- [x] T016 [US2] Integrate zoom into `DiagramViewer` — add `useZoom` hook; call `attachToRenderer` in `useEffect` after renderer mounts; render `<ZoomControls>` overlay
- [x] T017 [US2] Integrate zoom into `StudioPage` — add `useZoom` hook; wire `attachToRenderer`; add `<ZoomControls>` overlay to canvas wrapper

**Checkpoint**: US2 independently testable — `useZoom` and `ZoomControls` tests pass; zoom works identically in both `/view/[id]` and the Studio editor.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T018 [P] Add CSS for `ZoomControls` hover state in `apps/studio/src/app/globals.css`
- [x] T019 [P] Add `aria-live="polite"` region to `ZoomControls` zoom percentage label
- [x] T020 Walk through all 9 quickstart.md scenarios manually in the browser and confirm each passes; fix any regressions in existing Studio editor interactions (drag, connection, drill-down) — MANUAL (Scenarios 1–6 cover existing work; Scenarios 7–9 after Phase 7 is complete)

---

## Phase 6: User Story 3 — Extract Shared Viewer Components Package

**Goal**: Move `MapCanvas`, `DiagramViewer`, `ZoomControls`, and `useZoom` into `packages/viewer-components` so both Studio and the standalone bundle share them.

**⚠️ NOTE**: This phase refactors existing working code. Run the full test suite before and after each task.

### Tests for User Story 3 — Package Extraction

- [x] T021 [US3] Verify full test suite passes before extraction: `pnpm --filter @arch-atlas/studio test` — record baseline pass count

### Implementation for User Story 3 — Package Extraction

- [x] T022 [US3] Create `packages/viewer-components/package.json` with `name: "@arch-atlas/viewer-components"`, `peerDependencies: { react, react-dom }`, `dependencies: { @arch-atlas/renderer, @arch-atlas/core-model }`, and `exports` pointing to `./src/index.ts`; create `packages/viewer-components/tsconfig.json` extending the root tsconfig with `paths` for workspace deps
- [x] T023 [US3] Create `packages/viewer-components/src/index.ts` barrel — will export `MapCanvas`, `DiagramViewer`, `ZoomControls`, `useZoom`, and their prop types
- [x] T024 [US3] Move `apps/studio/src/components/map-canvas/MapCanvas.tsx` → `packages/viewer-components/src/components/map-canvas/MapCanvas.tsx`; remove `'use client'` directive (framework-agnostic); create `packages/viewer-components/src/components/map-canvas/index.ts`; add `MapCanvas` and `MapCanvasProps` to barrel
- [x] T025 [US3] Move `apps/studio/src/components/diagram-viewer/DiagramViewer.tsx` and `index.ts` → `packages/viewer-components/src/components/diagram-viewer/`; remove `'use client'`; add to barrel
- [x] T026 [US3] Move `apps/studio/src/components/zoom-controls/ZoomControls.tsx` and `index.ts` → `packages/viewer-components/src/components/zoom-controls/`; remove `'use client'`; add to barrel
- [x] T027 [US3] Move `apps/studio/src/hooks/useZoom.ts` → `packages/viewer-components/src/hooks/useZoom.ts`; remove `'use client'`; add to barrel
- [x] T028 [US3] Add `@arch-atlas/viewer-components` as a workspace dependency in `apps/studio/package.json`; update all import paths in `apps/studio/src/` that reference the moved files to import from `@arch-atlas/viewer-components`
- [x] T029 [US3] Update test mocks in `apps/studio/test/` — change `vi.mock('../../src/components/map-canvas/MapCanvas', ...)` to mock the package-internal path; update all other mocks that reference moved files
- [x] T030 [US3] Run full test suite — all 176 tests pass at baseline; Studio imports updated; vitest alias added for `@arch-atlas/viewer-components`

**Checkpoint**: Studio tests green; `packages/viewer-components` builds cleanly; no files remain in the old moved locations in `apps/studio`.

---

## Phase 7: User Story 3 — Standalone Viewer App

**Goal**: `apps/viewer` is a Vite + React app that reads `diagrams/manifest.json`, shows a picker, and renders the selected diagram read-only.

### Tests for User Story 3 — Standalone App

> **Write tests FIRST — confirm they FAIL before implementing.**

- [x] T031 [P] [US3] Write unit tests for `DiagramPicker` component in `apps/viewer/test/DiagramPicker.test.tsx` covering: renders list of diagram titles from manifest; clicking a title calls `onSelect` with the entry; renders "No diagrams available" when manifest is empty
- [x] T032 [P] [US3] Write integration test for `App.tsx` in `apps/viewer/test/App.test.tsx` covering: shows picker on load; selecting a diagram renders `DiagramViewer`; malformed JSON shows error state in viewer (mock `fetch`)

### Implementation for User Story 3 — Standalone App

- [x] T033 [US3] Create `apps/viewer/package.json`, `vite.config.ts` (`base: './'`, workspace aliases), `index.html`, `tsconfig.json`, `vitest.config.ts`; pin `@vitejs/plugin-react@^4.3.4` for Vite 5 compatibility; add `"type": "module"` to package.json
- [x] T034 [US3] Create `apps/viewer/public/diagrams/manifest.json` with sample entry and matching `sample.arch.json` (3-element model: Web App → API Server → Database)
- [x] T035 [US3] Create `apps/viewer/src/components/DiagramPicker.tsx` — renders titled list from manifest; "No diagrams available" when empty
- [x] T036 [US3] Create `apps/viewer/src/App.tsx` — fetches manifest, shows picker, loads diagram JSON on selection, renders `DiagramViewer` with loading/error/viewing states; Back button returns to picker
- [x] T037 [US3] Create `apps/viewer/src/main.tsx` — renders `<App />` into `#root`
- [ ] T038 [US3] Run `pnpm --filter @arch-atlas/viewer build` and verify `dist/` — DONE (✓ built in 726ms, 511 modules); serve with `npx serve dist` and walk through Quickstart Scenarios 7–9 manually — MANUAL

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1–5**: Complete ✅ (T001–T019 done; T020 partially done — re-verify after Phase 7)
- **Phase 6**: Depends on Phase 5 completion — refactors existing working code
- **Phase 7**: Depends on Phase 6 completion — `apps/viewer` imports from the package created in Phase 6

### Within Phase 6

- T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 (strictly sequential — each task builds on the prior)

### Within Phase 7

- T031 and T032 can run in parallel (different test files)
- T033 → T034 (scaffold before adding assets)
- T035 → T036 → T037 (component before wiring, wiring before entry point)
- T038 after T035–T037 (manual validation last)

---

## Implementation Strategy

### Completed Work (Phases 1–5)

- ✅ Renderer `readOnly` mode, `ZOOM_MIN`/`ZOOM_MAX`
- ✅ `DiagramViewer`, `ZoomControls`, `useZoom`, `MapCanvas` (in `apps/studio`)
- ✅ `/view/[id]` route with Google Drive loading
- ✅ Zoom in Studio editor
- ✅ 176 tests passing

### Next: Phase 6 (Extract Package)

1. Create `packages/viewer-components` scaffold (T022–T023)
2. Move components one at a time (T024–T027) — run tests after each move
3. Update Studio imports and mocks (T028–T029)
4. Verify full test suite (T030)

### Then: Phase 7 (Standalone Bundle)

1. Scaffold `apps/viewer` with Vite (T033–T034)
2. Write tests, implement DiagramPicker and App (T031–T037)
3. Build and manually verify (T038)

---

## Notes

- [P] = different files, no blocking dependencies between them
- TDD is mandatory per constitution — tests must be written and confirmed FAILING before each implementation task
- `ZOOM_MIN`/`ZOOM_MAX` from `@arch-atlas/renderer` are the single source of truth for zoom bounds
- `readOnly` in the renderer suppresses visual drag — CSS `pointer-events` alone is insufficient
- `'use client'` is removed from shared package components — `apps/studio` wraps them in its own `'use client'` boundary via `page.tsx` / `studio-page.tsx`
- `base: './'` in `vite.config.ts` ensures asset paths work when served from any subdirectory
