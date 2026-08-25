import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
import { listCameras, listDates, findVideoRelPath, cameraPath, dbPath } from '../services/storageService.js';

const CAM = 'test-cam';

// ── AC-1: listCameras ─────────────────────────────────────────────────────────
describe('listCameras (AC-1)', () => {
  it('returns at least one camera from fixture storage', async () => {
    const cameras = await listCameras();
    expect(cameras.length).toBeGreaterThanOrEqual(1);
  });

  it('includes the fixture camera with correct id and name', async () => {
    const cameras = await listCameras();
    const cam = cameras.find(c => c.id === CAM);
    expect(cam).toBeDefined();
    expect(cam.name).toBe(CAM);
  });

  describe('filters out Synology filesystem-internal directories', () => {
    let reservedDirs = [];

    afterEach(async () => {
      await Promise.all(reservedDirs.map(name =>
        fs.rm(path.join(config.storagePath, name), { recursive: true, force: true })
      ));
      reservedDirs = [];
    });

    it('excludes @eaDir', async () => {
      reservedDirs.push('@eaDir');
      await fs.mkdir(path.join(config.storagePath, '@eaDir'), { recursive: true });
      const cameras = await listCameras();
      expect(cameras.find(c => c.id === '@eaDir')).toBeUndefined();
    });

    it('excludes #recycle', async () => {
      reservedDirs.push('#recycle');
      await fs.mkdir(path.join(config.storagePath, '#recycle'), { recursive: true });
      const cameras = await listCameras();
      expect(cameras.find(c => c.id === '#recycle')).toBeUndefined();
    });
  });
});

// ── AC-3: listDates ───────────────────────────────────────────────────────────
describe('listDates (AC-3)', () => {
  it('returns dates in YYYYMMDD format', async () => {
    const dates = await listDates(CAM);
    expect(dates.length).toBeGreaterThanOrEqual(2);
    dates.forEach(d => expect(d).toMatch(/^\d{8}$/));
  });

  it('returns sorted dates containing 20260406 and 20260407', async () => {
    const dates = await listDates(CAM);
    expect(dates).toContain('20260406');
    expect(dates).toContain('20260407');
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1] <= dates[i]).toBe(true);
    }
  });

  it('rejects for a nonexistent camera directory', async () => {
    await expect(listDates('no-such-cam')).rejects.toThrow();
  });
});

// ── findVideoRelPath ──────────────────────────────────────────────────────────
describe('findVideoRelPath', () => {
  it('returns the correct relative path for a known recording block', async () => {
    const relPath = await findVideoRelPath(
      CAM, '20260406', '18', '20260406_183625_TOK1',
    );
    expect(relPath).not.toBeNull();
    expect(relPath).toBe(
      '20260406/18/20260406_183625_TOK1/20260406_18/20260406_183625_BLOCK1.mkv',
    );
  });

  it('returns null for a nonexistent token directory', async () => {
    expect(await findVideoRelPath(CAM, '20260406', '18', 'no-token')).toBeNull();
  });
});

// ── path helpers ──────────────────────────────────────────────────────────────
describe('cameraPath / dbPath', () => {
  it('cameraPath ends with the camera id', () => {
    expect(path.basename(cameraPath(CAM))).toBe(CAM);
  });

  it('dbPath ends with index.db inside the camera folder', () => {
    const p = dbPath(CAM);
    expect(path.basename(p)).toBe('index.db');
    expect(p).toContain(CAM);
  });
});
