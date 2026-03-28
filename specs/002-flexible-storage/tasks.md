# Tasks: Flexible Diagram Storage

**Input**: Design documents from `/specs/002-flexible-storage/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — TDD is NON-NEGOTIABLE per the project constitution (§III). Write tests first, ensure they fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in same group)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, create directory skeleton, configure environment.

- [x] T001 Add 4 new npm dependencies to `apps/studio/package.json`: `@react-oauth/google ^0.13.4`, `@googleworkspace/drive-picker-react ^1.0.1`, `@googleworkspace/drive-picker-element ^1.0.0`, `browser-fs-access ^0.35.0`, `idb ^8.0.0` and run `pnpm install`
- [x] T002 [P] Create directory structure: `apps/studio/src/services/storage/`, `apps/studio/src/components/storage/`, `apps/studio/src/hooks/`, `apps/studio/src/context/`, `apps/studio/src/app/api/auth/google/`, `apps/studio/src/app/api/auth/callback/`, `apps/studio/src/app/api/auth/refresh/`, `apps/studio/src/app/api/auth/me/`, `apps/studio/src/app/api/auth/revoke/`
- [x] T003 [P] Create `apps/studio/.env.local.example` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY` placeholders and instructions
- [x] T004 [P] Copy `contracts/storage-provider.interface.ts` and `contracts/auth-api.routes.ts` into `apps/studio/src/services/storage/storage-provider.ts` and `apps/studio/src/app/api/auth/auth-contracts.ts` (source-of-truth types for implementation)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core abstractions and infrastructure that MUST be complete before ANY user story can begin.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 Write failing unit tests for `StorageManager` covering: autosave loop start/stop, autosave calls `provider.save()` on dirty state, autosave pauses on provider error, `AutosaveState` written to localStorage after each successful save — in `apps/studio/test/services/storage/storage-manager.test.ts`
- [x] T006 Implement `StorageManager` class in `apps/studio/src/services/storage/storage-manager.ts`: holds active `StorageProvider` + `StorageHandle`, 2-second autosave loop (calls `provider.save()` when `isDirty`), exposes `startAutosave(handle, provider)` / `stopAutosave()`, emits `'conflict'` and `'offline'` / `'online'` events, writes `AutosaveState` to localStorage after every successful save
- [x] T007 [P] Write failing unit tests for `StoragePreferenceStore` covering: returns `null` when no preference stored, returns `"local"` or `"google-drive"` after save — in `apps/studio/test/state/storage-preference-store.test.ts`
- [x] T008 [P] Implement `StoragePreferenceStore` in `apps/studio/src/state/storage-preference-store.ts`: reads/writes `arch-atlas-storage-preference` to localStorage; exports `getStoragePreference()` and `setStoragePreference(type)`
- [x] T009 Implement `useStorageSession` hook in `apps/studio/src/hooks/useStorageSession.ts`: holds `StorageHandle | null` in React state, exposes `setHandle(handle)` and `clearHandle()`, provides current `storageType` derived from handle
- [x] T010 Refactor `apps/studio/src/services/autosave.ts`: remove localStorage primary autosave logic from `startAutosave()` / `saveToLocalStorage()` — replace with delegation to `StorageManager`; retain `loadFromLocalStorage()` and `clearAutosave()` for crash-recovery buffer only; keep existing key names `arch-atlas-autosave` and `arch-atlas-autosave-timestamp` for backwards compatibility

**Checkpoint**: Foundation ready — user story implementation can begin. StorageManager, StoragePreferenceStore, useStorageSession are tested and working.

---

## Phase 3: User Story 1 — Local Computer Storage for New Diagram (Priority: P1) 🎯 MVP

**Goal**: User opens app or clicks New, is prompted to choose a storage location, selects Local Computer, picks a folder/filename, and the diagram autosaves to that file on disk every 2 seconds.

**Independent Test**: Open app → storage prompt appears → select "Local Computer" → pick a folder and filename → make edits → wait 2 seconds → verify the `.arch.json` file exists on disk and was updated. Manual Save also writes immediately.

### Tests for User Story 1

