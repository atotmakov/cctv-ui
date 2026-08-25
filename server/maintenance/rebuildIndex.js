/**
 * Rebuilds a managed camera's index_[managed].db from the authoritative
 * XML/filesystem scan. Writes are done in place inside a single transaction
 * (not a temp-file + rename swap) so an already-open reader connection
 * (server/services/dbService.js caches one DatabaseSync handle per camera
 * indefinitely) sees freshly committed rows on its next query, without the
 * file identity ever changing — renaming over a file another process has
 * open is unreliable on Windows, which is this project's deploy target.
 */

import { managedDbPath, listDates } from '../services/storageService.js';
import { scanRecordingsForDate } from '../services/xmlService.js';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.warn('[rebuildIndex] node:sqlite unavailable; cannot rebuild index.db');
}

export async function rebuildIndexDb(cameraId, { dryRun = false } = {}) {
  const dates = await listDates(cameraId);
  const recordings = [];
  for (const date of dates) {
    recordings.push(...await scanRecordingsForDate(cameraId, date));
  }

  if (dryRun) {
    console.log(`[rebuildIndex] (dry-run) would write ${recordings.length} row(s) for ${cameraId}`);
    return recordings.length;
  }

  if (!DatabaseSync) {
    console.warn(`[rebuildIndex] Skipping ${cameraId}: node:sqlite unavailable`);
    return 0;
  }

  const db = new DatabaseSync(managedDbPath(cameraId));
  try {
    // A camera only ever reaches here when it has no native index.db (see
    // maintenance/selectCameras.js), and this file is a separate path from
    // that one — so there's never a native schema to collide with.
    db.exec('CREATE TABLE IF NOT EXISTS cctv_maintenance_index (RecordingToken TEXT PRIMARY KEY, StartTime TEXT, StopTime TEXT)');
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM cctv_maintenance_index');
      const insert = db.prepare(
        'INSERT OR REPLACE INTO cctv_maintenance_index (RecordingToken, StartTime, StopTime) VALUES (?, ?, ?)'
      );
      for (const rec of recordings) {
        // A recording still in progress has no <StopTime> yet, so
        // rec.stopTime is undefined — node:sqlite only accepts null (not
        // undefined) for an absent bind value.
        insert.run(rec.token, rec.startTime, rec.stopTime ?? null);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.close();
  }

  console.log(`[rebuildIndex] wrote ${recordings.length} row(s) for ${cameraId}`);
  return recordings.length;
}
