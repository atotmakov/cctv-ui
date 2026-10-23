# Feature Specification: Maintenance Service (Retention and Indexing)

**Status**: Implemented (as built; living spec)

**Created**: 2026-10-24 — moved from `PRD.md` (use cases §4, acceptance criteria §7); built before Spec Kit

## Conventions

- **AC IDs are stable** and unique across all specs; tests cite them (e.g. `// ── AC-2: …`). Never renumber;
  add new criteria at the end of a section. `[x]` = implemented and verified, `[ ]` = open (with a note).
- A change to this area's behaviour updates this spec in the same change (constitution, Quality Gates).

## Use cases

### UC-5 — Automatic retention & index maintenance

For any camera that has no other system already managing it (detected by the absence of a native `index.db` in its folder), an out-of-band process keeps its recordings within a configured retention window and keeps them browsable: each run it deletes date-folders older than `RETENTION_DAYS`, then rebuilds a search index from a fresh filesystem/XML scan of whatever remains. A camera with its own native `index.db` is presumed to already have a live writer managing its retention/indexing, so it is left completely untouched — nothing is deleted, nothing is written. This process runs independently of the viewer app, is not reachable over HTTP, and is the only part of the system permitted to write to or delete from the share.

## Acceptance criteria

### AC-7 — Maintenance service (retention + indexing)
- [x] For each camera with no native `index.db`, date-folders older than `RETENTION_DAYS` are deleted.
- [x] For each managed camera, an index is rebuilt from a fresh filesystem/XML scan into `index_[managed].db` after retention runs, so the viewer can still browse what's left.
- [x] A camera with a native `index.db` is never modified — no files deleted, no index written.
- [x] Synology filesystem-internal directories (`@eaDir`, `#recycle`, etc.) are never treated as cameras.
- [x] The viewer's read path prefers a camera's native `index.db` over `index_[managed].db` whenever both exist.
- [x] The maintenance process is not reachable via the HTTP API — it cannot be triggered remotely.
- [x] `RETENTION_DAYS` unset or `0` makes the process refuse to run, rather than defaulting to deleting everything.

## Related

- Operational details (scheduling, Docker service, known gaps): `CLAUDE.md` → "Maintenance Service".
- Its results are shown by [007-maintenance-status-page](../007-maintenance-status-page/spec.md).
