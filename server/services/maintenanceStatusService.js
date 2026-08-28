/**
 * Read-only status for the Maintenance Status page. Two independent sources:
 *  - readMaintenanceRunStatus(): the JSON summary maintenance/run.js writes
 *    after each real run (null if it has never run, or hasn't yet on fresh
 *    storage).
 *  - getCameraStatuses(): live, computed fresh on every call from the
 *    filesystem — same detection maintenance/selectCameras.js uses — so it
 *    reflects current reality even if it has drifted from the last run.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { dbPath, managedDbPath, maintenanceStatusPath, heartbeatPath, listCameras, listDates } from './storageService.js';

export async function readMaintenanceRunStatus() {
  try {
    const raw = await fs.readFile(maintenanceStatusPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Not written by this codebase — see storageService.heartbeatPath. Malformed
// or missing files are just "no heartbeat" (null), same as every other
// external-file read in this service: a camera not running that ACAP app is
// the overwhelmingly common case, not an error.
async function readCameraHeartbeat(cameraId) {
  try {
    const raw = await fs.readFile(heartbeatPath(cameraId), 'utf-8');
    const json = JSON.parse(raw);
    return {
      appVersion: json.app_version ?? null,
      timestamp: json.timestamp ?? null,
      uptimeSeconds: json.uptime_seconds ?? null,
      trackedFiles: json.tracked_files ?? null,
      lastSyncPass: json.last_sync_pass ?? null,
    };
  } catch {
    return null;
  }
}

export async function getCameraStatuses() {
  const cameras = await listCameras();
  return Promise.all(cameras.map(async (camera) => {
    const hasNative = existsSync(dbPath(camera.id));
    const hasManaged = existsSync(managedDbPath(camera.id));

    let dates = [];
    try {
      dates = await listDates(camera.id);
    } catch {
      dates = [];
    }

    return {
      id: camera.id,
      managed: !hasNative,
      activeDbFile: hasNative ? 'index.db' : hasManaged ? 'index_[managed].db' : null,
      dateFolderCount: dates.length,
      oldestDate: dates[0] ?? null,
      newestDate: dates[dates.length - 1] ?? null,
      heartbeat: await readCameraHeartbeat(camera.id),
    };
  }));
}
