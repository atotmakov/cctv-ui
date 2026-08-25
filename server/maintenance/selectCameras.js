import { promises as fs } from 'fs';
import { dbPath } from '../services/storageService.js';

/**
 * A camera is managed automatically whenever its folder has no native
 * index.db — presence of one is taken to mean the camera (or whatever
 * writes for it) already owns retention/indexing there, so it's left
 * completely alone. Re-evaluated on every run; there is no declared
 * allowlist to fall out of sync.
 */
export async function selectManagedCameras(cameras) {
  const managed = [];
  for (const camera of cameras) {
    if (!(await hasNativeIndexDb(camera.id))) {
      managed.push(camera);
    }
  }
  return managed;
}

async function hasNativeIndexDb(cameraId) {
  try {
    await fs.access(dbPath(cameraId));
    return true;
  } catch {
    return false;
  }
}
