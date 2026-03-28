# Implementation Plan: Flexible Diagram Storage

**Branch**: `002-flexible-storage` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-flexible-storage/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

---

## Summary

Replace the current `localStorage`-only autosave with a user-chosen storage backend. Users are prompted to select either **Local Computer** (via the browser File System Access API) or **Google Drive** (via Drive v3 REST API + OAuth2 PKCE) at the start of every new/open session. Both backends support autosave every 2 seconds and immediate manual save. A Backend-for-Frontend (BFF) pattern using Next.js API routes handles Google OAuth token security — refresh tokens live in `httpOnly` cookies, never in client JavaScript. Conflict detection, offline recovery, and crash recovery are included.

---

## Technical Context

**Language/Version**: TypeScript 5.3.0
**Primary Dependencies**: Next.js 14.1.0, React 18.2.0, Vitest 1.0.0 (existing); `@react-oauth/google ^0.13.4`, `@googleworkspace/drive-picker-react ^1.0.1`, `browser-fs-access ^0.35.0`, `idb ^8.0.0` (new)
**Storage**: File System Access API (local), Google Drive v3 REST API, IndexedDB (FileHandle persistence), localStorage (session recovery buffer only)
**Testing**: Vitest 1.0.0 with React Testing Library; MSW for Drive API mocks; File System Access API mocked via vitest mocks
**Target Platform**: Web browser — Chrome 86+, Edge 86+ (full); Firefox/Safari via `browser-fs-access` fallback
**Project Type**: Web application (Next.js, monorepo)
**Performance Goals**: Autosave completes within 5 seconds of last edit (SC-002); open completes within 10 seconds for files ≤ 5 MB (SC-007)
**Constraints**: No separate backend server — BFF runs as Next.js API routes within the studio app. Drive API: max 3 writes/second (autosave at 0.5/sec — safe). File System Access API write permission requires user gesture on initial selection.
**Scale/Scope**: Single-user, single-file-per-session; one storage location per diagram session; no concurrent multi-user editing.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Monorepo boundaries | ✅ PASS | New storage services in `apps/studio/src/services/storage/`. BFF routes in `apps/studio/src/app/api/auth/`. No cross-package boundary violations. |
| II. Type safety | ✅ PASS | `StorageProvider` interface with explicit TypeScript types. All API response shapes typed. No `any`. See `contracts/storage-provider.interface.ts`. |
| III. TDD (NON-NEGOTIABLE) | ✅ PASS | All new providers written test-first. Tests required for all 5 auth routes, both storage providers, `StorageManager`, and 3 new UI components. |
| IV. Security & Privacy | ✅ PASS with requirement | Refresh tokens in `httpOnly` cookies. Access tokens in memory. PKCE flow. `drive.file` scope. CSP headers. **PR MUST include explicit security review note per Constitution §IV.** |
| V. Latest versions + supply-chain | ✅ PASS | All 4 new packages are actively maintained, browser-compatible, pinned via lockfile. Node 20+ maintained. No EOL dependencies introduced. |
| Coverage ≥ 80% | ✅ PASS (enforced) | `pnpm test:coverage` must pass before merge. |