> **Write these tests FIRST and ensure they FAIL before implementing**

- [x] T011 [P] [US1] Write failing unit tests for `LocalFileProvider` covering: `createFile()` calls `showSaveFilePicker`, `save()` performs full-overwrite write+close, `save()` returns `CONFLICT` error when `lastModified` differs, `load()` parses and returns model, `isAvailable()` returns false when permission denied — in `apps/studio/test/services/storage/local-file-provider.test.ts` (mock `showSaveFilePicker`, `FileSystemFileHandle`, `FileSystemWritableFileStream` via vitest)
- [x] T012 [P] [US1] Write failing unit tests for `StoragePromptDialog` in "new" mode covering: renders two options (Local/Google Drive), pre-selects last-used type from `StoragePreferenceStore`, calls `onLocalSelected(handle)` after file picker resolves, shows error message when picker is cancelled — in `apps/studio/test/components/storage/StoragePromptDialog.test.tsx`

### Implementation for User Story 1

- [x] T013 [US1] Implement `LocalFileProvider` class in `apps/studio/src/services/storage/local-file-provider.ts` implementing `StorageProvider` interface:
  - `createFile(suggestedName)`: calls `showSaveFilePicker({ suggestedName, types: [{ accept: { 'application/json': ['.arch.json'] } }] })`, persists `FileSystemFileHandle` in IndexedDB via `idb` (`arch-atlas-fs` DB, `file-handles` store), returns `StorageHandle`
  - `openFile()`: calls `showOpenFilePicker` — implemented in US3 (T036); stub with `NOT_IMPLEMENTED` error for now
  - `save(handle, model)`: fetches `handle.ref.getFile().lastModified`, compares to `handle.lastKnownModified` (conflict check), calls `createWritable()` → `write(json)` → `truncate(length)` → `close()`, returns `SaveResult` with updated `newModified`
  - `load(handle)`: reads file content via `handle.ref.getFile()` → `text()`, parses + validates model, returns `LoadResult`
  - `isAvailable()`: calls `handle.ref.queryPermission({ mode: 'readwrite' })`, returns `true` if `'granted'`
  - Fallback: if `showSaveFilePicker` is not in window, use `browser-fs-access` `fileSave()` and return `PERMISSION_DENIED` for autosave (download-on-save mode only)
- [x] T014 [US1] Build `StoragePromptDialog` component in `apps/studio/src/components/storage/StoragePromptDialog.tsx` — **Local Computer path only for this story**:
  - Props: `mode: 'new' | 'open'`, `onLocalSelected(handle: StorageHandle): void`, `onDriveSelected(handle: StorageHandle): void`, `onClose(): void` (no-op for now — modal cannot be dismissed per spec)
  - Reads `StoragePreferenceStore` to pre-select last-used tab
  - In `mode='new'` with "Local Computer" selected: calls `localProvider.createFile(suggestedName)` on confirm
  - Google Drive tab: renders "Coming soon" placeholder (implemented in US2)
  - Calls `setStoragePreference('local')` on success
- [x] T015 [US1] Update `apps/studio/src/app/studio-page.tsx`:
  - On app init: show `StoragePromptDialog` (mode=`'new'`) before rendering canvas
  - On New button click (`handleNewFile`): stop current autosave, clear handle, show `StoragePromptDialog` (mode=`'new'`)
  - After `StoragePromptDialog` resolves: call `storageManager.startAutosave(handle, localProvider)`, set handle via `useStorageSession`
  - On manual Save: call `storageProvider.save(handle, model)` directly (same provider/handle as autosave)
  - Remove direct `autosaveManager.saveToLocalStorage()` calls from `useEffect` (now handled by `StorageManager`)
- [x] T016 [US1] Implement `FileHandleRecord` restore on app startup in `apps/studio/src/services/storage/local-file-provider.ts`: on `LocalFileProvider` init, attempt to read stored handle from IndexedDB and call `queryPermission()` — expose `getRestoredHandle(): Promise<FileSystemFileHandle | null>` for use in crash recovery (US4)
- [x] T017 [US1] Add save status indicator to `apps/studio/src/app/studio-page.tsx`: show "Saving…" spinner during write and "Saved [time]" after `StorageManager` emits save success; show error toast on `StorageError` from local provider

