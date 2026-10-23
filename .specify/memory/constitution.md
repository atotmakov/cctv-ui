# CCTV Recording Viewer Constitution

## Core Principles

### I. Read-Only Viewer, Single Out-of-Band Writer (NON-NEGOTIABLE)

- The viewer app (`server/routes/*`, `server/index.js`, and the read paths of `server/services/*`)
  MUST NOT write, delete, rename, or modify anything on the recordings share.
- `server/maintenance/` is the sole component permitted to write or delete on the share. It MUST
  run out-of-band as its own process/container and MUST NOT be started by, imported into, or
  triggered from the viewer app.
- In production the viewer container MUST mount the share read-only (`:ro`), so the rule above is
  enforced by Docker, not only by convention.
- Maintenance writes MUST be limited to retention deletion of whole `YYYYMMDD` date-folders and
  the `index_[managed].db` file; any new kind of write requires a constitution amendment.

Rationale: recordings are evidence. Keeping every writer in one auditable place, physically
separated from the network-facing app, limits what a bug or an attacker can destroy.

### II. Detected, Not Configured, Ownership

- Whether a camera is managed MUST be derived fresh from the filesystem on every maintenance run
  and every status request: a folder is managed only when it has no native `index.db`.
- Nothing in this codebase may ever write to, delete, or alter a native `index.db` or the
  recordings of a camera that has one.
- When both files exist, readers MUST prefer the native `index.db` over `index_[managed].db`.
- Filesystem-internal directories (names starting with `@` or `#`, e.g. `@eaDir`, `#recycle`)
  MUST be excluded from camera discovery before any read or maintenance logic sees them.
- `index_[managed].db` MUST be rebuilt from the same authoritative XML/filesystem scan the read API
  trusts, in a single in-place transaction, so open read connections see consistent data.

Rationale: an allowlist goes stale; a camera with a live writer would be desynced by a second
writer. Auto-detection removes the config to forget, at the cost of strict discovery filtering.

### III. No Network-Reachable Mutation

- v1 has no authentication. Therefore every HTTP endpoint MUST be safe to expose to anyone on the
  LAN: no endpoint may delete, modify, or trigger retention/maintenance, or change configuration.
- Allowed side effects of HTTP requests are limited to server-side, disposable caching (e.g.
  pre-caching video for playback) that never touches the share.
- Status endpoints (e.g. `/api/maintenance/status`) MUST be read-only reports; they MUST NOT be
  able to start, stop, or influence a maintenance run.
- Secrets (SMB credentials, deploy keys) MUST live only in gitignored `.env` / `.env.deploy` files
  or the deploy host, MUST NOT be committed, and MUST NOT be sent to the browser.

Rationale: without auth, any mutating endpoint is an unauthenticated remote delete.

### IV. Playback Performance Is a Requirement

- The camera grid MUST load within 0.5 s on a LAN for 1–16 cameras.
- Playback MUST start immediately after a timeline selection; video for the chosen camera+date
  MUST be pre-cached server-side on Playback entry.
- Timeline scrubbing MUST land within ±2 s of the selected position; gaps MUST render as
  grey/empty segments.
- Video endpoints MUST honour HTTP `Range` requests so the browser seeks without downloading whole
  files.
- Supported playback speeds are 0.5×, 1×, 2×, 4×, 8×.

Rationale: the product exists because NVR software is slow; these targets are acceptance criteria
in `specs/000-baseline/spec.md` (AC-5), and a feature that regresses them is not done.

### V. Degrade Gracefully, Never Crash

- Inputs from the share (SQLite files, `recording.xml`, block XML, `status.json` heartbeats,
  `maintenance-status.json`) are untrusted and MUST be validated at the boundary.
- Missing or malformed data MUST be logged with `console.warn`/`console.error` and treated as
  absent (empty list, `null`, placeholder) — it MUST NOT crash the process or fail unrelated cameras.
- Maintenance MUST isolate per-camera failures: one camera's error is recorded in the run summary
  and the run continues with the next camera.
- Maintenance MUST refuse to run when `RETENTION_DAYS` is unset or `0`; there is no implicit
  "delete everything" default, and `--dry-run` MUST remain available and side-effect free.

Rationale: one bad file on a NAS must never take down viewing of every other camera.

### VI. Minimal, Native Dependencies

- Prefer platform built-ins: `node:sqlite` for SQLite, the native HTML5 `<video>` element for
  playback, OS-level SMB mounting (`net use`) for share access.
- Native-compiled modules (e.g. `better-sqlite3`) and SMB client libraries (e.g. `smb2`) MUST NOT
  be added; new runtime dependencies MUST be justified in the feature plan.
- Use JavaScript ES modules and `async/await` throughout; no raw callback APIs.

Rationale: the dev machine has no native build toolchain and the deploy target is a NAS; fewer
dependencies means fewer breakages and a smaller image.

## Technology & Deployment Constraints

- Stack: Node.js 22 + Express backend, React (Vite) SPA frontend, npm workspaces (`server`,
  `client`). Video is H.264 in MKV, served as-is.
- Deployment: self-hosted on a Synology NAS on the LAN via Docker Compose, over HTTP, with no cloud
  dependency at runtime. Images are built by CI and pulled from GHCR by `deploy.ps1`.
- `cctv-ui` and `cctv-maintenance` MUST run from the same image so the
  `rebuildIndex.js` ↔ `dbService.js` schema contract cannot skew between versions.
- Maintenance scheduling lives inside its container (hourly loop, `restart: unless-stopped`);
  it MUST NOT depend on host schedulers that cannot be managed from `deploy.ps1`.
- Configuration comes from environment variables (`.env` locally, `docker-compose.yml` in
  production); paths and credentials MUST NOT be hardcoded.

## Development Workflow & Quality Gates

- Features follow the Spec Kit flow: `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan`
  → `/speckit-tasks` → `/speckit-implement`. Each plan MUST include a Constitution Check against
  Principles I–VI and justify any exception in its Complexity Tracking section.
- `npm test` (Vitest, server and client) and `npm run build` MUST pass; CI enforces both on every
  push. New behaviour in services, routes, and maintenance logic MUST ship with tests.
- Any change touching `server/maintenance/`, camera discovery, or the index schema MUST include
  tests covering: unmanaged cameras untouched, internal directories excluded, and dry-run writing
  nothing.
- Acceptance criteria (`specs/000-baseline/spec.md` for baseline areas, the feature's own
  `specs/NNN-*/spec.md` otherwise) and `CLAUDE.md` MUST be updated in the same change when a feature
  alters user-visible behaviour or architecture; `PRD.md` when it changes a use case or scope.
- Version numbers are managed by CI (patch auto-bumped on each `master` build); do not bump by hand.

## Governance

- This constitution supersedes conflicting guidance in other project documents; `CLAUDE.md` is the
  runtime development guide and MUST stay consistent with it.
- Amendments are made via `/speckit-constitution`, committed with a message describing the change,
  and MUST update dependent docs (`CLAUDE.md`, `PRD.md`, `specs/`) in the same commit when they conflict.
- Versioning: MAJOR for removing or redefining a principle, MINOR for adding a principle/section or
  materially expanding guidance, PATCH for clarifications and wording.
- Compliance: every feature plan and review MUST check Principles I–VI; any violation MUST be
  documented and justified, or the change is rejected.

**Version**: 1.0.1 | **Ratified**: 2026-10-19 | **Last Amended**: 2026-10-23
