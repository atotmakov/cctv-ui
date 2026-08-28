import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { cameraPath, dbPath, managedDbPath, maintenanceStatusPath, heartbeatPath } from '../services/storageService.js';
import { readMaintenanceRunStatus, getCameraStatuses } from '../services/maintenanceStatusService.js';

const CAM = 'test-cam';

let tmpCams = [];
let wroteStatusFile = false;

async function makeCamera({ nativeDb = false, managedDb = false, heartbeat = null } = {}) {
  const id = `tmp-status-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.mkdir(cameraPath(id), { recursive: true });
  if (nativeDb) await fs.writeFile(dbPath(id), '');
  if (managedDb) await fs.writeFile(managedDbPath(id), '');
  if (heartbeat !== null) await fs.writeFile(heartbeatPath(id), heartbeat);
  tmpCams.push(id);
  return id;
}

afterEach(async () => {
  await Promise.all(tmpCams.map(id => fs.rm(cameraPath(id), { recursive: true, force: true })));
  tmpCams = [];
  if (wroteStatusFile) {
    await fs.rm(maintenanceStatusPath(), { force: true });
    wroteStatusFile = false;
  }
});

describe('getCameraStatuses', () => {
  it('reports the fixture camera as unmanaged with its native index.db active', async () => {
    const statuses = await getCameraStatuses();
    const cam = statuses.find(c => c.id === CAM);
    expect(cam).toBeDefined();
    expect(cam.managed).toBe(false);
    expect(cam.activeDbFile).toBe('index.db');
    expect(cam.dateFolderCount).toBeGreaterThanOrEqual(2);
    expect(cam.oldestDate).toBe('20260406');
    expect(cam.newestDate).toBe('20260407');
  });

  it('reports a camera with no index.db at all as managed with no active db file', async () => {
    const id = await makeCamera();
    const statuses = await getCameraStatuses();
    const cam = statuses.find(c => c.id === id);
    expect(cam.managed).toBe(true);
    expect(cam.activeDbFile).toBeNull();
    expect(cam.dateFolderCount).toBe(0);
  });

  it('reports a camera with only index_[managed].db as managed with that file active', async () => {
    const id = await makeCamera({ managedDb: true });
    const statuses = await getCameraStatuses();
    const cam = statuses.find(c => c.id === id);
    expect(cam.managed).toBe(true);
    expect(cam.activeDbFile).toBe('index_[managed].db');
  });

  it('reports heartbeat as null for a camera with no status.json (the common case)', async () => {
    const id = await makeCamera();
    const statuses = await getCameraStatuses();
    expect(statuses.find(c => c.id === id).heartbeat).toBeNull();
  });

  it('parses a real acap-sd-s3-sync status.json into camelCase fields', async () => {
    const raw = JSON.stringify({
      prefix: 'test-cam/',
      app_version: '0.9.5',
      timestamp: '2026-08-28T18:17:10Z',
      uptime_seconds: 79571,
      last_sync_pass: { time: '2026-08-28T18:16:12Z', uploaded: 3, skipped: 4749, failed: 0 },
      tracked_files: 4753,
    });
    const id = await makeCamera({ heartbeat: raw });
    const statuses = await getCameraStatuses();
    const hb = statuses.find(c => c.id === id).heartbeat;
    expect(hb).toEqual({
      appVersion: '0.9.5',
      timestamp: '2026-08-28T18:17:10Z',
      uptimeSeconds: 79571,
      trackedFiles: 4753,
      lastSyncPass: { time: '2026-08-28T18:16:12Z', uploaded: 3, skipped: 4749, failed: 0 },
    });
  });

  it('reports heartbeat as null for malformed status.json rather than crashing', async () => {
    const id = await makeCamera({ heartbeat: '{not valid json' });
    const statuses = await getCameraStatuses();
    expect(statuses.find(c => c.id === id).heartbeat).toBeNull();
  });
});

describe('readMaintenanceRunStatus', () => {
  it('returns null when no status file has ever been written', async () => {
    expect(await readMaintenanceRunStatus()).toBeNull();
  });

  it('returns the parsed contents when a status file exists', async () => {
    const payload = { lastRunAt: '2026-08-26T00:00:00.000Z', camerasManaged: 1 };
    await fs.writeFile(maintenanceStatusPath(), JSON.stringify(payload));
    wroteStatusFile = true;

    expect(await readMaintenanceRunStatus()).toEqual(payload);
  });
});
