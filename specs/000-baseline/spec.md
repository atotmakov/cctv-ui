# Baseline Specification: CCTV Recording Viewer (as built)

**Status**: Implemented (living document)

**Created**: 2026-10-23 — acceptance criteria moved here from `PRD.md` §7

## Scope

Acceptance criteria for everything built before Spec Kit was adopted: the camera grid, playback, timeline,
search by date, index parsing, performance, the maintenance service and the maintenance status page. The
use cases they verify (UC-1 … UC-6) and the product context stay in [`PRD.md`](../../PRD.md).

- **IDs are stable.** Tests reference these criteria by ID (e.g. `// ── AC-2: …` in `client/src/components/*.test.jsx`
  and `server/tests/`), so criteria are never renumbered. Add new ones at the end of the relevant section.
- **Where changes go.** A change to the behaviour of one of these areas updates the criterion here in the same
  change (constitution, Quality Gates). A new feature gets its own `specs/NNN-<name>/` spec through
  `/speckit-specify`, and links back here if it extends a baseline area — e.g. the health label on the status page
  (AC-8) is specified in full in [`001-camera-health-status`](../001-camera-health-status/spec.md).
- `[x]` = implemented and verified; `[ ]` = open, with a note on what is missing.

## Acceptance Criteria

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

### AC-2 — Playback
- [x] In multiple camera playback view cameras placed in a grid (2 columns for 2–4 cameras, 3 columns for 5–9, 4 columns for 10–16). The grid is always sized to its maximum dimensions based on the camera count — cells never collapse or resize when a camera has no recording at the current time position (a placeholder is shown instead). This prevents layout shifts during continuous playback across day boundaries or gaps.
- [x] Video plays in browser without requiring plugins.
- [x] Scrubbing the timeline seeks to the correct position within ±2 seconds.
- [x] Transitions between adjacent recording files are seamless (auto-advance).
- [x] Auto-advance also works when a camera starts its next recording before the previous one stops (overlaps of a fraction of a second are common — 22 across three cameras on 23 Oct 2026). Playback never freezes at such a point, at any speed including 8×; the newer recording takes over.
- [x] Gaps in recordings are visually distinct on the timeline (grey/empty segment).
- [x] Playback controls: play/pause, speed (0.5×, 1×, 2×, 4×, 8×).

### AC-3 — Search
- [x] User can pick any camera and any date via date picker.
- [x] App shows which hours/segments have recordings for that day.
- [ ] User can type or click a specific time to jump the player to that point. (click-to-seek on the timeline is implemented; typing a time is not)
- [x] If no recordings exist for a date, a clear "no recordings" message is shown.

### AC-4 — SQLite db metadata parsing
- [x] App correctly reads start time, duration, camera ID, and file path from Sqlite db for each camera.
- [x] Malformed or missing sqlite db files are skipped with a server-side warning log; they do not crash the app.

### AC-5 — Performance
- [ ] Grid view loads within 0.5 seconds on a local LAN. (not benchmarked)
- [x] Video begins playing immediately of selecting a time on the timeline, so it is necessary to cache video files after go to Playback mode.

### AC-6 — Timeline control
- [x] All recordings for the selected time period are represented as intervals; the position and length of each interval correspond to the recording's start time and duration.
- [x] The timeline spans the selected date's local calendar day (midnight to midnight in the camera/NAS time zone, the same day the recording date folders use), so its hour labels match the time display next to the play button. The date picker defaults to today's local date.
- [x] As soon as a date's recordings load, the current-time cursor and time display show where playback will start (the first recording of the day), before Play is pressed.
- [x] In multiple-camera mode each camera has its own labelled row of recording intervals on the timeline.
- [x] When the play button is pressed and the current position is in a gap, playback jumps to the nearest recording to the right.
- [x] The timeline supports zoom in / zoom out; zoomed view pans to keep the current-time cursor visible.
- [x] During playback the current-time cursor and time display update in real time as the video progresses.
- [x] In multiple-camera mode, when recordings on different cameras overlap in time, each clip plays to its end; one camera finishing its clip does not interrupt or skip another camera's clip that is still running. Playback jumps to the next recording only once no camera has footage at the current position.

### AC-7 — Maintenance service (retention + indexing)
- [x] For each camera with no native `index.db`, date-folders older than `RETENTION_DAYS` are deleted.
- [x] For each managed camera, an index is rebuilt from a fresh filesystem/XML scan into `index_[managed].db` after retention runs, so the viewer can still browse what's left.
- [x] A camera with a native `index.db` is never modified — no files deleted, no index written.
- [x] Synology filesystem-internal directories (`@eaDir`, `#recycle`, etc.) are never treated as cameras.
- [x] The viewer's read path prefers a camera's native `index.db` over `index_[managed].db` whenever both exist.
- [x] The maintenance process is not reachable via the HTTP API — it cannot be triggered remotely.
- [x] `RETENTION_DAYS` unset or `0` makes the process refuse to run, rather than defaulting to deleting everything.

### AC-8 — Maintenance status page
- [x] The status page shows, per camera, whether it is managed or unmanaged and which index file is currently active, recomputed live on every page load — never stale.
- [x] The status page shows each camera's date-folder count and oldest/newest date.
- [x] The status page shows a summary of the last real (non-dry-run) run: timestamp, cameras managed, folders removed, rows written, and any per-camera errors.
- [x] The status page is read-only and cannot trigger or otherwise affect a maintenance run.
- [x] For a camera reporting its own heartbeat (via the separate `acap-sd-s3-sync` camera-side app), the status page shows its agent version, time since last heartbeat, and the last S3 sync pass result — cameras not running that app just show no heartbeat data, never an error.
- [x] Each camera shows a health label — green ok / yellow warn / red critical / grey unknown, with the level also as text — derived only from that camera's recording history; hovering or focusing it shows the reasons for every level, green included — problems first, then the checks that passed (e.g. "No recordings for 31h; normally at most ~6h apart", or for a green camera "Last recording 30m ago; alert after 13h" and "44 recordings today; usually ~31 by 22:54"). A camera with less than 7 days of history is grey ("learning") unless it has clearly stopped. One camera's unreadable index never affects the rest of the page.
- [ ] IT admins can view and download the maintenance log directly from the status page. (tracked TODO — see `CLAUDE.md` "Maintenance Service")
