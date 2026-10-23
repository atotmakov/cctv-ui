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
IT admins can open a dedicated status page in the app to see, per camera, whether it is currently managed or unmanaged, which index file is active, and its date-folder count with oldest/newest date — computed live on every visit, never stale. The page also shows a summary of the last real maintenance run: timestamp, cameras managed, folders removed, rows written, and any per-camera errors. Each camera also gets a health label — green (ok), yellow (warn), red (critical) or grey (unknown) — derived only from its own recording history: how many recordings it has today compared with the same time on its previous 7 days, and how long since its last recording compared with its usual longest gap. Hovering or focusing the label shows the reasons in plain language. (Spec: `specs/001-camera-health-status/`.)

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

Moved to the specs so they live next to the feature work that changes them:

- **AC-1 … AC-8** (grid, playback, search, index parsing, performance, timeline, maintenance service, status page) —
  [`specs/000-baseline/spec.md`](specs/000-baseline/spec.md). IDs are unchanged; tests still refer to them.
- **Features specified since** — each `specs/NNN-<name>/spec.md` has its own requirements (FR-…) and success criteria
  (SC-…), e.g. [`specs/001-camera-health-status`](specs/001-camera-health-status/spec.md).
