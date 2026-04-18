import { describe, it, expect } from 'vitest';
import path from 'path';
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
