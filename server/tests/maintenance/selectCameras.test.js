import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { cameraPath, dbPath } from '../../services/storageService.js';
import { selectManagedCameras } from '../../maintenance/selectCameras.js';

let tmpCams = [];

async function makeCamera(hasNativeIndexDb) {
  const id = `tmp-select-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.mkdir(cameraPath(id), { recursive: true });
  if (hasNativeIndexDb) {
    await fs.writeFile(dbPath(id), '');
  }
  tmpCams.push(id);
  return { id, name: id };
}

afterEach(async () => {
  await Promise.all(tmpCams.map(id => fs.rm(cameraPath(id), { recursive: true, force: true })));
  tmpCams = [];
});

describe('selectManagedCameras', () => {
  it('manages a camera with no native index.db', async () => {
    const cam = await makeCamera(false);
    expect(await selectManagedCameras([cam])).toEqual([cam]);
  });

  it('leaves a camera with a native index.db unmanaged', async () => {
    const cam = await makeCamera(true);
    expect(await selectManagedCameras([cam])).toEqual([]);
  });

  it('filters a mixed list down to only the cameras without a native index.db', async () => {
    const withDb = await makeCamera(true);
    const withoutDb = await makeCamera(false);
    expect(await selectManagedCameras([withDb, withoutDb])).toEqual([withoutDb]);
  });

  it('returns nothing for an empty camera list', async () => {
    expect(await selectManagedCameras([])).toEqual([]);
  });
});
