import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { cameraPath } from '../../services/storageService.js';
import { pruneOldRecordings } from '../../maintenance/retention.js';

let tmpCam;

async function makeTmpCamera(dates) {
  tmpCam = `tmp-retention-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const base = cameraPath(tmpCam);
  await fs.mkdir(base, { recursive: true });
  for (const date of dates) {
    await fs.mkdir(path.join(base, date), { recursive: true });
  }
  return tmpCam;
}

afterEach(async () => {
  if (tmpCam) {
    await fs.rm(cameraPath(tmpCam), { recursive: true, force: true });
    tmpCam = undefined;
  }
});

describe('pruneOldRecordings', () => {
  it('dry-run reports what would be removed but changes nothing on disk', async () => {
    const cam = await makeTmpCamera(['20200101', '20990101']);
    const removed = await pruneOldRecordings(cam, '20250101', { dryRun: true });
    expect(removed).toEqual(['20200101']);

    const remaining = await fs.readdir(cameraPath(cam));
    expect(remaining.sort()).toEqual(['20200101', '20990101']);
  });

  it('removes only date-folders strictly older than the cutoff', async () => {
    const cam = await makeTmpCamera(['20200101', '20250101', '20990101']);
    const removed = await pruneOldRecordings(cam, '20250101', { dryRun: false });
    expect(removed).toEqual(['20200101']);

    const remaining = await fs.readdir(cameraPath(cam));
    expect(remaining.sort()).toEqual(['20250101', '20990101']);
  });

  it('removes nothing when every date is newer than the cutoff', async () => {
    const cam = await makeTmpCamera(['20990101', '20990102']);
    const removed = await pruneOldRecordings(cam, '20250101', { dryRun: false });
    expect(removed).toEqual([]);

    const remaining = await fs.readdir(cameraPath(cam));
    expect(remaining.sort()).toEqual(['20990101', '20990102']);
  });
});
