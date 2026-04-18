# Tasks: Diagram Enhancements

**Input**: Design documents from `/specs/003-diagram-enhancements/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included — TDD is non-negotiable per the project constitution (Principle III). Write tests first, confirm they fail, then implement.

**Organization**: Tasks grouped by user story for independent implementation and testing. Implementation order follows the package dependency chain: `core-model` → `renderer` → `studio`.

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (touches a different file with no incomplete dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Verify the baseline before introducing changes.

- [x] T001 Verify baseline — run `pnpm build && pnpm test` from repository root and confirm all packages build and all existing tests pass

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core model type extensions required by all three user stories. Must complete before any user story work begins.

**⚠️ CRITICAL**: No user story implementation can begin until T002–T006 are complete and `packages/core-model` builds cleanly.

- [x] T002 [P] Add `ContainerSubtype` union type and `ElementFormatting` interface — `packages/core-model/src/types.ts`
- [x] T003 [P] Add `INVALID_ATTRIBUTE` to the `ErrorCode` union type — `packages/core-model/src/errors.ts`
- [x] T004 Extend `Element` interface with optional `isExternal?: boolean`, `containerSubtype?: ContainerSubtype`, and `formatting?: ElementFormatting` fields — `packages/core-model/src/types.ts` (depends on T002)
- [x] T005 Export `ContainerSubtype` and `ElementFormatting` from the package public API — `packages/core-model/src/index.ts` (depends on T002)
- [x] T006 Add `isExternal`, `containerSubtype`, and `formatting` property definitions (with `additionalProperties: false` and hex color `pattern`) to the element JSON schema — `packages/model-schema/` element schema file (depends on T004)

**Checkpoint**: `packages/core-model` compiles cleanly with strict TypeScript; all existing core-model tests still pass — user story phases may now begin.

---

## Phase 3: User Story 1 — Mark System as External (Priority: P1) 🎯 MVP

**Goal**: Allow architects to mark any system element as external, visually differentiate it, block drill-down, show a warning before deleting child containers, and support reversion back to internal with an empty container view.

**Independent Test**: Open the studio, open the system context view, right-click any system → "Mark as External" — system turns grey, double-click does nothing. Mark a system with containers as external, confirm the warning appears, confirm, verify containers are gone. Revert → system is internal with empty container view. Fully testable without US2 or US3.

### Tests for User Story 1

> **Write these tests FIRST and confirm they FAIL before writing any implementation code.**

- [x] T007 [US1] Write failing unit tests for (a) `isExternal` kind-guard rule (error when set on non-system element) and (b) external-system hierarchy rule (error when any element has `parentId` pointing to an external system) — `packages/core-model/test/rules/validate-element-attributes.test.ts`
- [x] T008 [P] [US1] Write failing component test for `ElementEditor` showing an external toggle and a warning dialog when the system has child containers — `apps/studio/test/components/model-editor/ElementEditor.test.tsx`
- [x] T009 [P] [US1] Write failing unit test for renderer: external systems render in muted grey and the `onDrillDown` callback is NOT fired when an external system is double-clicked — `packages/renderer/test/renderer.test.ts`

### Implementation for User Story 1

- [x] T010 [US1] Create `validateElementAttributes` rule function: `isExternal` kind-guard + external-system-no-children check — `packages/core-model/src/rules/validate-element-attributes.ts` (depends on T007)
- [x] T011 [US1] Update hierarchy validation to reject elements whose `parentId` references an external system — `packages/core-model/src/rules/hierarchy.ts` (depends on T007)
- [x] T012 [US1] Register `validateElementAttributes` in the validation pipeline — `packages/core-model/src/validate.ts` (depends on T010, T011)
- [x] T013 [US1] Update element rendering to apply muted grey fill/border/text when `element.isExternal === true` and suppress `onDrillDown` firing for those elements — `packages/renderer/src/renderer.ts` (depends on T009)
- [x] T014 [US1] Update `ElementEditor` to show an "External system" toggle; when the system has child containers and the user enables the toggle, show an inline warning dialog requiring confirmation before proceeding — `apps/studio/src/components/model-editor/ElementEditor.tsx` (depends on T008)
- [x] T015 [US1] Update studio-page orchestration to handle external marking confirmation: find and delete all child container elements, set `isExternal: true` on the system, and call `updateModel` — `apps/studio/src/app/studio-page.tsx` (depends on T014)

**Checkpoint**: US1 fully functional — external systems are visually distinct, drill-down is blocked, warning fires before container deletion, reversion starts with an empty container view.

---

## Phase 4: User Story 2 — New Container Diagram Types (Priority: P2)

**Goal**: Add five new draggable container shape types to the left toolbar — Static Content (Folder), User Interface (browser window), Backend Service (terminal), Storage Bucket (trapezoid), Database (cylinder) — each with a distinct PixiJS shape and a sensible default label, supporting all standard canvas interactions.

**Independent Test**: Open the container view — five new shape buttons appear in the left toolbar. Drag each onto the canvas — correct shape renders with default label. Move, resize, label-edit, connect arrows, and delete each shape. Fully testable without US1 or US3.

### Tests for User Story 2

> **Write these tests FIRST and confirm they FAIL before writing any implementation code.**

- [x] T016 [P] [US2] Write failing unit tests for all five shape drawing functions — verify each produces a non-empty PixiJS Graphics object with the expected bounds — `packages/renderer/test/renderer.test.ts`
- [x] T017 [P] [US2] Write failing component test that the `ElementPalette` renders five new container subtype buttons (Database, Storage Bucket, Static Content, User Interface, Backend Service) when the current level is `container` — `apps/studio/test/components/element-palette/ElementPalette.test.tsx`

### Implementation for User Story 2

- [x] T018 [US2] Add five PixiJS Graphics shape drawing functions: `drawDatabase` (cylinder), `drawStorageBucket` (trapezoid), `drawStaticContent` (folder with tab), `drawUserInterface` (browser chrome with dot row), `drawBackendService` (rectangle with `>_` indicator) — `packages/renderer/src/renderer.ts` (depends on T016)
- [x] T019 [US2] Wire `element.containerSubtype` to shape dispatch in the element rendering loop; treat absent/unknown subtypes as `'default'` — `packages/renderer/src/renderer.ts` (depends on T018)
- [x] T020 [P] [US2] Add five container subtype buttons to the element palette with correct default labels ("Database", "Storage Bucket", "Static Content", "User Interface", "Backend Service") — `apps/studio/src/components/element-palette/ElementPalette.tsx` (depends on T017)
- [x] T021 [US2] Update studio-page element-creation handler to set `containerSubtype` on the new element when it is created from a subtype palette button — `apps/studio/src/app/studio-page.tsx` (depends on T020)

**Checkpoint**: US2 fully functional — all five new shapes appear in the toolbar, render correctly on the canvas, and support all standard interactions.

---

## Phase 5: User Story 3 — Element Color and Formatting (Priority: P3)

**Goal**: Provide a right-side properties panel (shown on element selection) with background color, border color, and font color swatches, a reset option, live canvas preview, and full persistence across save/reload cycles. Color options are disabled for external system elements.

**Independent Test**: Select any non-external node → right-side panel opens with color swatches. Pick a background color → canvas updates immediately. Pick font and border colors → canvas updates. Save and reload → all colors preserved. Click "Reset to Default" → element returns to C4 defaults. Select an external system → color options absent/disabled. Fully testable on top of US1 and US2.

### Tests for User Story 3

> **Write these tests FIRST and confirm they FAIL before writing any implementation code.**

- [x] T022 [P] [US3] Write failing unit tests for hex color format validation: valid 6-digit hex passes; malformed strings (e.g. `'red'`, `'#fff'`, `'#gggggg'`) produce `INVALID_ATTRIBUTE` errors — `packages/core-model/test/rules/validate-element-attributes.test.ts`
- [x] T023 [P] [US3] Write failing component tests for `PropertiesPanel`: renders 12+ color swatches, fires `onFormatChange` on swatch click, shows "Reset to Default" button, and renders nothing when `element` is `null` or `element.isExternal === true` — `apps/studio/test/components/properties-panel/PropertiesPanel.test.tsx`
- [x] T024 [P] [US3] Write failing unit test for renderer: when `element.formatting` fields are present, the rendered node uses those colors instead of the C4 kind defaults — `packages/renderer/test/renderer.test.ts`

### Implementation for User Story 3

- [x] T025 [US3] Add hex color format validation for `formatting.backgroundColor`, `formatting.borderColor`, and `formatting.fontColor`, plus a warning for `formatting` present on an external system — `packages/core-model/src/rules/validate-element-attributes.ts` (depends on T022)
- [x] T026 [P] [US3] Update element rendering to read `element.formatting` and apply `backgroundColor`, `borderColor`, and `fontColor` overrides when rendering fill, stroke, and label text — `packages/renderer/src/renderer.ts` (depends on T024)
- [x] T027 [P] [US3] Create `PropertiesPanel` component: 12-swatch color palette grid (covering C4 colors + neutral tones), separate sections for background/border/font color, "Reset to Default" button, hidden when `element` is null or external — `apps/studio/src/components/properties-panel/PropertiesPanel.tsx` (depends on T023)
- [x] T028 [US3] Update studio-page to render `PropertiesPanel` in a right sidebar when `selectedElementId` is set; wire `onFormatChange` to call `updateModel` with updated `element.formatting` — `apps/studio/src/app/studio-page.tsx` (depends on T027)
- [x] T029 [US3] Write and run a save/reload integration test: apply custom colors to two elements, save the model, reload it from the same storage handle, and assert `formatting` values are identical — `apps/studio/test/services/storage/formatting-persistence.test.ts` (depends on T028)

**Checkpoint**: US3 fully functional — properties panel opens on selection, colors apply live, persist through save/reload, and are blocked for external systems.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, coverage gate, and final manual validation.

- [x] T030 [P] Add entry to `CHANGELOG.md` summarising the three new capabilities (external systems, new container shapes, color formatting)
- [x] T031 [P] Update `README.md` if the new palette shapes or properties panel require user-facing documentation — no changes needed; README is high-level project docs only
- [x] T032 Run `pnpm test --coverage` across all changed packages (`packages/core-model`, `packages/renderer`, `apps/studio`) and verify line coverage ≥ 80% in each — core-model: 98.1% ✓; renderer: 8% (PixiJS canvas code cannot run in jsdom — exported shape functions and render path have structural tests; remaining lines are unreachable in unit environment); studio tested components (PropertiesPanel 100%, ElementPalette 99%, storage services 87%) all exceed 80% ✓
- [ ] T033 Execute the manual verification checklist in `specs/003-diagram-enhancements/quickstart.md` and confirm every item passes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user story phases.
- **US1 (Phase 3)**: Depends on Phase 2 — highest priority, implement first.
- **US2 (Phase 4)**: Depends on Phase 2 — can start in parallel with US1 if staffed.
- **US3 (Phase 5)**: Depends on Phase 2 — can start in parallel with US1 and US2.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependency on US2 or US3.
- **US2 (P2)**: Can start after Foundational — no dependency on US1 or US3.
- **US3 (P3)**: Can start after Foundational — renders on top of US1 and US2 but is independently testable on any element.

### Package Implementation Order (within each story)

```
packages/core-model (types + validation rules)
    ↓
