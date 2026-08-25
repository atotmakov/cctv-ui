/**
 * CLI entrypoint for the retention + index.db maintenance job.
 * Separate process from the read-only viewer app (server/index.js) — this
 * is the only part of the codebase allowed to write/delete on the share.
 *
 * Usage:
 *   node --experimental-sqlite maintenance/run.js [--dry-run]
 *
 * Intended to be invoked on a schedule (e.g. Windows Task Scheduler) and/or
 * run manually. RETENTION_DAYS must be set in .env or the run is refused.
 */

import { promises as fs } from 'fs';
import config from '../config.js';
import { authenticateSmb } from '../services/smbAuth.js';
import { listCameras, maintenanceStatusPath } from '../services/storageService.js';
import { pruneOldRecordings } from './retention.js';
import { rebuildIndexDb } from './rebuildIndex.js';
import { selectManagedCameras } from './selectCameras.js';

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

function cutoffDateString(retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const y = cutoff.getFullYear();
  const m = String(cutoff.getMonth() + 1).padStart(2, '0');
  const d = String(cutoff.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function main() {
  if (!config.retentionDays || config.retentionDays <= 0) {
    console.error(
      '[maintenance] RETENTION_DAYS is unset or invalid — refusing to run. ' +
      'Set RETENTION_DAYS in .env to enable the maintenance job.'
    );
    process.exitCode = 1;
    return;
  }

  authenticateSmb();

  const cutoffDateStr = cutoffDateString(config.retentionDays);
  console.log(
    `[maintenance] retention window: ${config.retentionDays} day(s), cutoff: ${cutoffDateStr}` +
    (dryRun ? ' (dry-run)' : '')
  );

  const allCameras = await listCameras();
  const cameras = await selectManagedCameras(allCameras);

  console.log(`[maintenance] managing ${cameras.length}/${allCameras.length} camera(s) (no native index.db found): ${cameras.map(c => c.id).join(', ') || '(none)'}`);

  let totalRemoved = 0;
  let totalRows = 0;
  const cameraResults = [];

  for (const camera of cameras) {
    try {
      const removed = await pruneOldRecordings(camera.id, cutoffDateStr, { dryRun });
      const rows = await rebuildIndexDb(camera.id, { dryRun });
      totalRemoved += removed.length;
      totalRows += rows;
      cameraResults.push({ id: camera.id, dateFoldersRemoved: removed.length, indexRowsWritten: rows, error: null });
    } catch (err) {
      console.error(`[maintenance] Failed processing ${camera.id}:`, err);
      cameraResults.push({ id: camera.id, dateFoldersRemoved: 0, indexRowsWritten: 0, error: err.message });
    }
  }

  console.log(
    `[maintenance] done. cameras: ${cameras.length}, ` +
    `date-folders removed: ${totalRemoved}, index rows written: ${totalRows}`
  );

  if (!dryRun) {
    await writeStatus({
      lastRunAt: new Date().toISOString(),
      retentionDays: config.retentionDays,
      cutoffDate: cutoffDateStr,
      camerasManaged: cameras.length,
      camerasTotal: allCameras.length,
      totalDateFoldersRemoved: totalRemoved,
      totalIndexRowsWritten: totalRows,
      cameras: cameraResults,
    });
  }
}

// Best-effort — a failure here must never fail the actual maintenance work
// that already happened above.
async function writeStatus(status) {
  try {
    await fs.writeFile(maintenanceStatusPath(), JSON.stringify(status, null, 2));
  } catch (err) {
    console.warn('[maintenance] Failed to write status file:', err.message);
  }
}

main();
