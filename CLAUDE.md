# CLAUDE.md — CCTV Recording Viewer

## Project Overview

A read-only web application for browsing, searching, and playing back recorded CCTV footage from multiple cameras. Recordings are stored as video files on an SMB network share. Each camera folder contains an `index.db` SQLite database with a record per video file (filename, path, starttime, stoptime, etc.) and per-recording `recording.xml` metadata files.

The app is **read-only** — it never writes to the SMB share or modifies recordings. The one deliberate exception is `server/maintenance/`, a separate out-of-band script (not reachable via the HTTP API) that owns retention cleanup and `index.db` upkeep — see [Maintenance Service](#maintenance-service-retention--indexdb) below.

See `PRD.md` for the full product requirements document.

---

## Tech Stack

### Backend
- **Node.js + Express** — REST API server
- **SMB access** — OS-level mount, authenticated via Windows `net use` on startup (`server/services/smbAuth.js`); no `smb2` npm dependency
- **SQLite** — built-in `node:sqlite` (`--experimental-sqlite` flag) for reading `index.db`/`index_[managed].db` per camera; no `better-sqlite3` dependency (dropped early on — no Visual Studio build tools on the Windows dev machine)
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
│   │   ├── cameras.js        # GET /cameras, /:id/dates, /:id/latest-recording, /:id/recordings, POST /:id/cache
│   │   ├── video.js          # GET /video/:cameraId/* (HTTP range support)
│   │   ├── version.js        # GET /version — reads root package.json
│   │   └── maintenance.js    # GET /maintenance/status — read-only, see Maintenance Service
│   ├── services/
│   │   ├── storageService.js # Filesystem helpers (listCameras, findVideoRelPath, …)
│   │   ├── xmlService.js     # recording.xml parser + date scanner
│   │   ├── dbService.js      # node:sqlite reader (falls back gracefully)
│   │   ├── maintenanceStatusService.js # Reads maintenance-status.json + live per-camera status
│   │   └── smbAuth.js        # `net use` SMB authentication (shared by index.js + maintenance)
│   └── maintenance/          # Out-of-band CLI, NOT part of the read-only HTTP API — see below
│       ├── run.js            # Entrypoint: prune + rebuild per camera, --dry-run supported
│       ├── retention.js      # Deletes date-folders older than RETENTION_DAYS
│       ├── selectCameras.js  # Detects which cameras have no native index.db (= managed)
│       └── rebuildIndex.js   # Regenerates index_[managed].db from the authoritative XML/filesystem scan
└── client/
    ├── package.json
    ├── vite.config.js        # Vite + React; proxies /api → :3000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx           # React Router: / → CameraGrid, /playback/:ids, /maintenance → MaintenanceStatus
        ├── index.css         # Global dark theme variables
        ├── api/
        │   └── client.js     # fetch wrappers for all API endpoints
        └── components/
            ├── CameraGrid.jsx / .css    # UC-1 grid with multi-select
            ├── CameraCard.jsx           # Single camera tile
            ├── PlaybackView.jsx / .css  # UC-2/3 date picker + players + timeline
            ├── VideoPlayer.jsx / .css   # HTML5 <video> with seek + auto-advance
            ├── Timeline.jsx / .css      # Canvas scrubber (24h, recording segments)
            └── MaintenanceStatus.jsx / .css  # /maintenance — service + per-camera status
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
PORT=3000
STORAGE_TYPE=local           # "local" → STORAGE_PATH is a local/UNC path; "smb" → also runs `net use` on startup
STORAGE_PATH=./video_example # recordings root; UNC example: \\192.168.1.100\cctv
SMB_HOST=192.168.1.x         # only used when STORAGE_TYPE=smb
SMB_SHARE=cctv
SMB_USERNAME=user
SMB_PASSWORD=secret
RETENTION_DAYS=30   # consumed only by server/maintenance/run.js, not the viewer app
```

See `.env.example` for the full annotated version.

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

`server/maintenance/` is a standalone CLI, run out-of-band — **not** reachable via the HTTP API and not started by `server/index.js`. It is the only part of this codebase permitted to write or delete on the share. It exists because nothing else keeps recordings indexed in sync with what actually exists, and nothing enforces a retention window; without it, indexing can go stale or be entirely absent, and old recordings accumulate forever.

- **What it does, per camera, each run**:
  1. `retention.js` deletes every `YYYYMMDD` date-folder older than `RETENTION_DAYS`.
  2. `rebuildIndex.js` then regenerates the camera's index from a fresh XML/filesystem scan of whatever dates remain — this is the same authoritative scan (`xmlService.scanRecordingsForDate`) the read API already trusts, so the rebuilt index can't drift from reality. Rows are written into a `cctv_maintenance_index` table inside **`index_[managed].db`**, a file distinct from `index.db`, in one SQLite transaction, in place — not a temp-file-and-rename swap, so the already-open read connection the viewer app caches per camera picks up the fresh data without needing to reopen the file.
- **Scope — automatic, per camera, re-evaluated every run**: whether a camera is managed is *detected*, not configured. `server/maintenance/selectCameras.js` treats a camera as managed only when its folder has **no native `index.db`** — presence of one is taken to mean the camera itself (or something else) already owns retention/indexing there, so it's left completely alone: nothing is deleted, nothing is written. There is no allowlist to keep in sync or forget to update. Only cameras with no active local writer (e.g. an S3-synced archive folder, or a camera whose own retention already clears files locally) should ever end up without a native `index.db` — a camera still actively recording to the same share and maintaining its own native `index.db` is automatically excluded, since deleting files out from under it would desync its own bookkeeping (the script never touches a camera's native tables, so it can't keep them accurate once files it doesn't manage disappear).
  - **`listCameras()` filters out Synology filesystem-internal directories** (`@eaDir`, `#recycle`, anything starting with `@`/`#` — see `storageService.js`). These appear alongside real camera folders in every share directory, have no `index.db` of their own, and were observed being swept into management (retention run against `@eaDir`, an index rebuild attempted inside it) the first time this ran in production after the allowlist was removed — confirming the exact class of risk auto-detection introduces: it manages *any* directory without an `index.db`, not just real cameras.
  - **Read path**: `dbService.js` always prefers a native `index.db` over `index_[managed].db` when both happen to exist for a camera — the native file is authoritative if present.
  - **Status page**: `/maintenance` in the client (`GET /api/maintenance/status`, `server/routes/maintenance.js` + `server/services/maintenanceStatusService.js`) shows, per camera, live managed/unmanaged state and active db file (recomputed fresh from the filesystem on every request — never stale), plus date-folder count and oldest/newest date. It also shows the last real (non-dry-run) run's summary — timestamp, cameras managed, folders removed, rows written, any per-camera error — which `run.js` writes to `maintenance-status.json` (via `maintenanceStatusPath()`) at the storage root after each run; dry-runs don't write it. This route is read-only and cannot trigger or affect a run.
  - **Known gap, not yet mitigated**: a folder whose native `index.db` got carried along by sync tooling (rather than genuinely having a live writer) is silently left unmanaged — the status page will show it as `unmanaged` with no way to distinguish that from a camera that's actually still recording, so this still needs a human to notice. Planned mitigation: general per-camera health signals (archive length, time since last recording) to help catch this and other anomalies, and to clean up a stale `index_[managed].db` left behind after a managed→unmanaged flip.
- **Config**: `RETENTION_DAYS` in `.env` (default in `docker-compose.yml` is **33** days). Unset or `0` makes the script refuse to run — no implicit "delete everything" default.
- **Running it locally**: `npm run maintenance` from `server/` (add `-- --dry-run` to preview without touching disk). There is no in-process cron loop, and deliberately no HTTP trigger endpoint, since this app has no auth (see Coding Conventions) and a network-reachable delete endpoint would be a real risk.
- **Running it in production**: see `docker-compose.yml`'s `cctv-maintenance` service — same image as `cctv-ui` (same codebase/dependencies, and `rebuildIndex.js`/`dbService.js` share a schema contract that must stay in lockstep, so a separate image would risk version skew), but a distinct service: read-write volume mount (`cctv-ui`'s is `:ro`, enforced by Docker at the mount level, so the maintenance job genuinely cannot run inside that container). The deploy target is a Synology NAS (see `deploy.ps1`/`docker-compose.yml`'s `/volume1` paths) running Docker, not Windows.
  - **Scheduling**: the container runs its own hourly loop internally (`sh -c 'while true; do node ... run.js; sleep 3600; done'`) with `restart: unless-stopped`, and is a normal (non-profile-gated) service — so `docker compose up -d`, which `deploy.ps1` already runs on every deploy, is what keeps it alive. This was chosen over Synology DSM's Task Scheduler because DSM has no supported/documented CLI or API for *creating* scheduled tasks — `synoschedtask` only supports `--get`/`--del`/`--run`/`--sync`, and task creation lives behind an internal, unversioned web API (`SYNO.Core.TaskScheduler`) backed by a SQLite DB (`esynoscheduler.db`) shared with unrelated DSM-owned scheduled jobs (SMART tests, HyperBackup, DSM auto-update) — not safe to script against from `deploy.ps1` without real risk of writing a malformed entry into that shared DB. Retention runs hourly this way regardless of deploy cadence (deploys happen roughly weekly); no idempotency tracking is needed because Compose's own reconciliation (leave a running/unchanged container alone, recreate a missing/updated one) already covers "did this deploy already set up maintenance."
  - `deploy.ps1` checks `cctv-maintenance`'s running state after every deploy and prints a warning if it isn't up. Beyond that, `docker compose logs cctv-maintenance` (stdout/stderr from `run.js`, no persisted log file) is still the only way to see a *specific run's* raw output — the `/maintenance` status page (see above) covers the steady-state question ("is this working, what's it currently managing") but not historical/per-run log detail.
  - **TODO**: view + download the maintenance log directly from the `/maintenance` status page, instead of needing `docker compose logs` on the NAS. Not yet designed — needs `run.js` to persist output somewhere (with rotation/size cap, since it runs hourly forever) plus a read route and a UI control.
