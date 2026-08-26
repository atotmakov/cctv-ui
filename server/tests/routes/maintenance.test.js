import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import maintenanceRouter from '../../routes/maintenance.js';
import { maintenanceStatusPath } from '../../services/storageService.js';

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
