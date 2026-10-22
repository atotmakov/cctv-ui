# Feature Specification: Camera Health Status on the Maintenance Page

**Feature Branch**: `001-camera-health-status`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "I would like to see the camera status on maintanace page based on syslog data and recorded intervals" — revised 2026-10-21: "skip all the notes about syslog and calculate the camera health only on record history".

## Context

On 2026-10-19 four of seven cameras had effectively stopped recording while the maintenance status page showed
every camera as healthy. The recording history already on the share showed the problem: the newest recording on
those cameras was 1–2.5 days old, and recent days held almost no recordings compared with each camera's usual
pattern. This feature turns each camera's recording history into a single coloured health label on the maintenance
page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which cameras stopped recording (Priority: P1)

An IT admin opens the maintenance status page and, in the existing cameras table, sees a coloured status label per
camera: green (ok), yellow (warn), red (critical), or grey (unknown) — the health label. Hovering or focusing the label shows the
plain-language reasons, e.g. "No recordings for 31h; normally at most ~6h apart" or "0 recordings today;
usually ~45 by this time".

**Why this priority**: This is the failure that actually happened and went unnoticed for two days.

**Independent Test**: With 7 days of normal recording history for a camera followed by a day without recordings,
open the status page and confirm that camera is red with a reason, while cameras recording normally are green.

**Acceptance Scenarios**:

1. **Given** a camera that usually has ~40 recordings by 14:00 and has 0 today by 14:00, **When** the admin opens
   the status page, **Then** its label is red (critical) with a reason naming today's count and the usual count.
2. **Given** a camera recording at its normal rate, **When** the admin opens the status page, **Then** its label is
   green (ok) with no reasons.
3. **Given** a camera whose newest recording ended longer ago than its normal longest gap allows, **When** the admin
   opens the status page, **Then** its label is red with a "no recordings for …" reason.
4. **Given** a camera recording noticeably less than usual but not stopped (e.g. 15 today vs ~40 usual), **When**
   the admin opens the status page, **Then** its label is yellow (warn) with a reason naming both counts.
5. **Given** a camera with fewer than 7 days of recording history, **When** the admin opens the status page,
   **Then** its comparison is "learning (N of 7 days)"; it is grey unless the recency rule alone makes it red.

---

### User Story 2 - Quiet cameras are not false alarms (Priority: P2)

A motion-only camera that normally records a handful of times a day and is silent overnight stays green during its
normal quiet periods. Health is judged against each camera's own history, not one fixed rule for all cameras.

**Why this priority**: A label that is red for healthy cameras gets ignored, which would defeat Story 1.

**Independent Test**: For a camera with 7 days of history showing ~5 recordings a day and 14 h overnight gaps,
confirm it stays green 10 h into a normal overnight gap and on a normal low-count morning.

**Acceptance Scenarios**:

1. **Given** a camera whose longest gap over the last 7 days was 14 h, **When** 10 h have passed since its last
   recording, **Then** its label is green.
2. **Given** a camera that typically has 0–1 recordings by 08:00, **When** it has 0 at 08:00, **Then** its label is
   green.

---

### Edge Cases

- **Start of day**: today's count is compared with the camera's typical count *up to the same time of day*, not a
  full-day total.
- **No recording history at all** (new camera, empty folder): grey (unknown), reason "no recordings found".
- **Recording history shorter than 7 days**: comparison rule is "learning"; recency rule still applies once at least
  one recording exists; if no gap can be measured (fewer than 2 recordings in the baseline days), the 2 h minimum
  is the threshold.
- **Managed cameras' index refreshes hourly**: recordings may appear on the status page up to an hour late; the
  minimum recency threshold (2 h) absorbs this so no camera turns red only because of index lag.
- **Retention boundary**: the oldest days in the window may be partially deleted by retention; comparisons use only
  complete days within the camera's available history.
- **Unreadable index or missing folder for one camera**: that camera is grey with reason "recording data
  unavailable"; other cameras and the rest of the page are unaffected.
