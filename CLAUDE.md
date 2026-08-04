# CLAUDE.md — CCTV Recording Viewer

## Project Overview

A read-only web application for browsing, searching, and playing back recorded CCTV footage from multiple cameras. Recordings are stored as video files on an SMB network share. Each camera folder contains an `index.db` SQLite database with a record per video file (filename, path, starttime, stoptime, etc.) and per-recording `recording.xml` metadata files.

The app is **read-only** — it never writes to the SMB share or modifies recordings. The one deliberate exception is `server/maintenance/`, a separate out-of-band script (not reachable via the HTTP API) that owns retention cleanup and `index.db` upkeep — see [Maintenance Service](#maintenance-service-retention--indexdb) below.

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
│   ├── services/
│   │   ├── storageService.js # Filesystem helpers (listCameras, findVideoRelPath, …)
│   │   ├── xmlService.js     # recording.xml parser + date scanner
│   │   ├── dbService.js      # node:sqlite reader (falls back gracefully)
│   │   └── smbAuth.js        # `net use` SMB authentication (shared by index.js + maintenance)
│   └── maintenance/          # Out-of-band CLI, NOT part of the read-only HTTP API — see below
│       ├── run.js            # Entrypoint: prune + rebuild per camera, --dry-run supported
│       ├── retention.js      # Deletes date-folders older than RETENTION_DAYS
│       └── rebuildIndex.js   # Regenerates index.db from the authoritative XML/filesystem scan
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
- **No writes**: the viewer app (`server/routes/*` and the read paths in `server/services/*`) never writes, deletes, or modifies anything on the share. `server/maintenance/` is the sole, deliberate exception — see [Maintenance Service](#maintenance-service-retention--indexdb)
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
RETENTION_DAYS=30   # consumed only by server/maintenance/run.js, not the viewer app
```

---

## Key Constraints (from PRD)

- Grid view must load within **0.5 s** on a LAN
- Video must begin playing **immediately** after selecting a timeline position — pre-cache video files on Playback entry
- Timeline scrubbing accuracy: **±2 seconds**
- Support **1–16 cameras** in grid view
- Playback speeds: **0.5×, 1×, 2×, 4×, 8×**
- Multi-camera playback: cameras stacked **vertically**
- Gaps in recordings shown as **grey/empty segments** on the timeline

---

## Maintenance Service (retention + `index.db`)

`server/maintenance/` is a standalone CLI, run out-of-band — **not** reachable via the HTTP API and not started by `server/index.js`. It is the only part of this codebase permitted to write or delete on the share. It exists because nothing else keeps `index.db` in sync with what recordings actually exist, and nothing enforces a retention window; without it, `index.db` can go stale or be entirely absent, and old recordings accumulate forever.

- **What it does, per camera, each run**:
  1. `retention.js` deletes every `YYYYMMDD` date-folder older than `RETENTION_DAYS`.
  2. `rebuildIndex.js` then regenerates `index.db` from a fresh XML/filesystem scan of whatever dates remain — this is the same authoritative scan (`xmlService.scanRecordingsForDate`) the read API already trusts, so the rebuilt DB can't drift from reality. Rows are written into a dedicated `cctv_maintenance_index` table (not `recordings`) inside one SQLite transaction, in place — not a temp-file-and-rename swap, so the already-open read connection the viewer app caches per camera picks up the fresh data without needing to reopen the file, and not a shared table name, because some cameras ship their own native `index.db` with a real, FK-linked `recordings`/`blocks` schema — reusing that name corrupted it during testing. `dbService.js` prefers `cctv_maintenance_index` over any native table when both exist, since only ours is guaranteed current.
- **Config**: `RETENTION_DAYS` in `.env`. Unset or `0` makes the script refuse to run — no implicit "delete everything" default.
- **Scope — `MAINTENANCE_CAMERAS`**: a comma-separated allowlist of camera IDs (folder names under `STORAGE_PATH`) the script is allowed to touch, via `server/maintenance/selectCameras.js`. Cameras not listed are left completely alone — nothing is deleted, nothing is written. Empty/unset means "manage nothing," never "manage everything." Only list cameras with no active local writer (e.g. an S3-synced archive folder, or a camera whose own retention already clears files locally) — a camera still actively recording to the same share and maintaining its own native `index.db` should stay off this list, since deleting files out from under it would desync its own bookkeeping (the script never touches a camera's native tables, so it can't keep them accurate once files it doesn't manage disappear). Unmatched/misspelled IDs are logged as a warning rather than failing silently.
- **Running it locally**: `npm run maintenance` from `server/` (add `-- --dry-run` to preview without touching disk). There is no in-process cron loop, and deliberately no HTTP trigger endpoint, since this app has no auth (see Coding Conventions) and a network-reachable delete endpoint would be a real risk.
- **Running it in production**: see `docker-compose.yml`'s `cctv-maintenance` service — same image as `cctv-ui` (same codebase/dependencies, and `rebuildIndex.js`/`dbService.js` share a schema contract that must stay in lockstep, so a separate image would risk version skew), but a distinct service: read-write volume mount (`cctv-ui`'s is `:ro`, enforced by Docker at the mount level, so the maintenance job genuinely cannot run inside that container) and a one-shot command instead of a long-running server. It's gated behind the `maintenance` Compose profile, so it's never started by a routine `docker compose up`. The deploy target is a Synology NAS (see `deploy.ps1`/`docker-compose.yml`'s `/volume1` paths) running Docker, not Windows — scheduling is done via **Synology DSM's Task Scheduler** (Control Panel → Task Scheduler → a user-defined script running `docker compose run --rm cctv-maintenance` on the NAS), not Windows Task Scheduler.
