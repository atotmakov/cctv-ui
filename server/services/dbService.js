/**
 * SQLite reader using Node.js built-in `node:sqlite` (Node >= 22.5).
 * Requires --experimental-sqlite flag.
 *
 * All methods return null if the DB is unavailable or the schema is
 * unrecognised — callers fall back to XML directory scanning.
 */

// process.getBuiltinModule rather than import(): Vite (used by the tests)
// strips the `node:` prefix and then can't resolve the prefix-only `sqlite`
// builtin, which silently disabled every SQLite read under test.
let DatabaseSync;
try {
  ({ DatabaseSync } = process.getBuiltinModule('node:sqlite'));
} catch {
  console.warn('[dbService] node:sqlite unavailable; SQLite reads disabled');
}

import { existsSync } from 'fs';
import { dbPath, managedDbPath } from './storageService.js';

const openDbs = new Map();

// A camera's own native index.db always wins when present; only fall back
// to the maintenance job's index_[managed].db when there's no native file
// (see maintenance/selectCameras.js — the two are never meant to coexist,
// but if they somehow do, the native file is authoritative).
function resolveDbPath(cameraId) {
  const native = dbPath(cameraId);
  if (existsSync(native)) return native;
  const managed = managedDbPath(cameraId);
  if (existsSync(managed)) return managed;
  return null;
}

function openDb(cameraId) {
  if (!DatabaseSync) return null;
  if (openDbs.has(cameraId)) return openDbs.get(cameraId);
  const path = resolveDbPath(cameraId);
  if (!path) return null;
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    openDbs.set(cameraId, db);
    return db;
  } catch (err) {
    console.warn(`[dbService] Cannot open DB for ${cameraId}: ${err.message}`);
    return null;
  }
}

// Drops a cached connection. Only tests need this: Windows won't delete a
// temp camera's db file while a connection to it is still open.
export function closeDb(cameraId) {
  const db = openDbs.get(cameraId);
  if (!db) return;
  openDbs.delete(cameraId);
  try { db.close(); } catch { /* already closed */ }
}

function tables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map(r => r.name);
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map(r => r.name);
}

function pickCol(cols, ...patterns) {
  for (const pat of patterns) {
    const found = cols.find(c => new RegExp(pat, 'i').test(c));
    if (found) return found;
  }
  return null;
}

const MAINTENANCE_TABLE = 'cctv_maintenance_index';

function discoverSchema(db) {
  const allTables = tables(db);

  // Prefer our own maintenance-owned table when present (see
  // maintenance/rebuildIndex.js): it's regenerated from the current
  // filesystem state on every run, whereas a camera's own native table (if
  // this camera also has one) can go stale for any recording the
  // maintenance job has since pruned — we deliberately never touch a
  // camera's native schema, so nothing else keeps it in sync after that.
  if (allTables.includes(MAINTENANCE_TABLE)) {
    return { table: MAINTENANCE_TABLE, cols: columns(db, MAINTENANCE_TABLE) };
  }

  for (const tbl of allTables) {
    const cols = columns(db, tbl);
    if (cols.some(c => /start/i.test(c))) return { table: tbl, cols };
  }
  return null;
}

export function getRecordingsForDate(cameraId, date) {
  const db = openDb(cameraId);
  if (!db) return null;
  try {
    const schema = discoverSchema(db);
    if (!schema) return null;
    const { table, cols } = schema;

    const startCol = pickCol(cols, 'starttime', 'start_time', '^start$');
    if (!startCol) return null;
    const stopCol  = pickCol(cols, 'stoptime', 'stop_time', 'endtime', '^stop$', '^end$');
    const tokenCol = pickCol(cols, 'recordingtoken', 'token', '^id$');

    const prefix = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const rows = db
      .prepare(`SELECT * FROM "${table}" WHERE "${startCol}" LIKE ?`)
      .all(`${prefix}%`);

    return rows.map(r => ({
      token:      tokenCol ? r[tokenCol] : null,
      startTime:  r[startCol] ?? null,
      stopTime:   stopCol ? r[stopCol] : null,
      videoRelPath: null,
    }));
  } catch (err) {
    console.warn(`[dbService] Query failed for ${cameraId}: ${err.message}`);
    return null;
  }
}

export function getAvailableDates(cameraId) {
  const db = openDb(cameraId);
  if (!db) return null;
  try {
    const schema = discoverSchema(db);
    if (!schema) return null;
    const { table, cols } = schema;

    const startCol = pickCol(cols, 'starttime', 'start_time', '^start$');
    if (!startCol) return null;

    return db
      .prepare(`SELECT DISTINCT substr("${startCol}", 1, 10) AS d FROM "${table}" ORDER BY d`)
      .all()
      .map(r => r.d.replace(/-/g, ''));
  } catch (err) {
    console.warn(`[dbService] getAvailableDates failed for ${cameraId}: ${err.message}`);
    return null;
  }
}

// Start/stop times of every recording that started at or after `sinceIso`
// (ISO-8601 UTC, compared as text — both schemas store ISO UTC strings),
// plus the earliest start in the whole index so callers can tell which days
// are fully covered. Used by healthService.
export function getRecordingHistory(cameraId, sinceIso) {
  const db = openDb(cameraId);
  if (!db) return null;
  try {
    const schema = discoverSchema(db);
    if (!schema) return null;
    const { table, cols } = schema;

    const startCol = pickCol(cols, 'starttime', 'start_time', '^start$');
    if (!startCol) return null;
    const stopCol = pickCol(cols, 'stoptime', 'stop_time', 'endtime', '^stop$', '^end$');

    const { earliest } = db
      .prepare(`SELECT min("${startCol}") AS earliest FROM "${table}"`)
      .get();
    const stopExpr = stopCol ? `"${stopCol}"` : 'NULL';
    const recordings = db
      .prepare(`SELECT "${startCol}" AS s, ${stopExpr} AS e FROM "${table}" WHERE "${startCol}" >= ? ORDER BY "${startCol}"`)
      .all(sinceIso)
      .map(r => ({ startTime: r.s ?? null, stopTime: r.e ?? null }));

    return { earliestStart: earliest ?? null, recordings };
  } catch (err) {
    console.warn(`[dbService] getRecordingHistory failed for ${cameraId}: ${err.message}`);
    return null;
  }
}
