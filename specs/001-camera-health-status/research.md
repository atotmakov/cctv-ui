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
- **Measured in-process (2026-10-22, T020)**: inside the running `cctv-ui` container on the NAS (read-only
  connections, `node:sqlite`), the `min(start)` + 8-day query for all 7 cameras took **16.9 ms cold** (including
  opening each file) and **7.5 ms warm** in total — 0.5–3.5 ms per camera, 74–603 rows each. The 0.23–1.26 s above
  was `sqlite3` CLI process start-up. Far inside the T020 limits (≤ 500 ms cold / ≤ 100 ms warm), so no background
  refresh is needed; the 60 s memo stays.
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
- **Typical longest gap (revised 2026-10-22 after replay)**: the first draft used the single longest gap over the
  baseline. The replay showed that one past outage then relaxes the threshold for a week — `axis-00408CE2767E`'s
  20.5 h outage on 8 Oct gave it a 31 h threshold (SC-002 failed), and `axis-b8a44f73558a`'s 78 h outage on 4 Oct
  would have been worse. Now: each baseline day's longest gap (assigned to the day the earlier recording started),
  then the **median** across days. Healthy cameras' typical longest gap is their 8–11 h overnight gap.

### Threshold tuning from the replay (2026-10-22, T019)

| Key | Draft | Tuned | Why |
|---|---|---|---|
| `activityMinMedianForZero` | 3 | 10 | 0 vs ~3 at 07:00 on a Saturday (`…0FE28`, 10 Oct) is normal |
| `activityCriticalMinMedian` | 8 | 20 | 3 vs ~14 at 10:00 on the same Saturday was flagged critical |
| `activityWarnMinMedian` | 3 | 20 | 1 vs ~3–4 at 07:00 and 4 vs ~9 at 09:00 were flagged on 6 mornings |
| `activityWarnRatio` | 0.5 | 0.4 | `…298CD` had 14 vs ~29 (48%) on the evening of Mon 12 Oct; spec scenario 15 vs ~40 (37.5%) still warns |

Result over the 29 Sep – 20 Oct export (hourly, Europe/Moscow):

- Healthy cameras (`…298CD`, `…0FE28`, `…8EE5`): **0 false-alarm days** in 7–20 Oct (draft: 8), `ok` at every hour
  of 13–19 Oct.
- Failed cameras first critical: `…6c2746` 15 Oct 22:00 (7 vs ~50 today), `…734f32` / `…73558a` 16 Oct 05:00 and
  `…2767E` 16 Oct 11:00 (no recordings for 12–13 h vs a typical ~8 h) — all before the 18 Oct target, and all
  critical at 18 Oct 23:00.
- Before the incident (7–14 Oct) the failed cameras were flagged only on real anomalies: `…2767E` recorded nothing
  until midday on 8 Oct, `…6c2746`/`…734f32` had a third of their usual count on 8–9 Oct, `…73558a` was coming back
  from its 78 h outage on 7 Oct.
- Trade-off: a camera whose usual count by now is under 20 is judged by the recency rule only (activity never
  warns). That covers quiet cameras; it means a quiet camera recording at half its rate is not flagged.
- **Open issue found on the live check (2026-10-22)**: a camera that keeps trickling (≈1 recording/day) for more than
  ~4 days normalises into its own 7-day baseline and turns green — `…2767E` showed `ok` with 1 today vs a usual 8
  (it was ~75/day before 17 Oct), `…6c2746` `ok` with a usual 1. The replay (to 19 Oct) could not show this.
  Candidate fix: use up to 28 complete days (still ≥ 7 to leave "learning") for both medians, so an outage only
  becomes "normal" after ~2 weeks. Needs a spec decision (FR-001/004/005 say "previous 7 days").
  Confirmed again 2026-10-23 with the new ok-tooltips: `…2767E`, `…6c2746`, `…734f32`, `…73558a` all `ok` with
  "usually ~0–1 by 22:54" and recency limits of 1d 4h–1d 9h.

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
- **Revision (2026-10-23, after the live check)**: a green label had an empty tooltip, which left the admin
  unable to tell why it was green. Every rule that ran now adds a reason line — problems first, then
  "learning", then passed rules: `"Last recording 30m ago; alert after 13h"` (recency) and
  `"44 recordings today; usually ~31 by 22:54"` (activity). These lines also made the open issue in R4 visible on
  the page: four of seven cameras showed "usually ~0–1", i.e. a near-dead week had become their baseline.
- **Rationale**: Satisfies FR-007 (colour + text, reasons on hover/focus) and FR-008 (one column, nothing else).
  The existing "Status" column (managed/unmanaged) keeps its name.
