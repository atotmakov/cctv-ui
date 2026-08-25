import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import maintenanceRouter from '../../routes/maintenance.js';

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
});
