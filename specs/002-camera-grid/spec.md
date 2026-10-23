# Feature Specification: Camera Grid

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Use cases

### UC-1 — Multi-camera grid view

Users see a dashboard showing a thumbnail or still frame for each configured camera. Cameras are labelled (e.g. "Front door", "Car park"). Selecting a camera opens the playback view for that camera.

### UC-4 — App version visibility

Users (and IT admins reporting issues) can see which version of the app is currently deployed without checking server logs or files. The version is shown on the first screen (grid view) at all times.

## Acceptance criteria

### AC-1 — Grid view
- [x] All founded cameras are listed with name and a representative still or placeholder. The still is a frame from the camera's most recent recording (decoded client-side from the video file); a placeholder icon is shown if the camera has no recordings yet.
- [x] Each camera's card also shows how long ago its latest recording ended (e.g. "5m ago", "3h ago", "2d ago"), updated live while the grid is open.
- [x] Grid renders correctly for 1–16 cameras.
- [x] Clicking a camera navigates to its playback view.
- [x] Selecting multiple cameras and clicking playback button navigates to to multiple camera playback view.
- [x] Each camera can be selected independently via a checkbox on its card (distinct from clicking the card itself, which opens that camera's playback view directly); the multi-camera playback action is disabled until at least one camera is selected.
- [x] Non-camera filesystem-internal directories (e.g. Synology's `@eaDir`, `#recycle`) are never listed as cameras.
- [x] If no cameras are found, a clear "No cameras found" message is shown instead of an empty grid.
- [x] Camera cells size to fill the available window as large as possible — using the full viewport width and height, for any number of cameras — so that every camera is visible at once without scrolling, rather than wrapping into a fixed-size, scrollable list. Cells keep a fixed 16:9 thumbnail aspect ratio as they grow or shrink to fit.
- [x] The app version is visible on the grid view (e.g. in the header/footer), sourced from `package.json` so it stays in sync with releases without manual edits.

### AC-5 — Performance (grid)
- [ ] Grid view loads within 0.5 seconds on a local LAN. (not benchmarked)

## Related

- Selecting cameras opens [003-playback-timeline](../003-playback-timeline/spec.md).
