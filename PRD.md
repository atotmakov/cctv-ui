# PRD — CCTV recording viewer

## Status: draft v0.1
## Last updated: 2026-08-26

---

## 1. Overview

A web application that lets small business owners and their staff browse, search, and play back recorded video footage from multiple CCTV cameras. Recordings are stored as video files on an SMB (Windows/Samba) network share; each camera folder is accompanied with sqlite db with list of recording (filename, path, starttime, stoptime, etc).

The app is a read-only viewer — it does not control cameras or write to the SMB share.

---

## 2. Problem statement

Small businesses with on-premise CCTV systems typically rely on proprietary DVR/NVR software that is slow, hard to use, and inaccessible from a browser. Staff need a simple way to find and review footage from any camera on a specific date and time without learning specialized hardware software.

---

## 3. Users & personas

| Persona | Description | Primary need |
|---|---|---|
| Business owner | Non-technical, reviews footage after incidents | Find footage fast by date/time |
| Manager / staff | Monitors day-to-day activity | Quick multi-camera overview |
| IT admin | Sets up and maintains the system | Configure SMB path and camera list; confirm retention/indexing is healthy without shelling into the NAS |

---

## 4. Core use cases (MVP)

### UC-1 — Multi-camera grid view
Users see a dashboard showing a thumbnail or still frame for each configured camera. Cameras are labelled (e.g. "Front door", "Car park"). Selecting a camera opens the playback view for that camera.

### UC-2 — Timeline / scrubbing playback
Inside the playback view, a horizontal timeline represents available recordings for the selected camera across a chosen day. The user can scrub to any point; the video player seeks to the corresponding file and offset. Gaps in recording are shown as empty segments.

### UC-3 — Search by date & time
Users select a camera and a date (via date picker), and the app shows which time ranges have recordings. Entering a specific time jumps the timeline to that point and begins playback.

### UC-4 — App version visibility
Users (and IT admins reporting issues) can see which version of the app is currently deployed without checking server logs or files. The version is shown on the first screen (grid view) at all times.

### UC-5 — Automatic retention & index maintenance
For any camera that has no other system already managing it (detected by the absence of a native `index.db` in its folder), an out-of-band process keeps its recordings within a configured retention window and keeps them browsable: each run it deletes date-folders older than `RETENTION_DAYS`, then rebuilds a search index from a fresh filesystem/XML scan of whatever remains. A camera with its own native `index.db` is presumed to already have a live writer managing its retention/indexing, so it is left completely untouched — nothing is deleted, nothing is written. This process runs independently of the viewer app, is not reachable over HTTP, and is the only part of the system permitted to write to or delete from the share.

### UC-6 — Maintenance status visibility
IT admins can open a dedicated status page in the app to see, per camera, whether it is currently managed or unmanaged, which index file is active, and its date-folder count with oldest/newest date — computed live on every visit, never stale. The page also shows a summary of the last real maintenance run: timestamp, cameras managed, folders removed, rows written, and any per-camera errors.

---

## 5. Out of scope (v1)

- Live / real-time RTSP streaming
- Motion-based alerts or notifications
- Clip export / download
- User authentication and roles
- Mobile native app (responsive web only)
- Writing, deleting, or modifying recordings

---

## 6. Tech constraints & architecture decisions

### 6.1 Storage layer
- Recordings live on an **SMB network share** (e.g. `\\NAS\cctv\`).
- Each recording is a video file (video/x-h264 in mkv).
- SQLite db in root for camera contain record for each video file with starttime, stoptime, path, filename.
- The backend mounts or accesses the SMB share server-side; it never exposes raw SMB credentials to the browser.
- For fast ui it is necessary to preliminary cache video files, when camera and date is chosen.

### 6.2 Backend
- **Node.js + Express** (or equivalent) REST API.
- Responsible for: mounting/reading the SMB share, parsing XML metadata files, serving video files to the browser via HTTP range requests (for seek support), and providing search/listing endpoints.
- SMB access via OS-level mount, authenticated with Windows `net use` on server startup — no `smb2` npm package used.

### 6.3 Frontend
- **React** single-page application.
- Video playback via the native HTML5 `<video>` element (leverages HTTP range request support for scrubbing).
- Timeline component built with a canvas or SVG-based scrubber.
- No external video player library required at MVP.

### 6.4 Deployment
- Self-hosted on a local server/NAS within the business's LAN.
- No cloud dependency required.
- Served over HTTP on the local network.

### 6.5 Configuration
- SMB share path, and credentials stored in a server-side `.env` / config file — not in the database.

---

## 7. Acceptance criteria

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
- [x] In multiple-camera mode each camera has its own labelled row of recording intervals on the timeline.
- [x] When the play button is pressed and the current position is in a gap, playback jumps to the nearest recording to the right.
- [x] The timeline supports zoom in / zoom out; zoomed view pans to keep the current-time cursor visible.
- [x] During playback the current-time cursor and time display update in real time as the video progresses.

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
- [ ] IT admins can view and download the maintenance log directly from the status page. (tracked TODO — see `CLAUDE.md` "Maintenance Service")