**Checkpoint**: US1 complete. App shows storage prompt on open/New, local file is created and autosaved every 2 seconds, manual Save writes immediately, and save status is visible. Works independently without Google Drive.

---

## Phase 4: User Story 2 — Google Drive Storage for New Diagram (Priority: P2)

**Goal**: User selects Google Drive in the storage prompt, completes OAuth2 authorization (or is silently re-authenticated from a prior session), picks a Drive folder, and the diagram autosaves to Drive every 2 seconds.

**Independent Test**: Click New → storage prompt → select "Google Drive" → complete Google OAuth popup → pick a folder → make edits → wait 2 seconds → verify file appears/updates in the chosen Google Drive folder. On page reload, session is restored without re-auth.

### Tests for User Story 2

> **Write these tests FIRST and ensure they FAIL before implementing**

- [x] T018 [P] [US2] Write failing unit tests for `/api/auth/google/route.ts`: generates random `state` + `code_verifier`, stores state cookie, returns 302 redirect to Google with `code_challenge`, `scope=drive.file`, `response_type=code` — in `apps/studio/test/app/api/auth/google.test.ts`
- [x] T019 [P] [US2] Write failing unit tests for `/api/auth/callback/route.ts`: validates `state` matches cookie, exchanges code for tokens, sets `httpOnly` refresh token cookie, returns `accessToken` + `expiresAt` in body; returns 401 on state mismatch or exchange failure — in `apps/studio/test/app/api/auth/callback.test.ts`
- [x] T020 [P] [US2] Write failing unit tests for `/api/auth/refresh/route.ts`: reads refresh cookie, calls Google token endpoint, returns new `accessToken`; returns 401 and clears cookie when refresh fails — in `apps/studio/test/app/api/auth/refresh.test.ts`
- [x] T021 [P] [US2] Write failing unit tests for `/api/auth/me/route.ts`: delegates to refresh logic; returns 200 with `accessToken` when valid cookie present; returns 401 `NO_SESSION` when cookie absent — in `apps/studio/test/app/api/auth/me.test.ts`
- [x] T022 [P] [US2] Write failing unit tests for `/api/auth/revoke/route.ts`: calls Google revoke endpoint with refresh token, clears cookie, returns 200; still clears cookie even if revoke call fails — in `apps/studio/test/app/api/auth/revoke.test.ts`
- [x] T023 [P] [US2] Write failing unit tests for `GoogleDriveProvider` covering: `createFile()` calls Drive v3 upload endpoint with correct multipart body and Bearer token, `save()` fetches `modifiedTime` for conflict check then calls PATCH, `save()` returns `CONFLICT` error when `modifiedTime` changed, `isAvailable()` returns false when network unreachable — in `apps/studio/test/services/storage/google-drive-provider.test.ts` (mock fetch via MSW or vitest `vi.spyOn(global, 'fetch')`)

### Implementation for User Story 2

