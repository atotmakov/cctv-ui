# Feature Specification: Recording Index Reading

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Purpose

Supports every viewing use case (grid, playback, search) and the health label: the server reads each camera's
recording list — start/stop time, duration, camera, file path — from the camera's SQLite index instead of walking
the share, and keeps working when an index is missing or broken.

## Acceptance criteria

### AC-4 — SQLite db metadata parsing
- [x] App correctly reads start time, duration, camera ID, and file path from Sqlite db for each camera.
- [x] Malformed or missing sqlite db files are skipped with a server-side warning log; they do not crash the app.

## Notes

- Each camera folder has a native `index.db` (written by the camera) or, for managed cameras, an
  `index_[managed].db` rebuilt by [006-maintenance-service](../006-maintenance-service/spec.md); the read path
  prefers the native file when both exist.
- `StartTime`/`StopTime` are UTC; the `YYYYMMDD`/`HH` folders and recording tokens are the camera's **local** time
  (Europe/Moscow in production) — a recording at `2026-10-22T21:01Z` is in `20261023/00/`. Anything grouping
  recordings by day must use the local day.
- Consecutive recordings of one camera can overlap by a fraction of a second (22 overlaps across three cameras on
  2026-10-23).