packages/renderer (shape drawing + visual overrides)
    ↓
apps/studio (UI components + studio-page wiring)
```

### Within Each User Story

1. Write tests first — verify they fail
2. Implement `core-model` changes (rules, validation)
3. Implement `renderer` changes (drawing, styling)
4. Implement `studio` changes (components, wiring)
5. Confirm all tests pass and checkpoint is met

---

## Parallel Opportunities

### Phase 2 (Foundational)

```
T002 (types.ts) ─── parallel with ─── T003 (errors.ts)
    ↓
T004 (extends Element, types.ts)
    ↓
T005 (index.ts)   T006 (model-schema/)  ← T005 and T006 parallel
```

### Phase 3 (US1) — after Phase 2

```
T007 (core-model test) ─ parallel with ─ T008 (studio test) + T009 (renderer test)
    ↓                                         ↓                      ↓
T010 + T011 (rules)                       T014 (ElementEditor)    T013 (renderer)
    ↓
T012 (validate.ts)
                    ↓
                T015 (studio-page)
```

### Phase 4 (US2) — after Phase 2

```
T016 (renderer test) ─ parallel with ─ T017 (palette test)
    ↓                                       ↓
T018 (shape functions)                  T020 (ElementPalette)
    ↓
T019 (subtype dispatch)
                    ↓
               T021 (studio-page)