*Post-Phase 1 re-check*: All contracts (`StorageProvider` interface, BFF route contracts) maintain the invariants above. No new violations introduced.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-flexible-storage/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── storage-provider.interface.ts   # StorageProvider + DriveAuthProvider interfaces
│   └── auth-api.routes.ts              # BFF route contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
apps/studio/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── auth/
│   │   │       ├── google/route.ts       # NEW: OAuth2 initiation
│   │   │       ├── callback/route.ts     # NEW: OAuth2 callback + cookie set
│   │   │       ├── refresh/route.ts      # NEW: Silent token refresh
│   │   │       ├── me/route.ts           # NEW: Session rehydration
│   │   │       └── revoke/route.ts       # NEW: Token revocation
│   │   ├── layout.tsx                    # MODIFIED: wrap with GoogleOAuthProvider + AuthContextProvider
│   │   └── studio-page.tsx               # MODIFIED: storage prompt integration, remove localStorage autosave
│   ├── services/
│   │   ├── storage/
│   │   │   ├── storage-provider.ts       # NEW: StorageProvider + types (from contracts)
│   │   │   ├── storage-manager.ts        # NEW: Orchestrates autosave, conflict detection, connectivity
│   │   │   ├── local-file-provider.ts    # NEW: File System Access API implementation
│   │   │   └── google-drive-provider.ts  # NEW: Drive v3 REST implementation
│   │   ├── autosave.ts                   # MODIFIED: delegates to StorageManager (localStorage logic removed)
│   │   └── import-export.ts              # UNCHANGED
│   ├── components/
│   │   └── storage/
│   │       ├── StoragePromptDialog.tsx        # NEW: Modal for storage type + file/folder selection
│   │       ├── ConflictResolutionDialog.tsx   # NEW: Conflict resolution UI
│   │       └── ConnectionStatusBanner.tsx     # NEW: Drive offline persistent banner
│   ├── hooks/
│   │   ├── useGoogleDriveAuth.ts         # NEW: AuthorizationSession context consumer
│   │   └── useStorageSession.ts          # NEW: StorageHandle state for active session
│   ├── context/
│   │   └── auth-context.tsx              # NEW: React Context for access token + auth lifecycle
│   └── state/
│       ├── model-store.ts                # UNCHANGED
│       └── storage-preference-store.ts   # NEW: Reads/writes last-used storage type to localStorage
├── test/
│   ├── services/storage/
│   │   ├── storage-manager.test.ts       # NEW
│   │   ├── local-file-provider.test.ts   # NEW
│   │   └── google-drive-provider.test.ts # NEW
│   ├── components/storage/
│   │   ├── StoragePromptDialog.test.tsx   # NEW
│   │   ├── ConflictResolutionDialog.test.tsx # NEW
│   │   └── ConnectionStatusBanner.test.tsx   # NEW
│   └── app/api/auth/
│       ├── google.test.ts                # NEW
│       ├── callback.test.ts              # NEW
│       ├── refresh.test.ts               # NEW
│       ├── me.test.ts                    # NEW
│       └── revoke.test.ts                # NEW
└── package.json                          # MODIFIED: add 4 new dependencies
```

**Structure Decision**: Single app structure (Option 1) within the existing `apps/studio` monorepo package. New storage services are organized into `services/storage/` to isolate backend-specific logic behind the `StorageProvider` interface. Auth BFF routes live inside the Next.js App Router's `app/api/` directory — no separate service needed.

---

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| BFF proxy (5 API routes) | Refresh token MUST be in `httpOnly` cookie — requires server-side cookie management | Memory-only: forces re-auth on every page load (fails FR-006a). localStorage tokens: unacceptable XSS risk per Constitution §IV. |
| `StorageProvider` interface + 2 implementations | Autosave logic must work identically regardless of backend without if/else chains throughout the codebase | Single-file approach (no interface): would scatter `if local / if drive` checks across autosave, save, open, conflict detection — unmaintainable and hard to test. |
| 3 new UI components | Distinct user-facing flows (prompt, conflict, banner) each require their own testable component | Inline in `studio-page.tsx`: would make a 607-line file untestable; conflicts with TDD requirement. |

---

## Key Design Decisions

### 1. Provider Pattern for Storage Backends

`StorageManager` holds a reference to the active `StorageProvider` (either `LocalFileProvider` or `GoogleDriveProvider`). The autosave loop, manual save, and open/close flows all call `provider.save()` / `provider.load()` — zero backend-specific code in `studio-page.tsx`.

### 2. Conflict Detection on Every Write

Both providers compute a modification fingerprint (`lastModified` ms for local, `modifiedTime` ISO for Drive) at the time of each successful read or write. Before the next write, they fetch the current fingerprint from the backend. If it differs, a `StorageError { code: 'CONFLICT' }` is returned and `StorageManager` surfaces `ConflictResolutionDialog`.

### 3. Drive Offline Handling

`GoogleDriveProvider` wraps every network call with connectivity checks. On failure: sets an internal `isOffline` flag, emits an event that `ConnectionStatusBanner` subscribes to, and stops the autosave write cycle (but keeps the timer running for retries). Every 10 seconds, the provider pings Drive. On reconnect, the banner dismisses and autosave resumes — writing the most recent in-memory state first.

### 4. LocalStorage as Recovery Buffer Only

`AutosaveState` continues writing to `localStorage` after every successful save (to either backend) — purely as a crash-recovery safety net. On startup, if `AutosaveState` is found, a recovery prompt is shown before the storage prompt. This preserves the existing `autosave.ts` key names for backwards compatibility.

### 5. Storage Preference Persistence

`StoragePreferenceStore` reads/writes `arch-atlas-storage-preference` to `localStorage`. This is non-sensitive metadata (just `"local"` or `"google-drive"`). The `StoragePromptDialog` reads this preference to pre-select the correct tab.

---

## Implementation Phases (for /speckit.tasks)

> These phases are handed off to `/speckit.tasks` for full task decomposition.

### Phase A — Foundation (Unblocks everything)
1. Define `StorageProvider` interface and types in `services/storage/storage-provider.ts`
2. Implement `StorageManager` shell (autosave loop, event emitter for status)
3. Add 4 new npm dependencies; configure env vars
4. Implement `StoragePreferenceStore`

### Phase B — Local File Provider (Independent P1 value)
5. Implement `LocalFileProvider` (open, create, save, load, conflict detection)
6. Implement `FileHandleRecord` persistence in IndexedDB (`idb`)
7. Build `StoragePromptDialog` (Local Computer path only)
8. Integrate into `studio-page.tsx` (replace localStorage autosave for local path)
9. Tests for all of Phase B

### Phase C — Google Drive Auth BFF (Prerequisite for Phase D)
10. Implement 5 Next.js API route handlers (`/api/auth/*`)
11. Implement `AuthContext` + `useGoogleDriveAuth` hook
12. Add `GoogleOAuthProvider` to `layout.tsx`
13. Tests for all auth routes

### Phase D — Google Drive Provider (Depends on Phase C)
14. Implement `GoogleDriveProvider` (open, create, save, load, conflict detection, offline handling)
15. Build Drive path in `StoragePromptDialog` (auth flow + folder/file picker)
16. Build `ConnectionStatusBanner`
17. Tests for all of Phase D

### Phase E — Conflict + Recovery UI (Depends on Phases B + D)
18. Build `ConflictResolutionDialog`
19. Implement crash recovery prompt on app startup
20. Wire conflict events from `StorageManager` to dialog

### Phase F — Security Hardening + Cleanup
21. Add CSP headers to `next.config.js`
22. Remove localStorage primary autosave from `autosave.ts` (keep recovery buffer only)
23. Ensure `AutosaveState` writes after every successful provider save
24. Full coverage run (≥ 80%)
25. PR security review note

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| File System Access API not available in user's browser | Medium | Medium | `browser-fs-access` ponyfill; download-on-save fallback path already specced |
| Google OAuth consent screen takes > 3 minutes | Low | Low | SC-004 already accounts for this; spinner shown during auth |
| Drive rate limit (3 writes/sec) hit during rapid edits | Low | Low | 2-second autosave interval = 0.5 writes/sec; exponential backoff on 429 |
| `httpOnly` cookie blocked by browser privacy settings | Low | Medium | Tested in dev; fallback: warn user and show "re-authorize each session" mode |
| FileHandle permission revoked after browser privacy clear | Medium | Low | On permission denied, `LocalFileProvider` returns `PERMISSION_DENIED` error → re-prompt user |
