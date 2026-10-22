import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import maintenanceRouter from '../../routes/maintenance.js';
import { maintenanceStatusPath, cameraPath } from '../../services/storageService.js';

// Lets one test make health evaluation throw for a single camera, to prove
// that camera gets `health: null` while the rest of the response is intact.
vi.mock('../../services/dbService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRecordingHistory: (cameraId, sinceIso) => {
      if (cameraId.startsWith('tmp-health-throw-')) throw new Error('boom');
      return actual.getRecordingHistory(cameraId, sinceIso);
    },
  };
});

const app = express();
app.use('/api/maintenance', maintenanceRouter);

const CAM = 'test-cam';

// ── GET /api/maintenance/status ──────────────────────────────────────────────
describe('GET /api/maintenance/status', () => {
  it('returns 200 with configuredRetentionDays, lastRun, and cameras', async () => {
    const res = await request(app).get('/api/maintenance/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configuredRetentionDays');
    expect(res.body).toHaveProperty('lastRun');
    expect(Array.isArray(res.body.cameras)).toBe(true);
  });

  it('includes the fixture camera as unmanaged (it has a native index.db)', async () => {
    const res = await request(app).get('/api/maintenance/status');
    const cam = res.body.cameras.find(c => c.id === CAM);
    expect(cam).toBeDefined();
    expect(cam.managed).toBe(false);
    expect(cam.activeDbFile).toBe('index.db');
  });

  it('lastRun is null on fresh fixture storage with no maintenance run yet', async () => {
    const res = await request(app).get('/api/maintenance/status');
    expect(res.body.lastRun).toBeNull();
  });

  it('configuredRetentionDays is null when no run has ever happened, regardless of this process\'s own env', async () => {
    const res = await request(app).get('/api/maintenance/status');
    expect(res.body.configuredRetentionDays).toBeNull();
  });

  describe('health', () => {
    let tmpCams = [];

    async function makeCamera(prefix) {
      const id = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await fs.mkdir(cameraPath(id), { recursive: true });
      tmpCams.push(id);
      return id;
    }

    afterEach(async () => {
      await Promise.all(tmpCams.map(id => fs.rm(cameraPath(id), { recursive: true, force: true })));
      tmpCams = [];
    });

    it('every camera has a health object matching the contract', async () => {
      const res = await request(app).get('/api/maintenance/status');
      expect(res.body.cameras.length).toBeGreaterThan(0);
      for (const cam of res.body.cameras) {
        expect(cam).toHaveProperty('health');
        expect(['ok', 'warn', 'critical', 'unknown']).toContain(cam.health.level);
        expect(Array.isArray(cam.health.reasons)).toBe(true);
        expect(new Date(cam.health.evaluatedAt).toISOString()).toBe(cam.health.evaluatedAt);
        expect(typeof cam.health.figures).toBe('object');
      }
    });

    it('a camera with no index is unknown with "recording data unavailable"', async () => {
      const id = await makeCamera('tmp-health-noindex-');
      const res = await request(app).get('/api/maintenance/status');
      const cam = res.body.cameras.find(c => c.id === id);
      expect(cam.health.level).toBe('unknown');
      expect(cam.health.reasons).toEqual(['recording data unavailable']);
    });

    it('a camera whose health evaluation throws gets health: null; the others are still evaluated', async () => {
      const id = await makeCamera('tmp-health-throw-');
      const res = await request(app).get('/api/maintenance/status');
      expect(res.status).toBe(200);
      const broken = res.body.cameras.find(c => c.id === id);
      expect(broken.health).toBeNull();
      expect(broken.managed).toBe(true);
      expect(res.body.cameras.find(c => c.id === CAM).health).not.toBeNull();
    });
  });

  describe('with a written status file', () => {
    afterEach(async () => {
      await fs.rm(maintenanceStatusPath(), { force: true });
    });

    it('configuredRetentionDays comes from the status file\'s retentionDays, not process.env.RETENTION_DAYS', async () => {
      // The route process (cctv-ui) never has RETENTION_DAYS set in production —
      // only the maintenance job's container does. This pins that the value
      // must come from what the job actually ran with, not this process's env.
      await fs.writeFile(
        maintenanceStatusPath(),
        JSON.stringify({ lastRunAt: '2026-08-26T00:00:00.000Z', retentionDays: 33 })
      );

      const res = await request(app).get('/api/maintenance/status');
      expect(res.body.configuredRetentionDays).toBe(33);
    });
  });
});