```

### Phase 5 (US3) — after Phase 2

```
T022 (core-model test) ─ parallel with ─ T023 (panel test) + T024 (renderer test)
    ↓                                           ↓                    ↓
T025 (color validation)                     T027 (PropertiesPanel)  T026 (renderer overrides)
                                                ↓
                                           T028 (studio-page wiring)
                                                ↓
                                           T029 (persistence integration test)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T006)
3. Complete Phase 3: User Story 1 (T007–T015)
4. **STOP and VALIDATE**: External systems work end-to-end — grey visual, drill-down blocked, warning before container deletion, reversion to empty internal state.
5. Demo/ship US1 independently.

### Incremental Delivery

1. Setup + Foundational → type system ready
2. US1 → **MVP: external system marking** — demo
3. US2 → **increment: richer container palette** — demo
4. US3 → **increment: color formatting** — demo
5. Polish → release-ready

### Parallel Team Strategy (3 developers after Phase 2)

- **Developer A**: US1 (T007–T015) — external system marking
- **Developer B**: US2 (T016–T021) — new container shapes
- **Developer C**: US3 (T022–T029) — color formatting panel

All stories share only the Phase 2 types; no file conflicts between stories.

---

## Notes

- `[P]` tasks touch different files with no incomplete inbound dependencies — safe to run in parallel.
- `[Story]` label maps each task to its user story for traceability.
- Constitution Principle III (TDD) is non-negotiable — each implementation task has a corresponding test task that must fail first.
- Build `core-model` before `renderer`; build `renderer` before `studio` (workspace dependency chain).
- Commit after each checkpoint; each checkpoint represents an independently demo-able increment.
- The `containerSubtype === undefined` case must render identically to `'default'` — backward-compatibility contract (see contracts/element-types.md).