- [x] T024 [US2] Implement `/api/auth/google/route.ts` in `apps/studio/src/app/api/auth/google/route.ts`: generate PKCE `code_verifier` + `code_challenge` (SHA-256 via `crypto.subtle`), generate random `state`, set `arch-atlas-oauth-state` cookie (httpOnly, Secure, SameSite=Strict, path=/api/auth/callback, maxAge=600), return 302 redirect to Google authorization endpoint with `scope=https://www.googleapis.com/auth/drive.file`, `access_type=offline`, `prompt=consent`
- [x] T025 [US2] Implement `/api/auth/callback/route.ts` in `apps/studio/src/app/api/auth/callback/route.ts`: validate `state` against cookie (return 401 on mismatch), POST to `https://oauth2.googleapis.com/token` with `code` + `code_verifier` + `client_secret` (server-side only), set `arch-atlas-refresh` cookie (httpOnly, Secure, SameSite=Strict, path=/api/auth, maxAge=15552000), return `AccessTokenResponse` JSON body; handle `error` query param with 401
- [x] T026 [US2] Implement `/api/auth/refresh/route.ts` in `apps/studio/src/app/api/auth/refresh/route.ts`: read `arch-atlas-refresh` cookie, POST to Google token endpoint with `grant_type=refresh_token`, update cookie if Google returns a new refresh token (rotation), return `AccessTokenResponse`; on failure clear cookie and return 401
- [x] T027 [US2] Implement `/api/auth/me/route.ts` in `apps/studio/src/app/api/auth/me/route.ts`: if `arch-atlas-refresh` cookie present, delegate to refresh logic and return `AccessTokenResponse`; if absent return 401 `{ code: 'NO_SESSION' }`
- [x] T028 [US2] Implement `/api/auth/revoke/route.ts` in `apps/studio/src/app/api/auth/revoke/route.ts`: read refresh token from cookie, POST to `https://oauth2.googleapis.com/revoke` server-side (no CORS issue), delete `arch-atlas-refresh` cookie regardless of revoke outcome, return `{ success: true }`
- [x] T029 [US2] Implement `AuthContext` + `AuthProvider` in `apps/studio/src/context/auth-context.tsx`: React Context holding `accessToken: string | null` + `expiresAt: number | null`; on mount calls `GET /api/auth/me` to rehydrate; schedules auto-refresh via `setTimeout` at 55 minutes; exposes `authorize()` (redirects to `/api/auth/google`), `revoke()` (calls `POST /api/auth/revoke`), `isAuthenticated: boolean`
- [x] T030 [US2] Implement `useGoogleDriveAuth` hook in `apps/studio/src/hooks/useGoogleDriveAuth.ts`: consumes `AuthContext`, exposes `{ accessToken, isAuthenticated, authorize, revoke, isLoading }`
- [x] T031 [US2] Add `AuthProvider` to `apps/studio/src/app/layout.tsx` wrapping children; ensure it is a `'use client'` component import with SSR-safe guard
- [x] T032 [US2] Implement `GoogleDriveProvider` class in `apps/studio/src/services/storage/google-drive-provider.ts` implementing `StorageProvider` interface:
  - `createFile(suggestedName)`: shows `@googleworkspace/drive-picker-react` folder picker (via `DrivePicker` with `viewId='FOLDERS'`), then POSTs to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` with parent folder ID, returns `StorageHandle` with `driveFileId`
  - `save(handle, model)`: GETs `https://www.googleapis.com/drive/v3/files/{id}?fields=modifiedTime` for conflict check, then PATCHes `/upload/drive/v3/files/{id}?uploadType=multipart` with model JSON; includes exponential backoff (1s → 2s → 4s) on 429/503
  - `load(handle)`: GETs file content via `https://www.googleapis.com/drive/v3/files/{id}?alt=media`, parses model
  - `openFile()`: stub with `NOT_IMPLEMENTED` — implemented in US3 (T038)
  - `isAvailable()`: attempts lightweight fetch to `https://www.googleapis.com/drive/v3/about?fields=user` with current token; returns false on network error or 401
  - All methods call `useGoogleDriveAuth().accessToken` for the Bearer token
- [x] T033 [US2] Implement Drive offline detection in `apps/studio/src/services/storage/google-drive-provider.ts`: poll `isAvailable()` every 10 seconds when last save failed; emit `'offline'` event on `StorageManager` when unavailable, `'online'` when restored
- [x] T034 [US2] Build `ConnectionStatusBanner` in `apps/studio/src/components/storage/ConnectionStatusBanner.tsx`: subscribes to `StorageManager` `'offline'`/`'online'` events; renders persistent amber banner "Google Drive unavailable — autosave paused. Reconnecting…" when offline; dismisses automatically on `'online'` event
- [x] T035 [US2] Add Google Drive path to `StoragePromptDialog` in `apps/studio/src/components/storage/StoragePromptDialog.tsx`: remove "Coming soon" placeholder; in `mode='new'` with "Google Drive" selected — if `!isAuthenticated` show "Connect Google Drive" button that calls `authorize()`; if authenticated show folder picker (`DrivePicker viewId='FOLDERS'`); on folder confirmed call `driveProvider.createFile(suggestedName)`; call `setStoragePreference('google-drive')` on success; add `ConnectionStatusBanner` to studio layout in `apps/studio/src/app/studio-page.tsx`

