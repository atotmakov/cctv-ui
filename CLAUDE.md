# CLAUDE.md — CCTV Recording Viewer

## Project Overview

A read-only web application for browsing, searching, and playing back recorded CCTV footage from multiple cameras. Recordings are stored as video files on an SMB network share. Each camera folder contains an `index.db` SQLite database with a record per video file (filename, path, starttime, stoptime, etc.) and per-recording `recording.xml` metadata files.

The app is **read-only** — it never writes to the SMB share or modifies recordings.

See `PRD.md` for the full product requirements document.

---

## Tech Stack

### Backend
- **Node.js + Express** — REST API server
- **SMB access** — via `smb2` npm package or OS-level mount
- **SQLite** — `better-sqlite3` for reading `index.db` per camera
- **HTTP range requests** — for browser-side video seeking/scrubbing
- Video format: H.264 in MKV containers (`video/x-h264`)

### Frontend
- **React** (SPA)
- **Native HTML5 `<video>`** element — no external player library
- **Canvas or SVG** timeline/scrubber component
- Date picker for navigating recordings by date

### Deployment
- Self-hosted on a local LAN server/NAS
- Served over HTTP (no cloud dependency)
- Configuration via server-side `.env` file

---

## Folder Structure

```
cctv-ui/
├── PRD.md                        # Product requirements (source of truth)
├── CLAUDE.md                     # This file
├── .env                          # SMB credentials and config (never commit)
├── video_example/                # Sample SMB share data for development
│   └── axis-00408CE298CD/        # One folder per camera (named by device ID)
│       ├── index.db              # SQLite DB: one row per recording file
│       ├── 20260406/             # Date folder (YYYYMMDD)
│       │   └── 18/               # Hour folder (HH)
│       │       └── <RecordingToken>/
│       │           ├── recording.xml   # Recording metadata (starttime, stoptime, resolution, etc.)
│       │           └── 20260406_18     # Raw video file (no extension, H.264/MKV)
├── server/                       # Node.js + Express backend (to be created)
│   ├── index.js                  # Entry point
│   ├── routes/                   # Express route handlers
│   ├── services/                 # SMB, SQLite, video serving logic
│   └── config.js                 # Reads .env, exports config
└── client/                       # React frontend (to be created)
    ├── public/
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── CameraGrid.jsx    # UC-1: multi-camera dashboard
        │   ├── PlaybackView.jsx  # UC-2: single/multi-camera playback
        │   └── Timeline.jsx      # Horizontal scrubber component
        └── pages/
```

---

## Data Model (SMB Share)

### Directory layout
```
<smb-root>/
  <camera-id>/         e.g. axis-00408CE298CD
    index.db
    <YYYYMMDD>/
      <HH>/
        <RecordingToken>/
          recording.xml
          <video-file>
```

### `recording.xml` key fields
| Field | Example |
|---|---|
| `RecordingToken` | `20260406_183625_0D88_00408CE298CD` |
| `StartTime` | `2026-04-06T18:36:25.656980Z` |
| `StopTime` | `2026-04-06T18:36:38.561046Z` |
| `Width` / `Height` | `720` / `1280` |
| `Framerate` | `30.00000` |
| `Encoding` | `video/x-h264` |

### `index.db` SQLite
Schema to be confirmed by reading the actual DB. Expected columns: filename, path, starttime, stoptime, camera ID.

---

## Coding Conventions

- **Language**: JavaScript (ES modules where possible); TypeScript may be adopted later
- **Async**: use `async/await` throughout — no raw callbacks
- **Error handling**: validate at system boundaries (SMB mount, SQLite reads, HTTP input); trust internal logic
- **Logging**: server-side `console.warn` / `console.error` for malformed/missing SQLite or XML — never crash the process
- **No auth**: authentication is out of scope for v1
- **No writes**: never write, delete, or modify anything on the SMB share
- **Environment config**: SMB path, username, password go in `.env` only — never hardcoded or committed
- **Video serving**: always support HTTP `Range` headers so the browser can seek without downloading entire files
- **Caching**: pre-cache video files server-side when a user enters Playback mode for a camera+date

---

## Key Commands

```bash
# Install dependencies (run from repo root after scaffolding)
npm install

# Start development server (backend + frontend with hot reload)
npm run dev

# Start backend only
npm run server

# Start frontend only
npm run client

# Run tests
npm test

# Build frontend for production
npm run build
```

> Commands above are the intended convention — update this section once `package.json` scripts are defined.

---

## Environment Variables (`.env`)

```
SMB_HOST=192.168.1.x
SMB_SHARE=cctv
SMB_USERNAME=user
SMB_PASSWORD=secret
SMB_DOMAIN=WORKGROUP
PORT=3000
```

---

## Key Constraints (from PRD)

- Grid view must load within **0.5 s** on a LAN
- Video must begin playing **immediately** after selecting a timeline position — pre-cache video files on Playback entry
- Timeline scrubbing accuracy: **±2 seconds**
- Support **1–16 cameras** in grid view
- Playback speeds: **0.5×, 1×, 2×, 4×**
- Multi-camera playback: cameras stacked **vertically**
- Gaps in recordings shown as **grey/empty segments** on the timeline
