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
├── PRD.md
├── CLAUDE.md
├── package.json              # npm workspaces root; runs both server + client
├── .env                      # local config (never committed)
├── .env.example
├── .gitignore
├── video_example/            # Sample SMB share data for dev
│   └── axis-00408CE298CD/
│       ├── index.db          # SQLite DB (one row per recording)
│       └── YYYYMMDD/
│           └── HH/
│               └── <RecordingToken>/
│                   ├── recording.xml       # Recording-level metadata
│                   └── YYYYMMDD_HH/        # Block directory
│                       ├── <BlockToken>.mkv    # Actual H.264/MKV video
│                       └── <BlockToken>.xml    # Block-level metadata
├── server/
│   ├── package.json
│   ├── index.js              # Express entry point
│   ├── config.js             # Reads .env, exports typed config
│   ├── routes/
│   │   ├── cameras.js        # GET /cameras, /cameras/:id/dates, /recordings, POST /cache
│   │   └── video.js          # GET /video/:cameraId/* (HTTP range support)
│   └── services/
│       ├── storageService.js # Filesystem helpers (listCameras, findVideoRelPath, …)
│       ├── xmlService.js     # recording.xml parser + date scanner
│       └── dbService.js      # node:sqlite reader (falls back gracefully)
└── client/
    ├── package.json
    ├── vite.config.js        # Vite + React; proxies /api → :3000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx           # React Router: / → CameraGrid, /playback/:ids → PlaybackView
        ├── index.css         # Global dark theme variables
        ├── api/
        │   └── client.js     # fetch wrappers for all API endpoints
        └── components/
            ├── CameraGrid.jsx / .css    # UC-1 grid with multi-select
            ├── CameraCard.jsx           # Single camera tile
            ├── PlaybackView.jsx / .css  # UC-2/3 date picker + players + timeline
            ├── VideoPlayer.jsx / .css   # HTML5 <video> with seek + auto-advance
            └── Timeline.jsx / .css      # Canvas scrubber (24h, recording segments)
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
# Install all dependencies (run once from repo root)
npm install               # installs root + server + client workspaces

# Start both server and client with hot reload
npm run dev               # server on :3000, client on :5173 (via Vite proxy)

# Start backend only  (Node 22 --experimental-sqlite flag included)
npm run server

# Start frontend only
npm run client

# Build frontend for production
npm run build

# Run tests
npm test
```

> The Vite dev server proxies `/api/*` to `http://localhost:3000` so there is no CORS issue during development.

---

## Environment Variables (`.env`)

```
SMB_HOST=192.168.1.x
SMB_SHARE=cctv
SMB_USERNAME=user
SMB_PASSWORD=secret
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