**Checkpoint**: US2 complete. User can authorize Google Drive, pick a folder, and have diagrams autosave to Drive. Token persists across page refreshes. Offline banner shows when Drive is unreachable. Works independently of Local Computer path.

---

## Phase 5: User Story 3 — Open Existing Diagram from Either Storage (Priority: P2)

**Goal**: User clicks Open, chooses Local Computer or Google Drive source, picks a compatible diagram file, and it loads. Subsequent autosaves write back to the same file automatically.

**Independent Test**: (a) Click Open → Local Computer → file picker → select existing `.arch.json` → diagram loads → make edit → wait 2 seconds → verify original file updated on disk. (b) Click Open → Google Drive → Drive picker → select `.arch.json` from Drive → diagram loads → edit → autosave updates the Drive file.

### Tests for User Story 3

> **Write these tests FIRST and ensure they FAIL before implementing**

- [x] T036 [P] [US3] Write failing unit tests for `LocalFileProvider.openFile()`: calls `showOpenFilePicker` with `.arch.json` filter, stores returned handle in IndexedDB, returns `LoadResult` with parsed model — in `apps/studio/test/services/storage/local-file-provider.test.ts` (extend existing file)
- [x] T037 [P] [US3] Write failing unit tests for `GoogleDriveProvider.openFile()`: opens Drive file picker filtered to `application/json`, fetches file content, returns `LoadResult` — in `apps/studio/test/services/storage/google-drive-provider.test.ts` (extend existing file)

### Implementation for User Story 3

- [x] T038 [P] [US3] Implement `LocalFileProvider.openFile()` in `apps/studio/src/services/storage/local-file-provider.ts`: calls `showOpenFilePicker({ types: [{ accept: { 'application/json': ['.arch.json'] } }] })`, persists returned `FileSystemFileHandle` in IndexedDB (replacing any prior handle), reads file content, validates + parses model, returns `{ handle: StorageHandle, result: LoadResult }` with `lastKnownModified` set from `file.lastModified`
- [x] T039 [P] [US3] Implement `GoogleDriveProvider.openFile()` in `apps/studio/src/services/storage/google-drive-provider.ts`: shows `DrivePicker` with `viewId='DOCS'` filtered to `mimeType='application/json'`, fetches file content via `GET /drive/v3/files/{id}?alt=media`, parses model, returns `{ handle: StorageHandle, result: LoadResult }` with `lastKnownModified` set from Drive `modifiedTime`
- [x] T040 [US3] Add "open" mode to `StoragePromptDialog` in `apps/studio/src/components/storage/StoragePromptDialog.tsx`: in `mode='open'` — Local path calls `localProvider.openFile()`; Drive path calls `driveProvider.openFile()` after auth check; both paths call `onLocalSelected(handle)` or `onDriveSelected(handle)` with the resolved handle
- [x] T041 [US3] Update Open button handler (`handleImportClick`) in `apps/studio/src/app/studio-page.tsx`: replace current `<input type="file">` / `importModel(file)` flow with `StoragePromptDialog` in `mode='open'`; on resolve: call `modelStore.loadModel(result.model)`, set handle via `useStorageSession`, call `storageManager.startAutosave(handle, provider)` so subsequent saves go to the opened file
- [x] T042 [US3] Write integration tests for open-then-autosave flow in `apps/studio/test/services/storage/storage-manager.test.ts` (extend): after `openFile()` + `startAutosave()`, next autosave tick writes to the opened file's handle (not a new file)

**Checkpoint**: US3 complete. Open from local disk and Google Drive both work. Autosave binds to the opened file. US1 + US2 + US3 all function independently.

---

## Phase 6: User Story 4 — Crash Recovery (Priority: P3)

**Goal**: If the app closes unexpectedly, the user is offered the option to restore their last autosaved state when they reopen the app. Conflict resolution UI also lives here.

**Independent Test**: Make edits → close browser tab without saving → reopen app → recovery prompt appears with timestamp → accept → diagram restored → storage prompt shown to choose where to save the recovered diagram.

