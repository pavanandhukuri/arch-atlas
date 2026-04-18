# Implementation Plan: Diagram Enhancements

**Branch**: `003-diagram-enhancements` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-diagram-enhancements/spec.md`

## Summary

Add three capabilities to the Arch Atlas studio: (1) an `isExternal` flag on system elements in the system context view, with a distinct visual treatment and drill-down lock; (2) five new container element subtypes (Static Content, User Interface, Backend Service, Storage Bucket, Database) with semantically distinct PixiJS shapes; (3) a right-side properties panel for per-element color formatting (background, border, font color) on all node types except external systems. Changes span `packages/core-model` (type extensions), `packages/renderer` (new shapes + formatting), and `apps/studio` (UI, editor, properties panel).

## Technical Context

**Language/Version**: TypeScript 5.3.0
**Primary Dependencies**: Next.js 14.1.0, React 18.2.0, PixiJS v7 (via `@arch-atlas/renderer`), Vitest 1.0.0, `@testing-library/react`
**Storage**: Local file system (File System Access API) + Google Drive REST API v3; persisted as `.arch.json` files via `StorageProvider` interface
**Testing**: Vitest 1.0.0 with `jsdom` environment for components; v8 coverage; 80% minimum
**Target Platform**: Browser (CSP-hardened Next.js app; no `unsafe-eval` in production)
**Project Type**: Monorepo web application — `apps/studio` (Next.js client), `packages/core-model` (domain), `packages/renderer` (PixiJS), `packages/layout`, `packages/model-schema`
**Performance Goals**: Live color preview on selection (< 16ms canvas repaint); 60fps rendering for typical diagrams (≤ 50 elements)
**Constraints**: No external UI component libraries (plain CSS + React hooks only); CSP-strict; strict TypeScript (`noUnusedLocals`, `noUncheckedIndexedAccess`, etc.)
**Scale/Scope**: Dozens of elements per diagram; single-user, fully browser-side (no server)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                 | Status | Notes                                                                                                                                                                   |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Monorepo boundaries                    | PASS   | Type changes in `core-model`, rendering in `renderer`, UI in `studio` — no cross-boundary internal imports                                                              |
| II. Type safety & explicit contracts      | PASS   | All new types are explicit interfaces; no `any`; JSON schema will be extended                                                                                           |
| III. TDD (non-negotiable)                 | PASS   | Tests written before implementation at unit (core-model rules), component (ElementPalette, PropertiesPanel, ElementEditor), and integration (save/reload colors) levels |
| IV. Security & privacy by design          | PASS   | No new network calls; color strings are sanitized to hex format before persistence; no new attack surface                                                               |
| V. Latest versions & supply-chain hygiene | PASS   | No new runtime dependencies required                                                                                                                                    |

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-diagram-enhancements/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── element-types.md # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/core-model/src/
├── types.ts                  # Extended: isExternal, containerSubtype, ElementFormatting
└── rules/
    └── hierarchy.ts          # Updated: external systems may not have children

packages/renderer/src/
└── renderer.ts               # Extended: new PixiJS shapes, external styling, formatting overrides

apps/studio/src/
├── components/
│   ├── element-palette/
│   │   └── ElementPalette.tsx       # Extended: new container subtype buttons
│   ├── model-editor/
│   │   └── ElementEditor.tsx        # Extended: isExternal toggle + warning dialog
│   └── properties-panel/
│       └── PropertiesPanel.tsx      # NEW: right-side color formatting panel
├── app/
│   └── studio-page.tsx              # Extended: properties panel integration, external warning
└── state/
    └── model-store.ts               # No changes expected
```

**Structure Decision**: Monorepo with clear package boundaries. All semantic domain changes go into `core-model`; all visual/rendering changes go into `renderer`; all UI orchestration goes into `studio`. The new `PropertiesPanel` component is a net-new file in `apps/studio/src/components/properties-panel/`.
