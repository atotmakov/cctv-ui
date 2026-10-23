# Feature Specification: Maintenance Status Page

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Use cases

### UC-6 — Maintenance status visibility

IT admins can open a dedicated status page in the app to see, per camera, whether it is currently managed or unmanaged, which index file is active, and its date-folder count with oldest/newest date — computed live on every visit, never stale. The page also shows a summary of the last real maintenance run: timestamp, cameras managed, folders removed, rows written, and any per-camera errors. Each camera also gets a health label — green (ok), yellow (warn), red (critical) or grey (unknown) — derived only from its own recording history: how many recordings it has today compared with the same time on its previous 7 days, and how long since its last recording compared with its usual longest gap. Hovering or focusing the label shows the reasons in plain language. (Spec: `specs/001-camera-health-status/`.)

## Acceptance criteria

### AC-8 — Maintenance status page
- [x] The status page shows, per camera, whether it is managed or unmanaged and which index file is currently active, recomputed live on every page load — never stale.
- [x] The status page shows each camera's date-folder count and oldest/newest date.
- [x] The status page shows a summary of the last real (non-dry-run) run: timestamp, cameras managed, folders removed, rows written, and any per-camera errors.
- [x] The status page is read-only and cannot trigger or otherwise affect a maintenance run.
- [x] For a camera reporting its own heartbeat (via the separate `acap-sd-s3-sync` camera-side app), the status page shows its agent version, time since last heartbeat, and the last S3 sync pass result — cameras not running that app just show no heartbeat data, never an error.
- [x] Each camera shows a health label — green ok / yellow warn / red critical / grey unknown, with the level also as text — derived only from that camera's recording history; hovering or focusing it shows the reasons for every level, green included — problems first, then the checks that passed (e.g. "No recordings for 31h; normally at most ~6h apart", or for a green camera "Last recording 30m ago; alert after 13h" and "44 recordings today; usually ~31 by 22:54"). A camera with less than 7 days of history is grey ("learning") unless it has clearly stopped. One camera's unreadable index never affects the rest of the page.
- [ ] IT admins can view and download the maintenance log directly from the status page. (tracked TODO — see `CLAUDE.md` "Maintenance Service")

## Related

- The camera health label is specified in full in [001-camera-health-status](../001-camera-health-status/spec.md).
- What the page reports on: [006-maintenance-service](../006-maintenance-service/spec.md).
