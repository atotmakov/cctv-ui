import { promises as fs } from 'fs';
import path from 'path';
import { cameraPath, listDates } from '../services/storageService.js';

/**
 * Deletes every YYYYMMDD date-folder for a camera older than cutoffDateStr
 * (plain string comparison — folder names are always YYYYMMDD, and
 * day-granularity is sufficient for a retention window).
 *
 * Returns the list of dates removed (or that would be removed, in dry-run).
 */
export async function pruneOldRecordings(cameraId, cutoffDateStr, { dryRun = false } = {}) {
  const dates = await listDates(cameraId);
  const toRemove = dates.filter(d => d < cutoffDateStr);

  for (const date of toRemove) {
    const datePath = path.join(cameraPath(cameraId), date);
    if (dryRun) {
      console.log(`[retention] (dry-run) would remove ${cameraId}/${date}`);
      continue;
    }
    await fs.rm(datePath, { recursive: true, force: true });
    console.log(`[retention] removed ${cameraId}/${date}`);
  }

  return toRemove;
}
