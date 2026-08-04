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

import config from '../config.js';
import { authenticateSmb } from '../services/smbAuth.js';
import { listCameras } from '../services/storageService.js';
import { pruneOldRecordings } from './retention.js';
import { rebuildIndexDb } from './rebuildIndex.js';
import { selectManagedCameras, findUnmatchedCameraIds } from './selectCameras.js';

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

  if (config.maintenanceCameras.length === 0) {
    console.log(
      '[maintenance] MAINTENANCE_CAMERAS is empty — nothing to do. ' +
      'Set it to a comma-separated list of camera IDs to manage.'
    );
    return;
  }

  authenticateSmb();

  const cutoffDateStr = cutoffDateString(config.retentionDays);
  console.log(
    `[maintenance] retention window: ${config.retentionDays} day(s), cutoff: ${cutoffDateStr}` +
    (dryRun ? ' (dry-run)' : '')
  );

  const allCameras = await listCameras();
  const cameras = selectManagedCameras(allCameras, config.maintenanceCameras);
  for (const id of findUnmatchedCameraIds(allCameras, config.maintenanceCameras)) {
    console.warn(`[maintenance] Configured camera "${id}" not found under storage path — check MAINTENANCE_CAMERAS for typos`);
  }

  console.log(`[maintenance] managing ${cameras.length}/${allCameras.length} camera(s): ${cameras.map(c => c.id).join(', ') || '(none)'}`);

  let totalRemoved = 0;
  let totalRows = 0;

  for (const camera of cameras) {
    try {
      const removed = await pruneOldRecordings(camera.id, cutoffDateStr, { dryRun });
      const rows = await rebuildIndexDb(camera.id, { dryRun });
      totalRemoved += removed.length;
      totalRows += rows;
    } catch (err) {
      console.error(`[maintenance] Failed processing ${camera.id}:`, err);
    }
  }

  console.log(
    `[maintenance] done. cameras: ${cameras.length}, ` +
    `date-folders removed: ${totalRemoved}, index rows written: ${totalRows}`
  );
}

main();
