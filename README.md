# CCTV Recording Viewer

A self-hosted web application for browsing and playing back recorded CCTV footage from multiple cameras. Recordings are read from an SMB network share — the app never writes to or modifies the share.

---

## Features

- **Multi-camera grid** — overview of all cameras with one-click navigation to playback
- **Timeline scrubber** — 24-hour canvas timeline showing recording segments; scrub to any point within ±2 seconds accuracy
- **Date picker** — jump to any date and see which time ranges have footage
- **Multi-camera playback** — watch up to 16 cameras simultaneously, each with its own timeline row
- **Auto-advance** — seamlessly transitions between adjacent recording files
- **Variable speed** — 0.5×, 1×, 2×, 4× playback
- **Gap visualization** — grey segments on the timeline where no recording exists
- **HTTP range requests** — full seek support without downloading entire files
- **Pre-caching** — video files are cached server-side when you enter playback mode so playback starts immediately

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| SMB access | `smb2` npm package |
| Database | SQLite (`better-sqlite3`) |
| Frontend | React (Vite) |
| Video | Native HTML5 `<video>` |
| Timeline | Canvas-based scrubber |

---

## Prerequisites

- Node.js 22+
- An SMB share containing CCTV recordings in the expected folder structure (see below)

---

## Setup

**1. Clone and install**

```bash
git clone https://github.com/atotmakov/cctv-ui.git
cd cctv-ui
npm install
```

**2. Configure environment**

Copy `.env.example` to `.env` and fill in your SMB credentials:

```bash
cp .env.example .env
```

```env
SMB_HOST=192.168.1.x
SMB_SHARE=cctv
SMB_USERNAME=user
SMB_PASSWORD=secret
PORT=3000
```

**3. Start**

```bash
npm run dev        # backend :3000 + frontend :5173 with hot reload
```

Or separately:

```bash
npm run server     # backend only
npm run client     # frontend only
```

**4. Build for production**

```bash
npm run build
```

---

## SMB Share Layout

```
<smb-root>/
  <camera-id>/            e.g. axis-00408CE298CD
    index.db              SQLite — one row per recording (filename, path, starttime, stoptime)
    <YYYYMMDD>/
      <HH>/
        <RecordingToken>/
          recording.xml   Per-recording metadata (start/stop time, resolution, framerate)
          <YYYYMMDD_HH>/
            <token>.mkv   H.264 video in MKV container
            <token>.xml   Block-level metadata
```

---

## Project Structure

```
cctv-ui/
├── server/
│   ├── index.js              Express entry point
│   ├── config.js             Environment config
│   ├── routes/
│   │   ├── cameras.js        GET /api/cameras, /recordings, etc.
│   │   └── video.js          GET /api/video/:id/* (range request support)
│   └── services/
│       ├── storageService.js Filesystem + SMB helpers
│       ├── xmlService.js     recording.xml parser
│       └── dbService.js      SQLite reader
└── client/
    └── src/
        ├── App.jsx
        └── components/
            ├── CameraGrid.jsx   Camera selection grid
            ├── PlaybackView.jsx Date picker + players + timeline
            ├── VideoPlayer.jsx  HTML5 video with auto-advance
            └── Timeline.jsx     Canvas scrubber
```

---

## Out of Scope (v1)

- Live / real-time RTSP streaming
- Motion detection or alerts
- Clip export / download
- User authentication
- Writing or deleting recordings

---

## License

MIT
