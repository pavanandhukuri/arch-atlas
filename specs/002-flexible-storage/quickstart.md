# Quickstart: Flexible Diagram Storage

**Feature**: 002-flexible-storage
**Date**: 2026-03-19

This guide explains how the new storage system works, how to set it up for development, and what changed from the previous localStorage-only approach.

---

## What Changed

| Before | After |
|--------|-------|
| Diagrams auto-saved to `localStorage` silently | User explicitly chooses Local Computer or Google Drive before editing |
| No persistent file on disk | Local option writes a real `.arch.json` file to a user-chosen location |
| Export = download a file | Export still available; primary save is now to chosen backend |
| No cloud option | Google Drive saves and autosaves directly to Drive |
| Re-open = load from localStorage | Re-open = file picker from chosen storage source |

---

## Developer Setup

### 1. Install new dependencies

```bash
cd apps/studio
pnpm add @react-oauth/google @googleworkspace/drive-picker-react @googleworkspace/drive-picker-element browser-fs-access idb
```

### 2. Google Cloud Project (for Google Drive integration)

You need a Google Cloud project with the Drive API enabled and an OAuth2 web client configured.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable **Google Drive API** and **Google Picker API**
4. Create **OAuth 2.0 Client ID** → Application type: **Web application**
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback` (development)
   - `https://your-domain.com/api/auth/callback` (production)
6. Note your **Client ID** and **Client Secret**

### 3. Environment variables

Create `apps/studio/.env.local`:

```bash
# Google OAuth2 credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Next.js public (safe to expose to browser — needed for Google Picker init)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_API_KEY=your-api-key  # For Google Picker API
```

> **Never commit `.env.local`** — it is git-ignored by default in Next.js projects.

### 4. Run the app

```bash
pnpm dev
```

The storage prompt will appear on first load. Local Computer works immediately. Google Drive requires the env vars above.

---

## Architecture Overview

```
apps/studio/src/
├── app/
│   ├── api/auth/
│   │   ├── google/route.ts       # Initiates OAuth2 + PKCE flow
│   │   ├── callback/route.ts     # Handles Google redirect, sets httpOnly cookie
│   │   ├── refresh/route.ts      # Silently refreshes access token
│   │   ├── me/route.ts           # Rehydrates session on page load
│   │   └── revoke/route.ts       # Disconnects Google Drive
│   └── studio-page.tsx           # Updated: shows StoragePromptDialog on New/Open
│
├── services/storage/
│   ├── storage-provider.ts       # StorageProvider interface (see contracts/)
│   ├── storage-manager.ts        # Orchestrates provider selection + autosave loop
│   ├── local-file-provider.ts    # File System Access API implementation
│   └── google-drive-provider.ts  # Drive v3 REST API implementation
│
├── components/storage/
│   ├── StoragePromptDialog.tsx   # Modal: choose Local or Drive + pick file
│   ├── ConflictResolutionDialog.tsx  # Modal: keep mine vs. load remote
│   └── ConnectionStatusBanner.tsx    # Persistent Drive offline banner
│
└── hooks/
    ├── useGoogleDriveAuth.ts     # Manages AuthorizationSession in React Context
    └── useStorageSession.ts      # Manages active StorageHandle for the session
```

---

## Key Flows

### New Diagram

1. User clicks **New** (or opens a new window)
2. `StoragePromptDialog` shown — pre-selects last-used storage type
3. User picks **Local Computer** or **Google Drive**
4. For Local: `showSaveFilePicker()` → user names file and picks folder → `StorageHandle` created
5. For Drive: check for existing session (`/api/auth/me`) → if needed, initiate OAuth popup → folder picker shown → file created in Drive → `StorageHandle` created
6. `StorageManager.startAutosave(handle)` begins 2-second interval
7. User edits diagram freely

### Autosave

- Every 2 seconds: if `isDirty === true`, call `storageProvider.save(handle, model)`
- On success: update `handle.lastKnownModified`, write to `AutosaveState` in localStorage, clear `isDirty`
- On conflict: pause autosave, show `ConflictResolutionDialog`
- On Drive unavailable: show `ConnectionStatusBanner`, pause autosave, poll for connectivity every 10 seconds, resume when back

### Open Existing Diagram

1. User clicks **Open**
2. `StoragePromptDialog` shown (same as New, but in "open" mode)
3. For Local: `showOpenFilePicker()` → file loaded → `StorageHandle` created
4. For Drive: session check → Drive file picker shown → file fetched → `StorageHandle` created
5. `ModelStore.loadModel(parsedModel)` — clears dirty flag
6. `StorageManager.startAutosave(handle)` begins

### Crash Recovery

On app startup, before showing the storage prompt:
1. Check `localStorage` for `arch-atlas-autosave` and `arch-atlas-autosave-timestamp`
2. If found and recent (< 24 hours), show recovery banner: *"We found unsaved work from [timestamp]. Restore it?"*
3. If user accepts: load `AutosaveState` into `ModelStore`, then show storage prompt to choose where to save the recovered diagram
4. If user declines: clear `AutosaveState`, proceed normally

---

## Testing

All new services are covered by unit and integration tests (Vitest). See `apps/studio/test/`:

```
test/
├── services/storage/
│   ├── storage-manager.test.ts
│   ├── local-file-provider.test.ts    # Uses File System Access API mocks
│   └── google-drive-provider.test.ts  # Uses MSW to mock Drive v3 REST API
├── components/storage/
│   ├── StoragePromptDialog.test.tsx
│   ├── ConflictResolutionDialog.test.tsx
│   └── ConnectionStatusBanner.test.tsx
└── app/api/auth/
    ├── google.test.ts
    ├── callback.test.ts
    ├── refresh.test.ts
    ├── me.test.ts
    └── revoke.test.ts
```

Run tests:
```bash
pnpm test          # Run all tests
pnpm test:coverage # Run with coverage (must be ≥ 80%)
```

---

## Security Notes

- **Refresh tokens** are stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies — inaccessible to JavaScript.
- **Access tokens** are kept in React Context (memory only) — dropped on page unload.
- **`drive.file` scope** — the token can only access files the app created or the user explicitly picked. Not the user's entire Drive.
- **OAuth PKCE** — prevents authorization code interception; no client secret stored in browser.
- **CSP headers** — configured in `next.config.js` to reduce XSS risk.
- **PR requirement** — any change to auth routes or token handling requires an explicit security review note in the PR description (Constitution §IV).
