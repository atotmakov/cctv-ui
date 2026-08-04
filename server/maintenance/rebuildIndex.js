/**
 * Rebuilds a camera's index.db from the authoritative XML/filesystem scan.
 * Writes are done in place inside a single transaction (not a temp-file +
 * rename swap) so an already-open reader connection (server/services/
 * dbService.js caches one DatabaseSync handle per camera indefinitely) sees
 * freshly committed rows on its next query, without the file identity ever
 * changing — renaming over a file another process has open is unreliable on
 * Windows, which is this project's deploy target.
 */

import { dbPath, listDates } from '../services/storageService.js';
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

  const db = new DatabaseSync(dbPath(cameraId));
  try {
    // Table name is deliberately namespaced: some cameras ship their own
    // native index.db with a real `recordings` table (FK-linked to `blocks`
    // etc.) — reusing that name corrupts the camera's own schema. This
    // table is exclusively ours, so it's safe to fully replace every run.
    db.exec('CREATE TABLE IF NOT EXISTS cctv_maintenance_index (RecordingToken TEXT PRIMARY KEY, StartTime TEXT, StopTime TEXT)');
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM cctv_maintenance_index');
      const insert = db.prepare(
        'INSERT OR REPLACE INTO cctv_maintenance_index (RecordingToken, StartTime, StopTime) VALUES (?, ?, ?)'
      );
      for (const rec of recordings) {
        insert.run(rec.token, rec.startTime, rec.stopTime);
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