- **Clock/timezone**: days and "time of day" are in the NAS's local timezone.

## Requirements *(mandatory)*

### Functional Requirements

**Data**

- **FR-001**: The system MUST derive each camera's health only from its recording history already indexed for that
  camera (start and end time of each recording), for the current day and the previous 7 days.
- **FR-002**: Deriving health MUST NOT write to or modify the share or any index.

**Evaluation**

- **FR-003**: The system MUST compute per camera a level of `ok`, `warn`, `critical`, or `unknown`, plus a list of
  human-readable reasons. The overall level is the most severe rule result; `unknown` only when there is no
  recording data to evaluate. While the activity rule is learning, the recency rule contributes only when it is
  `critical`; otherwise the overall level is `unknown` with reason "learning (N of 7 days)".
- **FR-004**: Activity rule: compare today's number of recordings up to the current time of day with the median of
  the same time window over the previous 7 complete days. If the median is at least 10 and today's count is 0, or
  today is below 25% of a median of at least 20 → `critical`; below 40% of a median of at least 20 → `warn`. With
  fewer than 7 complete days of history the rule reports "learning" and yields no level. (Values tuned on the
  production replay — see research R4; earlier draft values 3/8/50%/3 flagged normal quiet mornings.)
- **FR-005**: Recency rule: if the time since the newest recording ended is longer than 1.5× the camera's typical
  longest gap — the median, over the previous 7 days, of each day's longest gap between consecutive recordings —
  and never less than 2 h → `critical`. Using the median means one past outage does not loosen the threshold.
- **FR-006**: Thresholds (multipliers, percentages, minimum gap, window length) MUST be defined in one place on the
  server, not hardcoded across the code; they are not configurable from the UI.

**Display**

- **FR-007**: The cameras table on the maintenance status page MUST show one health label per camera — green (ok),
  yellow (warn), red (critical), grey (unknown) — with the reasons available on hover/focus. Colour MUST NOT be the
  only cue: the label also carries the level as text.
- **FR-008**: No other new columns, charts, or views are added to the page.
- **FR-009**: If health cannot be computed for a camera, the rest of that camera's row and the page MUST show
  everything they show today.

**Safety (constitution)**

- **FR-010**: Health MUST be served through the existing read-only status endpoint (or another read-only one); no
  endpoint may change thresholds or stored data.

### Key Entities

- **Camera** — an existing camera folder on the share.
- **Recording** — an existing recording's start and end time, as already indexed per camera.
- **Camera health** — computed on each request: level, reasons, and the figures each reason is based on (today's
  count, usual count, time since last recording, longest normal gap).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Evaluated against the real recording history of 13–19 Oct 2026, the four cameras that stopped
  recording are red by the end of 18 Oct at the latest, and the three normally recording cameras are green on every
  day.
- **SC-002**: A camera that stops recording turns red no later than max(2 h, 1.5 × its typical longest gap between
  recordings over the previous 7 days) after its last recording ended; in the 13–19 Oct replay this is within 24 h
  for every camera.
- **SC-003**: No camera with normal recording activity is yellow or red on more than 1 day in 30.
- **SC-004**: The maintenance status page still loads within 2 s for 16 cameras.

## Assumptions

- Every recording on the share appears in the camera's existing index (native `index.db` or maintenance-managed
  index), so the index is the source of recording history; no folder scanning is needed for health.
- Days are counted in the NAS's local timezone.
- Status is shown on the maintenance page only.
- Alerts and notifications remain out of scope, as in the PRD.
- The existing camera-agent heartbeat display stays as it is.

## Out of Scope

- Camera syslog as a health source (researched 2026-10-19/20; deferred — findings kept for a possible later
  feature).
- Health badges on the camera grid.
- Activity views, charts, extra figure columns.
- Archive-level signals (total archive length, missing days, index/disk drift).
- UI-configurable thresholds; alerts/notifications.
