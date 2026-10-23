# PRD — CCTV recording viewer

## Status: draft v0.1
## Last updated: 2026-10-24

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

## 4. Features

Each feature — its use case, acceptance criteria and notes — is specified under `specs/`. This document keeps only
the product context (overview, problem, users, scope, architecture).

| Area | Spec | Use cases | Acceptance criteria |
|---|---|---|---|
| Camera grid, app version | [`specs/002-camera-grid`](specs/002-camera-grid/spec.md) | UC-1, UC-4 | AC-1, AC-5 (grid) |
| Playback and timeline | [`specs/003-playback-timeline`](specs/003-playback-timeline/spec.md) | UC-2 | AC-2, AC-6, AC-5 (playback) |
| Search by date and time | [`specs/004-date-search`](specs/004-date-search/spec.md) | UC-3 | AC-3 |
| Recording index reading | [`specs/005-recording-index`](specs/005-recording-index/spec.md) | — | AC-4 |
| Maintenance service | [`specs/006-maintenance-service`](specs/006-maintenance-service/spec.md) | UC-5 | AC-7 |
| Maintenance status page | [`specs/007-maintenance-status-page`](specs/007-maintenance-status-page/spec.md) | UC-6 | AC-8 |
| Camera health label | [`specs/001-camera-health-status`](specs/001-camera-health-status/spec.md) | (part of UC-6) | FR-001…, SC-001… |

New features are added with `/speckit-specify`, which creates the next `specs/NNN-<name>/`; add a row here.

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
