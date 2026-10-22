# Research: Camera Health Status

All facts below were measured read-only on production (NAS 192.168.1.100) on 2026-10-21 unless noted.

## R1 — Source of recording history

- **Decision**: Read start/stop times from the camera's existing index via `dbService` (native `index.db` table
  `recordings(starttime, stoptime)`, or maintenance-managed `index_[managed].db` table
  `cctv_maintenance_index(StartTime, StopTime)`), using the existing native-first resolution and column discovery
  (`pickCol`). Add one read function returning recordings started at or after a given instant, plus the earliest
  start time.
- **Rationale**: Both schemas already work through `dbService`; the data is small (1,100–2,400 rows per camera in
  total, 140–620 in the last 8 days); timestamps in both are ISO-8601 UTC strings
  (`2026-10-21T18:56:47.721339Z`), so `starttime >= ?` with an ISO bound is a correct lexicographic filter.
- **Alternatives considered**: XML/folder scan via `xmlService.scanRecordingsForDate` — authoritative but costs one
  directory walk per camera per day × 8 days; rejected for a page that must load in 2 s. Cameras without any index
  are reported `unknown` ("recording data unavailable") instead of falling back to a scan.

## R2 — Query cost and caching

- **Finding**: `sqlite3` CLI on the NAS took 0.23–1.26 s per native index for the 8-day query, *including process
  start and cold cache*; managed indexes ~0.00 s. In-process timing with the viewer's already-open, cached
  connection is not yet measured. Native index files have no index on `starttime`, so each query is a full scan of
  ≤ ~2,500 rows.
- **Decision**: Compute health per camera on request, but memoise each camera's result for 60 s in process memory.
  `node:sqlite` is synchronous, so the cost is paid on the event loop once per camera per minute at most.
- **Rationale**: Keeps SC-004 (status page < 2 s for 16 cameras) safe even if in-process reads turn out to be
  hundreds of ms; 60 s staleness is irrelevant for signals measured in hours.
- **Alternatives considered**: Precompute in the maintenance job — rejected: it only covers managed cameras, runs
  hourly, and would add a new write (constitution Principle I). No cache — acceptable if measured in-process time is
  small; re-evaluate against the T020 limits (≤ 100 ms warm / ≤ 500 ms cold for 7 cameras in total); if exceeded,
  serve the cached result and refresh in the background so the event loop is never blocked by more than one
  camera's read (constitution Principle IV).
- **Null results** (unexpected error) are memoised for the same 60 s, so a broken index logs once a minute, not on
  every request.

## R3 — Timezone for "today" and "time of day"

- **Finding**: NAS clock is MSK (+03:00); containers run in UTC by default (`docker-compose.yml` sets no `TZ`).
- **Decision**: New config value `HEALTH_TIMEZONE` (IANA name, default `UTC`); production sets
  `HEALTH_TIMEZONE=Europe/Moscow` on the `cctv-ui` service. Local day boundaries and time-of-day are computed with
  the built-in `Intl.DateTimeFormat` (`timeZone` option); no dependency.
- **Rationale**: `node:22-alpine` ships full ICU, so `Intl` resolves IANA zones without system tzdata; using an
  explicit option avoids depending on the process `TZ` and keeps tests deterministic.
- **Alternatives considered**: Process-wide `TZ` env — depends on Alpine tzdata being installed (not guaranteed);
  date library (luxon/date-fns-tz) — violates Principle VI for a few lines of `Intl` code.

## R4 — Rule details left open by the spec

- **Gap definition**: gap = `next.start − prev.end` between consecutive recordings sorted by start (clamped ≥ 0;
  `end = stoptime ?? starttime`). Only gaps *between* recordings count, so an ongoing outage (open trailing gap)
  never inflates its own baseline.
- **Baseline window**: the previous 7 complete local days; today is excluded from the baseline.
- **Complete day**: a day counts only if the camera's earliest indexed recording started before that day began
  (handles new cameras and the retention boundary).
- **Null stop time** (recording in progress or never closed): end = start. Conservative: a continuously-recording
  camera still produces new starts well within the 2 h minimum.
- **Known limitation**: after a camera recovers from a long outage, that outage becomes its longest gap and relaxes
  the recency threshold for the next 7 days. Accepted for v1; the activity rule still catches a repeat stop.
  Revisit (e.g. percentile instead of max) only if SC-003/SC-001 replay shows a problem.

## R5 — Validating SC-001 against real data

- **Decision**: Export recordings (start/stop timestamps only, no paths or video) for 2026-09-29 … 2026-10-21 from
  the 7 production indexes into a JSON test fixture, with `earliestStart` clamped to the start of the export
  window (otherwise days before it would count as complete days with zero recordings). Replay `evaluateHealth` at
  hourly instants from 13 to 19 Oct. Assertions: `…6c2746`, `…734f32`, `…73558a`, `…2767E` are `critical` no later
  than 18 Oct 23:00 MSK; `…298CD`, `…0FE28`, `…8EE5` are `ok` at every hourly instant (SC-001); every camera's
  recency threshold is ≤ 24 h (SC-002); over 7–20 Oct the three healthy cameras have zero `warn`/`critical` days
  (SC-003: 14 days < 30, so no false day is allowed).
- **Rationale**: Proves thresholds against the incident that motivated the feature; timestamps alone carry no
  sensitive content.
- **Note**: if replay shows a false alarm on a healthy camera, thresholds are tuned in the single thresholds object
  (FR-006), and the change is recorded here.

## R6 — Display

- **Decision**: New "Health" column next to "Camera" in the existing `MaintenanceStatus` table: a label using the
  existing `maint-badge` styling with new `ok`/`warn`/`critical`/`unknown` colour variants, text = level,
  `title` = reasons joined by newlines, `tabIndex=0` and `aria-label` for keyboard/screen-reader access.
- **Rationale**: Satisfies FR-007 (colour + text, reasons on hover/focus) and FR-008 (one column, nothing else).
  The existing "Status" column (managed/unmanaged) keeps its name.
