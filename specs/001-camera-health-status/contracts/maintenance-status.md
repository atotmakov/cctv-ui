# Contract: `GET /api/maintenance/status` (extended)

Read-only, unchanged method/path/status codes. One field is **added** to each element of `cameras[]`; all existing
fields keep their names and meaning, so existing clients are unaffected.

## Response (excerpt)

```json
{
  "configuredRetentionDays": 33,
  "lastRun": { "...": "unchanged" },
  "cameras": [
    {
      "id": "axis-b8a44f6c2746",
      "managed": true,
      "activeDbFile": "index_[managed].db",
      "dateFolderCount": 32,
      "oldestDate": "20260916",
      "newestDate": "20261017",
      "heartbeat": { "...": "unchanged" },
      "health": {
        "level": "critical",
        "reasons": [
          "No recordings for 2d 9h; normally never more than 4h apart",
          "0 recordings today; usually ~38 by 14:00"
        ],
        "evaluatedAt": "2026-10-19T11:00:00.000Z",
        "figures": {
          "todayCount": 0,
          "usualCount": 38,
          "completeDays": 7,
          "lastRecordingEnd": "2026-10-17T05:39:26.581512Z",
          "longestGapMs": 14400000,
          "recencyThresholdMs": 21600000
        }
      }
    }
  ]
}
```

## `health` field

| Field | Type | Required | Notes |
|---|---|---|---|
| `level` | `"ok" \| "warn" \| "critical" \| "unknown"` | yes | |
| `reasons` | `string[]` | yes | `[]` when `ok`; display text, not machine-parsed |
| `evaluatedAt` | ISO-8601 string | yes | |
| `figures` | object | yes | see [data-model.md](../data-model.md#camerahealth-computed-returned-by-api); individual values may be `null` |

An unreadable or missing index yields `level: "unknown"` with reason "recording data unavailable". `health` is
`null` only if evaluation threw unexpectedly for that camera (logged server-side); the client then renders the label
as unknown. A failure for one camera never fails the whole response.

## Guarantees

- No query parameters; no new endpoints; no request can alter thresholds or data (constitution Principle III).
- Results may be up to 60 s old (per-camera memoisation).