### Tests for User Story 4

> **Write these tests FIRST and ensure they FAIL before implementing**

- [x] T043 [P] [US4] Write failing unit tests for `ConflictResolutionDialog`: renders "Your version" vs "Remote version" timestamps, calls `onKeepMine()` on primary action, calls `onLoadRemote()` on secondary action — in `apps/studio/test/components/storage/ConflictResolutionDialog.test.tsx`
- [x] T044 [P] [US4] Write failing integration tests for crash recovery in `apps/studio/test/app/studio-page.test.tsx`: when localStorage contains `arch-atlas-autosave` with timestamp < 24 hours on mount, recovery banner is rendered before the storage prompt

### Implementation for User Story 4

- [x] T045 [US4] Build `ConflictResolutionDialog` in `apps/studio/src/components/storage/ConflictResolutionDialog.tsx`: modal showing conflict details (file name, local timestamp, remote timestamp), "Keep My Version" button (calls `onKeepMine`: overwrites remote), "Load Remote Version" button (calls `onLoadRemote`: discards local changes and loads remote), cannot be dismissed without choosing
- [x] T046 [US4] Wire conflict resolution in `apps/studio/src/app/studio-page.tsx`: subscribe to `StorageManager` `'conflict'` event; on event show `ConflictResolutionDialog`; on `onKeepMine` call `storageProvider.save(handle, model, { force: true })` (skip conflict check); on `onLoadRemote` call `storageProvider.load(handle)` and call `modelStore.loadModel(loaded.model)` then update `handle.lastKnownModified`
- [x] T047 [US4] Implement crash recovery check on app startup in `apps/studio/src/app/studio-page.tsx`: before showing `StoragePromptDialog`, check localStorage for `arch-atlas-autosave` and `arch-atlas-autosave-timestamp`; if found and timestamp within 24 hours, show recovery banner "We found unsaved work from [timestamp]. Restore it?"; on "Restore" — load `AutosaveState` into `ModelStore`, proceed to `StoragePromptDialog` to choose where to save; on "Discard" — clear `AutosaveState` and proceed to `StoragePromptDialog`
- [x] T048 [US4] Write unit tests for recovery check in `apps/studio/test/app/studio-page.test.tsx`: no banner when localStorage is empty; banner shown when valid `arch-atlas-autosave` present; banner not shown when timestamp > 24 hours old

**Checkpoint**: US4 complete. Crash recovery works end-to-end. Conflict resolution modal appears on write conflict. All 4 user stories functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, cleanup of legacy localStorage autosave, coverage validation, and documentation.

- [x] T049 Add nonce-based Content Security Policy headers to `apps/studio/next.config.js`: `default-src 'self'`, `script-src 'self' https://accounts.google.com`, `connect-src 'self' https://oauth2.googleapis.com https://www.googleapis.com https://accounts.google.com`, `frame-src https://accounts.google.com`; generate nonce per request via Next.js middleware
- [x] T050 [P] Add "Disconnect Google Drive" button to `apps/studio/src/components/storage/StoragePromptDialog.tsx` — shown only when `isAuthenticated === true` in the Google Drive tab; calls `useGoogleDriveAuth().revoke()` and resets Drive state to show "Connect Google Drive" button
- [x] T051 [P] Add exponential backoff retry helper to `apps/studio/src/services/storage/google-drive-provider.ts`: wrap all Drive fetch calls — retry up to 3 times on 429 or 503 with delays 1s → 2s → 4s; after max retries emit `'offline'` event on `StorageManager`
- [x] T052 Verify `apps/studio/src/services/autosave.ts` no longer writes to localStorage as the primary save path — only `StorageManager` triggers writes to the chosen backend; `AutosaveState` buffer (localStorage) is written by `StorageManager` after every successful provider save; update existing autosave unit tests in `apps/studio/test/autosave.test.ts` to reflect new behaviour
- [x] T053 Run `pnpm test:coverage` in `apps/studio/` and confirm total statement coverage ≥ 80%; fix any gaps in storage service or auth route tests
- [ ] T054 [P] Update `CONTRIBUTING.md` and `CHANGELOG.md` at repo root to document the new storage provider system, BFF auth routes, and required `.env.local` setup for contributors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 only — no dependency on US2/US3/US4
- **US2 (Phase 4)**: Depends on Phase 2 only — no dependency on US1/US3/US4
- **US3 (Phase 5)**: Depends on Phase 2 + at least Phase 3 (LocalFileProvider base) + Phase 4 (GoogleDriveProvider base)
- **US4 (Phase 6)**: Depends on Phase 2 + Phases 3 & 4 (providers must exist for conflict detection to be meaningful)
- **Polish (Phase 7)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no story dependencies ✅
- **US2 (P2)**: Can start after Foundational — no story dependencies ✅ (parallel with US1)
- **US3 (P2)**: Requires US1 partial (LocalFileProvider base class created) and US2 partial (GoogleDriveProvider base class created) — specifically T013 and T032 must be complete
- **US4 (P3)**: Requires US1 + US2 StorageManagers and providers to be wired; ConflictResolutionDialog is self-contained but conflict events require US1/US2 saves to be working

