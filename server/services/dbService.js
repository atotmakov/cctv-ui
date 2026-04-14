/**
 * SQLite reader using Node.js built-in `node:sqlite` (Node >= 22.5).
 * Requires --experimental-sqlite flag.
 *
 * All methods return null if the DB is unavailable or the schema is
 * unrecognised — callers fall back to XML directory scanning.
 */

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.warn('[dbService] node:sqlite unavailable; SQLite reads disabled');
}

import { dbPath } from './storageService.js';

const openDbs = new Map();

function openDb(cameraId) {
  if (!DatabaseSync) return null;
  if (openDbs.has(cameraId)) return openDbs.get(cameraId);
  try {
    const db = new DatabaseSync(dbPath(cameraId), { readOnly: true });
    openDbs.set(cameraId, db);
    return db;
  } catch (err) {
    console.warn(`[dbService] Cannot open DB for ${cameraId}: ${err.message}`);
    return null;
  }
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

function discoverSchema(db) {
  for (const tbl of tables(db)) {
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
