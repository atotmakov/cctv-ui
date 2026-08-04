import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { cameraPath, dbPath } from '../../services/storageService.js';
import { getAvailableDates, getRecordingsForDate } from '../../services/dbService.js';
import { rebuildIndexDb } from '../../maintenance/rebuildIndex.js';

const SRC_CAM = 'test-cam';

let hasSqlite = false;
try {
  const m = await import('node:sqlite');
  hasSqlite = !!m.DatabaseSync;
} catch { /* flag not present */ }

let tmpCam;

// Copies the committed test-cam fixture (2 real dates with recording.xml +
// .mkv files) into a fresh camera dir, then removes the copied index.db so
// each test starts from the "camera directory has no index.db at all" state
// this feature was built to handle.
async function makeTmpCameraFromFixture() {
  tmpCam = `tmp-rebuild-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.cp(cameraPath(SRC_CAM), cameraPath(tmpCam), { recursive: true });
  await fs.rm(dbPath(tmpCam), { force: true });
  return tmpCam;
}

afterEach(async () => {
  if (tmpCam) {
    await fs.rm(cameraPath(tmpCam), { recursive: true, force: true });
    tmpCam = undefined;
  }
});

describe('rebuildIndexDb', () => {
  it('dry-run reports the row count but does not create index.db', async () => {
    const cam = await makeTmpCameraFromFixture();
    const count = await rebuildIndexDb(cam, { dryRun: true });
    expect(count).toBe(2);
    await expect(fs.access(dbPath(cam))).rejects.toThrow();
  });

  describe.skipIf(!hasSqlite)('with node:sqlite available', () => {
    it('creates index.db readable by dbService, matching the XML scan', async () => {
      const cam = await makeTmpCameraFromFixture();
      const count = await rebuildIndexDb(cam, { dryRun: false });
      expect(count).toBe(2);

      const dates = getAvailableDates(cam);
      expect(dates).not.toBeNull();
      expect([...dates].sort()).toEqual(['20260406', '20260407']);

      expect(getRecordingsForDate(cam, '20260406')).toHaveLength(1);
      expect(getRecordingsForDate(cam, '20260407')).toHaveLength(1);
    });

    it('reflects a folder removed since the last rebuild — proves it overwrites rather than merges stale rows', async () => {
      const cam = await makeTmpCameraFromFixture();
      await rebuildIndexDb(cam, { dryRun: false });
      expect([...getAvailableDates(cam)].sort()).toEqual(['20260406', '20260407']);

      // Simulate retention having pruned an old date-folder, then rebuild.
      await fs.rm(path.join(cameraPath(cam), '20260406'), { recursive: true, force: true });
      await rebuildIndexDb(cam, { dryRun: false });

      // Re-read through the same cached dbService connection used above —
      // this is what proves an in-place transactional write is visible to
      // an already-open reader without needing to reopen the DB file.
      expect(getAvailableDates(cam)).toEqual(['20260407']);
      expect(getRecordingsForDate(cam, '20260406')).toHaveLength(0);
    });
  });
});
