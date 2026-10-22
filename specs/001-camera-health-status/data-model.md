# Data Model: Camera Health Status

No persistent storage is added. All entities are read from existing indexes or computed in memory per request.

## Recording (read, existing)

| Field | Type | Source |
|---|---|---|
| `startTime` | ISO-8601 UTC string | native `recordings.starttime` / managed `cctv_maintenance_index.StartTime` |
| `stopTime` | ISO-8601 UTC string or `null` | `stoptime` / `StopTime` |

Validation: rows with an unparsable `startTime` are skipped (logged once per camera with `console.warn`).
`end = stopTime ?? startTime`.

## RecordingHistory (read, new query result)

| Field | Type | Notes |
|---|---|---|
| `earliestStart` | ISO string or `null` | `min(start)` over the whole index; decides which days are complete |
| `recordings` | `Recording[]` | started at/after local midnight 7 days before today, sorted by start |

`null` overall when the camera has no readable index.

## HealthThresholds (constant, one place — FR-006)

| Key | Default | Rule |
|---|---|---|
| `baselineDays` | 7 | both |
| `activityMinMedianForZero` | 10 | activity → critical when today = 0 |
| `activityCriticalRatio` / `activityCriticalMinMedian` | 0.25 / 20 | activity → critical |
| `activityWarnRatio` / `activityWarnMinMedian` | 0.4 / 20 | activity → warn |
| `recencyGapMultiplier` | 1.5 | recency |
| `recencyMinMs` | 2 h | recency floor |
| `cacheTtlMs` | 60 s | memoisation |

## CameraHealth (computed, returned by API)

| Field | Type | Notes |
|---|---|---|
| `level` | `'ok' \| 'warn' \| 'critical' \| 'unknown'` | most severe rule result |
| `reasons` | `string[]` | empty when `ok`; human-readable, e.g. `"0 recordings today; usually ~45 by 14:00"` |
| `evaluatedAt` | ISO string | instant used as "now" |
| `figures.todayCount` | number | recordings today up to now |
| `figures.usualCount` | number or `null` | median of same window over complete baseline days |
| `figures.completeDays` | number | 0–7; `< 7` ⇒ activity is "learning" |
| `figures.lastRecordingEnd` | ISO or `null` | newest `end` |
| `figures.longestGapMs` | number or `null` | typical longest gap: median over baseline days of each day's longest gap between consecutive recordings |
| `figures.recencyThresholdMs` | number or `null` | `max(recencyMinMs, multiplier × longestGapMs)`; `recencyMinMs` when `longestGapMs` is `null`; `null` only when there are no recordings |

### Level rules

```
activity  (completeDays ≥ 7):
  median ≥ 10 and today = 0                → critical
  median ≥ 20 and today < 0.25 × median    → critical
  median ≥ 20 and today < 0.4  × median    → warn
  otherwise                                → ok
activity  (completeDays < 7)               → learning (no level; reason "learning (N of 7 days)")

recency   (lastRecordingEnd known):
  threshold = longestGapMs == null ? recencyMinMs
                                   : max(recencyMinMs, multiplier × longestGapMs)
  now − lastRecordingEnd > threshold       → critical
  otherwise                                → ok, but counts as no result while activity is learning

no history at all / index unreadable       → unknown
no recordings in the window, older ones   → critical ("No recordings for more than 7 days")
overall = max severity of the rule results; unknown if there are none (incl. learning + recency ok)
```

Severity order: `unknown` < `ok` < `warn` < `critical` (unknown never outranks a real result).
