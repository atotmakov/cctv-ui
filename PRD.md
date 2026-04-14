# PRD — CCTV recording viewer

## Status: draft v0.1
## Last updated: 2026-04-09

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
| IT admin | Sets up and maintains the system | Configure SMB path and camera list |

---

## 4. Core use cases (MVP)

### UC-1 — Multi-camera grid view
Users see a dashboard showing a thumbnail or still frame for each configured camera. Cameras are labelled (e.g. "Front door", "Car park"). Selecting a camera opens the playback view for that camera.

### UC-2 — Timeline / scrubbing playback
Inside the playback view, a horizontal timeline represents available recordings for the selected camera across a chosen day. The user can scrub to any point; the video player seeks to the corresponding file and offset. Gaps in recording are shown as empty segments.

### UC-3 — Search by date & time
Users select a camera and a date (via date picker), and the app shows which time ranges have recordings. Entering a specific time jumps the timeline to that point and begins playback.

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
- SMB access via the `smb2` npm package or by mounting the share at the OS level on the server.

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
- [ ] All founded cameras are listed with name and a representative still or placeholder.
- [ ] Grid renders correctly for 1–16 cameras.
- [ ] Clicking a camera navigates to its playback view.
- [ ] Selecting multiple cameras and clicking playback button navigates to to multiple camera playback view.

### AC-2 — Playback
- [ ] In multiple camera playback view cameras placed in a grid (2 columns for 2–4 cameras, 3 columns for 5–9, 4 columns for 10–16).
- [ ] Video plays in browser without requiring plugins.
- [ ] Scrubbing the timeline seeks to the correct position within ±2 seconds.
- [ ] Transitions between adjacent recording files are seamless (auto-advance).
- [ ] Gaps in recordings are visually distinct on the timeline (grey/empty segment).
- [ ] Playback controls: play/pause, speed (0.5×, 1×, 2×, 4×).

### AC-3 — Search
- [ ] User can pick any camera and any date via date picker.
- [ ] App shows which hours/segments have recordings for that day.
- [ ] User can type or click a specific time to jump the player to that point.
- [ ] If no recordings exist for a date, a clear "no recordings" message is shown.

### AC-4 — SQLite db metadata parsing
- [ ] App correctly reads start time, duration, camera ID, and file path from Sqlite db for each camera.
- [ ] Malformed or missing sqlite db files are skipped with a server-side warning log; they do not crash the app.

### AC-5 — Performance
- [ ] Grid view loads within 0.5 seconds on a local LAN.
- [ ] Video begins playing immediately of selecting a time on the timeline, so it is necessary to cache video files after go to Playback mode.

### AC-6 — Timeline control
- [ ] All recordings for the selected time period are represented as intervals; the position and length of each interval correspond to the recording's start time and duration.
- [ ] In multiple-camera mode each camera has its own labelled row of recording intervals on the timeline.
- [ ] When the play button is pressed and the current position is in a gap, playback jumps to the nearest recording to the right.
- [ ] The timeline supports zoom in / zoom out; zoomed view pans to keep the current-time cursor visible.
- [ ] During playback the current-time cursor and time display update in real time as the video progresses.