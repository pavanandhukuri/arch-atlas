# Implementation Plan: Diagram Viewer and Zoom

**Branch**: `006-diagram-viewer-zoom` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/006-diagram-viewer-zoom/spec.md`

## Summary

Add a standalone read-only diagram viewer at `/view/[id]` (Studio, Google Drive) and a distributable static bundle (`apps/viewer`) that renders pre-bundled `.arch.json` files with no auth. Zoom in/out (scroll wheel, keyboard Ctrl/Cmd +/-/0, on-screen buttons) works in both the viewer and the Studio editor. To avoid duplication, all shared UI components (`MapCanvas`, `DiagramViewer`, `ZoomControls`) and the `useZoom` hook are extracted into a new workspace package `@arch-atlas/viewer-components`, which both `apps/studio` and `apps/viewer` depend on. The standalone bundle is built with Vite and produces a static `dist/` deployable to nginx.

## Technical Context

**Language/Version**: TypeScript 5.3.0 strict (`noUncheckedIndexedAccess`, ES2022 target)  
**Primary Dependencies**:

- `apps/studio`: Next.js 14.1.0 (App Router), React 18.2.0, `@arch-atlas/renderer`, `@arch-atlas/viewer-components` (workspace)
- `apps/viewer`: Vite 5.x, React 18.2.0, `@arch-atlas/renderer`, `@arch-atlas/viewer-components` (workspace)
- `packages/viewer-components`: React 18.2.0 peer dep, `@arch-atlas/renderer` (workspace), `@arch-atlas/core-model` (workspace)

**Storage**:

- Studio viewer route: Google Drive REST API v3 (existing `GoogleDriveProvider`)
- Standalone bundle: static `diagrams/manifest.json` + `.arch.json` files; no external API calls

**Testing**: Vitest 1.x + `@testing-library/react`  
**Target Platform**: Browser (Next.js SSR/CSR for Studio; pure client-side SPA for standalone bundle)  
**Performance Goals**: Diagram with 20 elements renders in viewer ≤ 2 s; zoom interaction ≤ 1 animation frame lag; fit-to-view ≤ 300 ms; standalone bundle initial load ≤ 3 s on a local network  
**Constraints**: Zoom state is local UI state — never persisted. Min zoom 0.1×, max zoom 4.0×. Pan is out of scope but must not be broken. No `?src=` query params (SSRF risk).

## Constitution Check

| Gate                                 | Status  | Notes                                                                                                                    |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| I. Monorepo boundaries               | ✅ PASS | Shared components in `packages/viewer-components`; no cross-app imports; `apps/viewer` does not reach into `apps/studio` |
| II. Type safety at boundaries        | ✅ PASS | All new props/hooks/package exports fully typed; no `any` in new code                                                    |
| III. TDD                             | ✅ PASS | Tests written before implementation per task plan                                                                        |
| IV. Security & privacy               | ✅ PASS | No `?src=` param; standalone bundle loads only pre-bundled files; Google Drive auth reused for Studio route              |
| V. Supported versions & supply chain | ✅ PASS | Vite 5.x is the only new dependency; well-established, no supply chain risk                                              |

**No violations. No exceptions required.**

## Project Structure

### Documentation (this feature)

```text
specs/006-diagram-viewer-zoom/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   ├── diagram-viewer-component.md
│   ├── use-zoom-hook.md
│   └── zoom-controls-component.md
└── tasks.md             ← Phase 2 output
```

### Source Code

```text
packages/
├── renderer/src/
│   └── renderer.ts          ← DONE: readOnly option, ZOOM_MIN/MAX, clamped setZoom
└── viewer-components/       ← NEW shared package
    ├── src/
    │   ├── components/
    │   │   ├── map-canvas/
    │   │   │   └── MapCanvas.tsx       ← MOVED from apps/studio
    │   │   ├── diagram-viewer/
    │   │   │   ├── DiagramViewer.tsx   ← MOVED from apps/studio
    │   │   │   └── index.ts
    │   │   └── zoom-controls/
    │   │       ├── ZoomControls.tsx    ← MOVED from apps/studio
    │   │       └── index.ts
    │   ├── hooks/
    │   │   └── useZoom.ts              ← MOVED from apps/studio
    │   └── index.ts                    ← barrel export
    ├── package.json                    ← name: @arch-atlas/viewer-components
    └── tsconfig.json

apps/
├── studio/src/
│   ├── app/
│   │   ├── view/
│   │   │   └── [id]/
│   │   │       ├── page.tsx            ← DONE
│   │   │       └── viewer-page.tsx     ← DONE
│   │   └── studio-page.tsx             ← DONE: zoom wired; UPDATE imports to use package
│   └── components/ and hooks/          ← DELETE moved files; UPDATE all imports
└── viewer/                             ← NEW standalone Vite app
    ├── public/
    │   └── diagrams/
    │       ├── manifest.json           ← diagram list
    │       └── *.arch.json             ← bundled diagram files
    ├── src/
    │   ├── components/
    │   │   └── DiagramPicker.tsx       ← NEW: lists diagrams from manifest
    │   ├── App.tsx                     ← NEW: picker + viewer wiring
    │   └── main.tsx                    ← NEW: React entry point
    ├── index.html
    ├── vite.config.ts
    └── package.json                    ← name: @arch-atlas/viewer
```

**Structure Decision**: Components graduate from `apps/studio` → `packages/viewer-components` now that a second consumer exists (`apps/viewer`). The renderer package (`packages/renderer`) remains the single source of truth for zoom bounds and the PixiJS rendering engine. `apps/viewer` is deliberately thin — it contains only app-level wiring; all rendering logic is imported from packages.
