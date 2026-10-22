---

description: "Task list for Camera Health Status on the Maintenance Page"
---

# Tasks: Camera Health Status on the Maintenance Page

**Input**: Design documents from `specs/001-camera-health-status/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/maintenance-status.md, quickstart.md

**Tests**: Included — the constitution's quality gates require tests for new services/routes, and SC-001 is defined
as a replay test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Paths are repo-relative (web app: `server/`, `client/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration needed by all stories

- [ ] T001 Add `healthTimeZone: process.env.HEALTH_TIMEZONE || 'UTC'` to the exported config in `server/config.js`, with a one-line comment that it is the IANA zone used for "today"/"time of day" in health evaluation (research R3)
- [ ] T002 [P] Document `HEALTH_TIMEZONE=UTC` (IANA name, e.g. `Europe/Moscow`) in `.env.example`
- [ ] T003 [P] Add `- HEALTH_TIMEZONE=Europe/Moscow` to the `cctv-ui` service `environment` list in `docker-compose.yml` (not to `cctv-maintenance`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Read path and test fixture that both stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Write failing tests in `server/tests/dbService.test.js` for a new `getRecordingHistory(cameraId, sinceIso)`: returns `{ earliestStart, recordings }` where `recordings` are `{ startTime, stopTime }` with `startTime >= sinceIso`, sorted by start; works for the native `recordings(starttime, stoptime)` fixture and for a managed `cctv_maintenance_index(StartTime, StopTime)` db; `stopTime` is `null` when the column is NULL; returns `null` when the camera has no readable index
- [ ] T005 Implement `getRecordingHistory(cameraId, sinceIso)` in `server/services/dbService.js` reusing `openDb`/`discoverSchema`/`pickCol` (start col patterns `'starttime','start_time','^start$'`, stop col patterns as in `getRecordingsForDate`); two read-only queries: `SELECT min(start)` and `SELECT start, stop … WHERE start >= ? ORDER BY start`; on error `console.warn('[dbService] getRecordingHistory failed for …')` and return `null` (depends on T004)
- [ ] T006 [P] Export the SC-001 fixture to `server/tests/fixtures/health/oct-2026.json`: for each of the 7 production cameras, read-only via `sqlite3 -readonly` over SSH (`~/.ssh/cctv-ui_deploy`), the `start`/`stop` timestamps of all recordings with start between `2026-09-29T00:00:00Z` and `2026-10-21T00:00:00Z`, plus `earliestStart` = the later of `min(start)` and `2026-09-29T00:00:00Z`, so days before the export window are never treated as complete; JSON shape `{ "<cameraId>": { "earliestStart": "...", "recordings": [{ "startTime": "...", "stopTime": "..." }] } }` — timestamps only, no paths or filenames (research R5)

**Checkpoint**: History can be read for both index types; real incident data available for tests

---

## Phase 3: User Story 1 - See which cameras stopped recording (Priority: P1) 🎯 MVP

**Goal**: A green/yellow/red/grey Health label per camera in the `/maintenance` table, reasons on hover/focus,
computed from recording history

**Independent Test**: With 7 days of normal history followed by a day without recordings, the camera is red with a
reason; a normally recording camera is green (quickstart §1–2)

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL before implementation

- [ ] T007 [P] [US1] Write failing unit tests in `server/tests/healthService.test.js` for pure `evaluateHealth(history, now, { timeZone, thresholds })` using synthetic histories: (a) normal → `level: 'ok'`, `reasons: []`; (b) median ≥ 3 and today = 0 → `critical`, reason contains today's count and usual count; (c) median ≥ 8 and today < 0.25 × median → `critical`; (d) median ≥ 3 and today < 0.5 × median → `warn` (spec US1 scenario 4: 15 vs ~40); (e) `now − lastRecordingEnd > max(2 h, 1.5 × longestGap)` → `critical` with reason starting "No recordings for"; (f) fewer than 7 complete days and recency `ok` → `unknown` with reason "learning (N of 7 days)"; fewer than 7 complete days and recency exceeded → `critical`; (g) `history === null` or no recordings → `unknown` with reason "recording data unavailable" / "no recordings found"; (h) overall level is the most severe, `unknown` never outranks a real result; (i) `figures` contains `todayCount`, `usualCount`, `completeDays`, `lastRecordingEnd`, `longestGapMs`, `recencyThresholdMs`; (j) fewer than 2 recordings in the baseline days → `longestGapMs: null`, `recencyThresholdMs: 7200000`
- [ ] T008 [P] [US1] Write failing route tests in `server/tests/routes/maintenance.test.js`: every element of `cameras[]` has a `health` object with `level` in `"ok" | "warn" | "critical" | "unknown"`, `reasons` array, `evaluatedAt` ISO string, `figures` object (contracts/maintenance-status.md); a camera with an unreadable/missing index yields `health.level: 'unknown'` with reason "recording data unavailable"; and a camera whose health evaluation throws unexpectedly still yields 200 with that camera's `health: null` while other cameras are evaluated
- [ ] T009 [P] [US1] Write failing client test `client/src/components/MaintenanceStatus.test.jsx` (mock `getMaintenanceStatus`): renders a "Health" column; one label per camera whose text is the level (`ok`/`warn`/`critical`/`unknown`), whose `title` is the reasons joined by newlines, with `tabIndex=0` and an `aria-label` containing level and reasons; `health: null` renders as `unknown`; existing "Status" (managed/unmanaged) column is still present

### Implementation for User Story 1

- [ ] T010 [US1] Create `server/services/healthService.js` with exported `HEALTH_THRESHOLDS` — the single place for all thresholds (FR-006): `baselineDays: 7`, `activityMinMedianForZero: 3`, `activityCriticalRatio: 0.25`, `activityCriticalMinMedian: 8`, `activityWarnRatio: 0.5`, `activityWarnMinMedian: 3`, `recencyGapMultiplier: 1.5`, `recencyMinMs: 2 h`, `cacheTtlMs: 60 s` (data-model.md)
- [ ] T011 [US1] Implement local-time helpers in `server/services/healthService.js` using `Intl.DateTimeFormat` with the `timeZone` option only (no date library, Principle VI): local date key for an instant, start-of-local-day instant, and milliseconds since local midnight (research R3)
- [ ] T012 [US1] Implement pure `evaluateHealth(history, now, { timeZone, thresholds })` in `server/services/healthService.js` per data-model.md "Level rules": `end = stopTime ?? startTime`; complete day = day that began after `earliestStart`; baseline = previous 7 complete local days (today excluded); activity compares today's count up to current time-of-day with the median of the same window; gaps only between consecutive recordings (`next.start − prev.end`, clamped ≥ 0) over baseline days; recency threshold `max(recencyMinMs, recencyGapMultiplier × longestGapMs)`, or `recencyMinMs` when `longestGapMs` is `null`; while activity is learning, recency counts only when `critical`, else overall `unknown`; severity order `unknown < ok < warn < critical`; human-readable reasons (e.g. "0 recordings today; usually ~45 by 14:00", "No recordings for 2d 9h; normally never more than 6h apart"); returns `{ level, reasons, evaluatedAt, figures }`; skips rows with unparsable `startTime` with one `console.warn` per call (depends on T010, T011; makes T007 pass)
- [ ] T013 [US1] Implement `getCameraHealth(cameraId, now = new Date())` in `server/services/healthService.js`: calls `getRecordingHistory(cameraId, sinceIso)` with `sinceIso` = start of local day `baselineDays` days before today, then `evaluateHealth` with `config.healthTimeZone`; memoises per camera for `cacheTtlMs` (including `null` results, so a broken index logs at most once per TTL); wraps everything in try/catch → `console.warn` and returns `null` on unexpected error (depends on T005, T012)
- [ ] T014 [US1] Add `health: getCameraHealth(camera.id)` to each camera object in `getCameraStatuses()` in `server/services/maintenanceStatusService.js`, isolated so one camera's failure does not reject `Promise.all`; add a case to `server/tests/maintenanceStatusService.test.js` asserting each returned camera has a `health` key (depends on T013; makes T008 pass)
- [ ] T015 [P] [US1] Add `.maint-badge.ok` (green), `.maint-badge.warn` (yellow), `.maint-badge.critical` (red), `.maint-badge.unknown` (grey) variants in `client/src/components/MaintenanceStatus.css`, using existing CSS variables from `client/src/index.css` where available and readable in the dark theme
- [ ] T016 [US1] Add a "Health" column right after "Camera" in `client/src/components/MaintenanceStatus.jsx`: `<span className={\`maint-badge ${level}\`} title={reasons.join('\n')} tabIndex={0} aria-label={…}>{level}</span>`, with `health: null` treated as `unknown`; no other columns or views added (FR-007, FR-008; depends on T015; makes T009 pass)

**Checkpoint**: `/maintenance` shows a Health label per camera; quickstart §1–2 pass for US1 tests

---

## Phase 4: User Story 2 - Quiet cameras are not false alarms (Priority: P2)

**Goal**: Health is relative to each camera's own history: normal overnight gaps and low-count mornings stay green,
and the real 13–19 Oct incident is classified correctly

**Independent Test**: A camera with ~5 recordings/day and 14 h overnight gaps stays green through a normal 10 h gap
and at 08:00 with 0 recordings; SC-001 replay passes

### Tests for User Story 2 ⚠️

- [ ] T017 [P] [US2] Add unit tests to `server/tests/healthService.test.js`: (a) longest baseline gap 14 h, 10 h since last recording → `ok` (spec US2 scenario 1); (b) camera typically 0–1 recordings by 08:00, 0 today at 08:00 → `ok` (scenario 2); (c) an ongoing outage (open trailing gap) does not enlarge `longestGapMs`; (d) days before `earliestStart` and the partially-retained oldest day are not counted as complete; (e) day boundaries follow `timeZone: 'Europe/Moscow'` (a recording at 22:30Z counts toward the next local day); (f) SC-002: a synthetic camera records every 30 min from 07:00 to 21:00 for 7 days, then stops at 10:00 today — not `critical` at `lastEnd + threshold − 1 min`, `critical` at `lastEnd + threshold + 1 min`, where threshold = `figures.recencyThresholdMs`
- [ ] T018 [US2] Add SC-001 replay test to `server/tests/healthService.test.js` using `server/tests/fixtures/health/oct-2026.json`: evaluate every camera at each whole hour from 2026-10-13T00:00+03:00 to 2026-10-19T23:00+03:00 with `timeZone: 'Europe/Moscow'`; assert `axis-b8a44f6c2746`, `axis-b8a44f734f32`, `axis-b8a44f73558a`, `axis-00408CE2767E` are `critical` at 2026-10-18T23:00+03:00 at the latest, and every camera's `figures.recencyThresholdMs` ≤ 24 h (SC-002); `axis-00408CE298CD`, `axis-00408CF0FE28`, `axis-ACCC8E368EE5` are `ok` at **every** hourly instant 2026-10-13T00:00+03:00 … 2026-10-19T23:00+03:00 (SC-001); and over every local day 2026-10-07 … 2026-10-20 none of those three is `warn`/`critical` at any hourly instant (SC-003: 14 days < 30, so zero false days allowed) — report the day count and false-alarm count in the test output (depends on T006)

### Implementation for User Story 2

- [ ] T019 [US2] Make T017/T018 pass by adjusting `evaluateHealth` in `server/services/healthService.js`; if replay shows a false alarm, tune values only in `HEALTH_THRESHOLDS` and record the change and its reason under R4 in `specs/001-camera-health-status/research.md`; if "`ok` at every instant" cannot be met without the four failed cameras missing 18 Oct, stop and report the conflict instead of weakening the assertion (depends on T012, T017, T018)

**Checkpoint**: Both stories pass; thresholds validated against real data

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 Measure in-process `getRecordingHistory` time for all 7 cameras on the NAS (run once inside the `cctv-ui` container after deploy, read-only) and record the result under R2 in `specs/001-camera-health-status/research.md`; keep the 60 s memo regardless. Limit: ≤ 100 ms warm and ≤ 500 ms cold for the 7 cameras in total; if the cold limit is exceeded, change `getCameraHealth` in `server/services/healthService.js` to return the last cached value immediately and refresh in the background one camera per tick, so no request waits on more than one camera's read
- [ ] T021 [P] Update `PRD.md`: extend UC-6 and add an acceptance criterion for the per-camera Health label (green/yellow/red/grey, reasons on hover, derived from recording history only)
- [ ] T022 [P] Update `CLAUDE.md`: add `healthService.js` to the folder structure, `HEALTH_TIMEZONE` to the env section, and a short "Camera health" paragraph under the Maintenance Service status-page notes (two rules, thresholds in `HEALTH_THRESHOLDS`, read-only), and update the "Known gap, not yet mitigated" paragraph so "time since last recording" is listed as implemented rather than planned
- [ ] T023 Run `npm test` and `npm run build` from repo root; both must pass
- [ ] T024 Run quickstart.md §2 (local `/maintenance` against `video_example`) and, after deploy, §3 (production curl check and < 2 s page load)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup — blocks both stories
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after Foundational; T019 also depends on T012 (US1's evaluator) — US2 refines the same rules
- **Polish (Phase 5)**: after US1 and US2

### Within Each User Story

- Tests first, failing; then thresholds/helpers → evaluator → service wiring → UI

### Parallel Opportunities

- T002, T003 in parallel with each other (after T001 or alongside it)
- T006 (fixture export) in parallel with T004/T005
- T007, T008, T009 in parallel (three different test files)
- T015 (CSS) in parallel with server tasks T010–T014
- T021, T022 in parallel

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Unit tests for evaluateHealth in server/tests/healthService.test.js"          # T007
Task: "Route tests for health field in server/tests/routes/maintenance.test.js"      # T008
Task: "Client test for Health column in client/src/components/MaintenanceStatus.test.jsx"  # T009

# Then UI styling alongside server implementation:
Task: "Badge colour variants in client/src/components/MaintenanceStatus.css"         # T015
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) → validate with quickstart §1–2 → deployable MVP
3. Phase 4 (US2) before relying on the labels day to day, since it is what proves no false alarms

### Incremental Delivery

1. Setup + Foundational → history readable
2. US1 → labels visible (deploy/demo)
3. US2 → thresholds proven on the real incident (deploy)
4. Polish → docs, measurements, final validation

---

## Notes

- No new endpoints, services, storage, or dependencies (constitution I, III, VI)
- Commit after each task or logical group
- The fixture export (T006) is read-only on the NAS and contains timestamps only
