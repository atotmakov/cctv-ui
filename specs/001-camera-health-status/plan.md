# Implementation Plan: Camera Health Status on the Maintenance Page

**Branch**: `001-camera-health-status` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-camera-health-status/spec.md`

## Summary

Add a per-camera health label (green ok / yellow warn / red critical / grey unknown, reasons on hover) to the cameras
table on `/maintenance`, computed only from each camera's existing recording index. Two rules, both relative to the
camera's own previous 7 complete days: **activity** (recordings today up to now vs the median of the same window)
and **recency** (time since the last recording vs 1.5× the longest normal gap, floor 2 h). Computation is a pure
function in a new server service, fed by one new read-only `dbService` query and memoised per camera for 60 s; the
existing `GET /api/maintenance/status` gains a `health` field per camera. No new service, storage, endpoint, or
dependency.

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js 22 (`--experimental-sqlite`), React 18 + Vite

**Primary Dependencies**: Express, built-in `node:sqlite`, built-in `Intl` — nothing new

**Storage**: None added. Reads existing per-camera `index.db` / `index_[managed].db` read-only

**Testing**: Vitest (server with supertest; client with Testing Library), `npm test`

**Target Platform**: Docker on Synology NAS (Linux), `node:22-alpine` image

**Project Type**: Web application (npm workspaces `server/` + `client/`)

**Performance Goals**: `/maintenance` loads < 2 s for 16 cameras (SC-004); camera grid unaffected

**Constraints**: read-only on the share (Principle I); one camera's failure must not fail the page (Principle V);
local-day maths in the NAS timezone (`HEALTH_TIMEZONE`, see [research.md](research.md#r3--timezone-for-today-and-time-of-day))

**Scale/Scope**: ≤ 16 cameras, ≤ ~700 recordings per camera in the 8-day window

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

| Principle | Check | Result |
|---|---|---|
| I. Read-only viewer, single writer | Only reads indexes through the existing read-only connections; no writes anywhere | ✅ |
| II. Detected ownership | Uses `dbService`'s native-first resolution; never touches native index content | ✅ |
| III. No network-reachable mutation | Extends an existing GET; no params, no new endpoints, thresholds server-side only | ✅ |
| IV. Playback performance | Grid untouched; status page budget protected by 60 s memoisation (R2) | ✅ |
| V. Degrade gracefully | Per-camera try/catch → `unknown` / `health: null`; bad rows skipped with `console.warn` | ✅ |
| VI. Minimal dependencies | `Intl` for timezones; no date library | ✅ |
| Quality gates | New service + route change ship with tests, incl. SC-001 replay; `PRD.md` (UC-6/AC) and `CLAUDE.md` updated in the same change | ✅ |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-camera-health-status/
├── spec.md
├── plan.md                       # this file
├── research.md                   # R1–R6 decisions
├── data-model.md                 # entities, thresholds, level rules
├── quickstart.md                 # validation guide
├── contracts/
│   └── maintenance-status.md     # extended GET /api/maintenance/status
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
server/
├── config.js                          # + healthTimeZone (HEALTH_TIMEZONE, default "UTC")
├── services/
│   ├── dbService.js                   # + getRecordingHistory(cameraId, sinceIso) → { earliestStart, recordings } | null
│   ├── healthService.js               # NEW: HEALTH_THRESHOLDS, evaluateHealth(history, now, opts) (pure),
│   │                                  #      getCameraHealth(cameraId) (reads + 60 s memo)
│   └── maintenanceStatusService.js    # getCameraStatuses() adds `health` per camera
└── tests/
    ├── healthService.test.js          # NEW: rule unit tests + SC-001 replay
    ├── fixtures/health/oct-2026.json  # NEW: start/stop timestamps exported from prod, 29 Sep – 21 Oct
    ├── dbService.test.js              # + getRecordingHistory for native and managed schemas
    ├── maintenanceStatusService.test.js # + getCameraStatuses includes health
    └── routes/maintenance.test.js     # + status includes health; one broken index doesn't fail the response

client/src/components/
├── MaintenanceStatus.jsx              # + Health column (label, title=reasons, tabIndex, aria-label)
├── MaintenanceStatus.css              # + ok / warn / critical / unknown badge variants
└── MaintenanceStatus.test.jsx         # NEW: renders labels with text + tooltip

docker-compose.yml                     # cctv-ui: + HEALTH_TIMEZONE=Europe/Moscow
.env.example                           # + HEALTH_TIMEZONE
PRD.md, CLAUDE.md                      # document UC-6 health label and healthService
```

**Structure Decision**: Existing web-application layout (`server/` + `client/` workspaces); the feature adds one
server service, one query, and one table column — no new modules or packages.

## Complexity Tracking

None.
