# Feature Specification: Playback and Timeline

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Use cases

### UC-2 — Timeline / scrubbing playback

Inside the playback view, a horizontal timeline represents available recordings for the selected camera across a chosen day. The user can scrub to any point; the video player seeks to the corresponding file and offset. Gaps in recording are shown as empty segments.

## Acceptance criteria

### AC-2 — Playback
- [x] In multiple camera playback view cameras placed in a grid (2 columns for 2–4 cameras, 3 columns for 5–9, 4 columns for 10–16). The grid is always sized to its maximum dimensions based on the camera count — cells never collapse or resize when a camera has no recording at the current time position (a placeholder is shown instead). This prevents layout shifts during continuous playback across day boundaries or gaps.
- [x] Video plays in browser without requiring plugins.
- [x] Scrubbing the timeline seeks to the correct position within ±2 seconds.
- [x] Transitions between adjacent recording files are seamless (auto-advance).
- [x] Auto-advance also works when a camera starts its next recording before the previous one stops (overlaps of a fraction of a second are common — 22 across three cameras on 23 Oct 2026). Playback never freezes at such a point, at any speed including 8×; the newer recording takes over.
- [x] Gaps in recordings are visually distinct on the timeline (grey/empty segment).
- [x] Playback controls: play/pause, speed (0.5×, 1×, 2×, 4×, 8×).
- [x] Camera videos show no browser control bar (play, time/duration, volume, fullscreen, ⋮ menu). Its controls act on one camera and one clip only — the seek bar and time cover the current clip, not the day, and its speed menu desyncs that camera — so the shared play/speed buttons and timeline are the only playback controls.
- [x] In multiple-camera mode, a camera whose clip has ended while other cameras keep playing shows the "No recording at this time" placeholder, not the clip's frozen last frame, until playback reaches its next recording.

### AC-6 — Timeline control
- [x] All recordings for the selected time period are represented as intervals; the position and length of each interval correspond to the recording's start time and duration.
- [x] The timeline spans the selected date's local calendar day (midnight to midnight in the camera/NAS time zone, the same day the recording date folders use), so its hour labels match the time display next to the play button. The date picker defaults to today's local date.
- [x] As soon as a date's recordings load, the current-time cursor and time display show where playback will start (the first recording of the day), before Play is pressed.
- [x] In multiple-camera mode each camera has its own labelled row of recording intervals on the timeline.
- [x] When the play button is pressed and the current position is in a gap, playback jumps to the nearest recording to the right.
- [x] The timeline supports zoom in / zoom out; zoomed view pans to keep the current-time cursor visible.
- [x] During playback the current-time cursor and time display update in real time as the video progresses.
- [x] The time display shows the browser's local time (not UTC) as `HH:MM:SS.t`, to a tenth of a second.
- [x] In multiple-camera mode, when recordings on different cameras overlap in time, each clip plays to its end; one camera finishing its clip does not interrupt or skip another camera's clip that is still running. Playback jumps to the next recording only once no camera has footage at the current position.

### AC-5 — Performance (playback)
- [x] Video begins playing immediately of selecting a time on the timeline, so it is necessary to cache video files after go to Playback mode.

## Notes

- **Local day.** Recording date folders are the camera's local calendar day while start/stop times are UTC, so the
  timeline spans local midnight to midnight (see [005-recording-index](../005-recording-index/spec.md)). A UTC
  timeline put recordings after local midnight, and the cursor, off the left edge (fixed 2026-10-23).
- **Overlapping recordings.** One camera's next recording can start ~0.2–0.4 s before the previous stops. The player
  resolves "the recording at time t" to the one that started last; taking the first match rewound the clip that had
  just ended and froze playback at 8× (fixed 2026-10-23, reproduced in production).
- **Testing in a real browser.** A background tab doesn't load `<video>` data, and `play()` from a script `click()` is
  rejected until a real user gesture — both look like freezes but aren't. Keep the tab visible, press Play with a
  real click, and log `<video>` `pause`/`ended`/`seeking` events.

## Related

- Date picker and "no recordings" behaviour: [004-date-search](../004-date-search/spec.md).