### Within Each User Story

- Tests written and **confirmed failing** before implementation
- Types/interfaces before implementations
- Provider implementation before UI component that depends on it
- Core implementation before studio-page.tsx integration

---

## Parallel Opportunities

### Phase 2 (Foundational) — can run in parallel

```
Agent A: T005, T006  — StorageManager + tests
Agent B: T007, T008  — StoragePreferenceStore + tests
Agent C: T009        — useStorageSession hook
```

### Phase 3 + Phase 4 — can run in parallel across US1 and US2

```
Agent A: T011, T013, T014, T015, T016, T017  — US1 (Local provider + dialog + studio)
Agent B: T018-T022, T024-T031                 — US2 BFF auth routes + AuthContext
```
*(T023, T032-T035 must wait for auth routes to be implemented)*

### Within US2 (Phase 4) — auth route tests can be written in parallel

```
T018 [P] google.test.ts
T019 [P] callback.test.ts
T020 [P] refresh.test.ts
T021 [P] me.test.ts
T022 [P] revoke.test.ts
T023 [P] google-drive-provider.test.ts
```

### Within US3 (Phase 5)

```
T036 [P] local-file-provider openFile tests
T037 [P] google-drive-provider openFile tests
T038 [P] LocalFileProvider.openFile() implementation
T039 [P] GoogleDriveProvider.openFile() implementation
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **critical gate**
3. Complete Phase 3: User Story 1 (Local Computer)
4. **STOP and VALIDATE**: Open app → storage prompt → pick local file → edit → verify autosave to disk
5. Demo / deploy with local storage only

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Local file autosave working (MVP!)
3. US2 → Google Drive working (adds cloud storage)
4. US3 → Open from either storage working (completes full open/save lifecycle)
5. US4 → Crash recovery + conflict resolution (completes data safety)
6. Polish → Hardening + coverage

### Parallel Team Strategy

After Phase 2 completes:
- **Developer A**: US1 (local file, storage prompt, studio-page integration)
- **Developer B**: US2 BFF auth routes (T024–T028) + AuthContext (T029–T031) in parallel
- **Developer B** (continued): US2 GoogleDriveProvider + Drive UI (T032–T035) after auth routes done
- **After US1 + US2**: US3 and US4 can begin (both depend on providers being in place)

---

## Notes

- `[P]` tasks touch different files with no unresolved dependencies in their group — safe to parallelize
- `[Story]` label maps each task to a specific user story for traceability and independent delivery
- Constitution §III (TDD) is non-negotiable: every test task must be written and confirmed failing before its paired implementation task
- Constitution §IV (Security): the PR for this feature MUST include an explicit threat model / security review note covering OAuth token handling, httpOnly cookie configuration, and CSP headers
- `storageProvider.save(handle, model, { force: true })` in T046 bypasses the conflict check — this is intentional (user explicitly chose "Keep My Version")
- The existing `exportModel()` / manual download export in `import-export.ts` is **unchanged** — it remains as a separate "Export" action alongside the new Save action
