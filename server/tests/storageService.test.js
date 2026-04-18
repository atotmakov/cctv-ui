import { describe, it, expect } from 'vitest';
import path from 'path';
import { listCameras, listDates, findVideoRelPath, cameraPath, dbPath } from '../services/storageService.js';

const CAM = 'axis-00408CE298CD';

// ── AC-1: listCameras ─────────────────────────────────────────────────────────
describe('listCameras (AC-1)', () => {
  it('returns at least one camera from fixture storage', async () => {
    const cameras = await listCameras();
    expect(Array.isArray(cameras)).toBe(true);
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
    expect(dates.length).toBeGreaterThanOrEqual(3);
    dates.forEach(d => expect(d).toMatch(/^\d{8}$/));
  });

  it('returns sorted dates containing 20260406, 20260407, 20260408', async () => {
    const dates = await listDates(CAM);
    expect(dates).toContain('20260406');
    expect(dates).toContain('20260407');
    expect(dates).toContain('20260408');
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
      CAM, '20260406', '18',
      '20260406_183625_0D88_00408CE298CD',
    );
    expect(relPath).not.toBeNull();
    expect(relPath).toMatch(/\.mkv$/);
    expect(relPath).toBe(
      '20260406/18/20260406_183625_0D88_00408CE298CD/20260406_18/20260406_183625_69F9_00408CE298CD.mkv',
    );
  });

  it('returns null for a nonexistent token directory', async () => {
    const relPath = await findVideoRelPath(CAM, '20260406', '18', 'no-token');
    expect(relPath).toBeNull();
  });
});

// ── path helpers ──────────────────────────────────────────────────────────────
describe('cameraPath / dbPath', () => {
  it('cameraPath ends with the camera id', () => {
    const p = cameraPath(CAM);
    expect(path.basename(p)).toBe(CAM);
  });

  it('dbPath ends with index.db inside the camera folder', () => {
    const p = dbPath(CAM);
    expect(path.basename(p)).toBe('index.db');
    expect(p).toContain(CAM);
  });
});
