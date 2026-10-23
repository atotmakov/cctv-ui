# Feature Specification: Search by Date and Time

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Use cases

### UC-3 — Search by date & time

Users select a camera and a date (via date picker), and the app shows which time ranges have recordings. Entering a specific time jumps the timeline to that point and begins playback.

## Acceptance criteria

### AC-3 — Search
- [x] User can pick any camera and any date via date picker.
- [x] App shows which hours/segments have recordings for that day.
- [ ] User can type or click a specific time to jump the player to that point. (click-to-seek on the timeline is implemented; typing a time is not)
- [x] If no recordings exist for a date, a clear "no recordings" message is shown.

## Related

- Timeline click-to-seek: [003-playback-timeline](../003-playback-timeline/spec.md) (AC-6).
