# Quickstart: Diagram Viewer and Zoom

**Branch**: `006-diagram-viewer-zoom` | **Date**: 2026-05-02

---

## Scenario 1: View a diagram at the read-only route

**Setup**: User has a diagram saved to Google Drive with file ID `abc123`. They are authenticated.

**Steps**:

1. Navigate to `/view/abc123`
2. The page loads, calls `GoogleDriveProvider.load({ ref: 'abc123', type: 'google-drive', ... })`
3. On success: `DiagramViewer` renders the model with the first view's layout
4. On failure (not found): error state shown — "Could not load diagram. The file may have been deleted or you may not have access."
5. On failure (not authenticated): sign-in prompt shown; clicking "Sign in with Google" triggers the auth flow

**Expected**: All elements and relationships render. No palette, no drag, no editing controls visible.

---

## Scenario 2: Zoom with scroll wheel

**Setup**: Diagram is open (viewer or editor). Diagram has 15 elements spread across the canvas.

**Steps**:

1. Position cursor over a cluster of elements in the top-right
2. Scroll up (mouse wheel or trackpad)
3. Diagram zooms in; the cluster under the cursor stays centred
4. Continue scrolling — zoom stops at ZOOM_MAX (4.0×)
5. Scroll down — zoom decreases, stops at ZOOM_MIN (0.1×)

**Expected**: ZoomControls label updates to reflect current zoom percentage.

---

## Scenario 3: Keyboard zoom shortcuts

**Setup**: Diagram is open and the page has keyboard focus.

**Steps**:

1. Press Ctrl/Cmd `+` — diagram zooms in by ×1.2 centred on midpoint
2. Press Ctrl/Cmd `-` — diagram zooms out by ÷1.2
3. Press Ctrl/Cmd `0` — diagram resets to fit-to-view
4. Confirm browser default zoom did NOT fire (page layout unchanged)

**Expected**: Only the diagram canvas scales; no browser-level zoom occurs.

---

## Scenario 4: Fit to view after deep zoom

**Setup**: User has zoomed in to 400% and panned to a corner.

**Steps**:

1. Click the fit-to-view button (⊡ icon) in ZoomControls
2. Diagram scales back to show all elements; pan resets to centre

**Expected**: ZoomControls label shows default zoom level. All elements visible.

---

## Scenario 5: Empty diagram in viewer

**Setup**: User navigates to `/view/emptyFileId` where the model has no elements.

**Expected**: Canvas area shows message "This diagram has no elements yet." No crash, no blank white box.

---

## Scenario 6: Zoom controls in editor (regression check)

**Setup**: Studio editor open with an existing diagram.

**Steps**:

1. Use zoom-in button in ZoomControls overlay
2. Drag an element to a new position
3. Zoom out, verify element stayed at new position

**Expected**: Zoom and edit interactions do not interfere. Model mutations from dragging are still captured correctly.

---

## Scenario 7: Deploy standalone viewer to nginx

**Setup**: Engineer has built the standalone bundle (`pnpm --filter @arch-atlas/viewer build`). Has a `.arch.json` file for a system overview diagram.

**Steps**:

1. Copy the `dist/` folder to the nginx `root` directory
2. Place `system-overview.arch.json` in `dist/diagrams/`
3. Add an entry to `dist/diagrams/manifest.json`:
   ```json
   [{ "id": "system-overview", "title": "System Overview", "file": "system-overview.arch.json" }]
   ```
4. Open the root URL in a browser

**Expected**: The picker shows "System Overview". Selecting it renders the diagram read-only with ZoomControls. No external requests, no auth prompt, no server-side logic required.

---

## Scenario 8: Multiple diagrams in the picker

**Setup**: Standalone viewer deployed with two diagrams in `manifest.json`.

**Steps**:

1. Open the root URL
2. Picker shows both diagram titles
3. Click the first — it renders
4. Click back / select the second — it renders
5. Zoom in on the second diagram; switch back to first — zoom resets

**Expected**: Each diagram loads independently. Switching diagrams resets zoom state. No cross-diagram state leaks.

---

## Scenario 9: Malformed diagram in standalone viewer

**Setup**: `manifest.json` lists a diagram whose `.arch.json` has invalid JSON.

**Steps**:

1. User selects the malformed diagram from the picker
2. The fetch succeeds but `JSON.parse` throws

**Expected**: DiagramViewer error state is shown for that diagram. The picker remains accessible; selecting a valid diagram works normally.
