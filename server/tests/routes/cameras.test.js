import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import camerasRouter from '../../routes/cameras.js';

const app = express();
app.use(express.json());
app.use('/api/cameras', camerasRouter);

const CAM = 'test-cam';

// ── AC-1: GET /api/cameras ────────────────────────────────────────────────────
describe('GET /api/cameras (AC-1)', () => {
  it('returns 200 with an array of cameras', async () => {
    const res = await request(app).get('/api/cameras');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('each camera has id and name fields', async () => {
    const res = await request(app).get('/api/cameras');
    res.body.forEach(c => {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
    });
  });

  it('includes the fixture camera', async () => {
    const res = await request(app).get('/api/cameras');
    expect(res.body.find(c => c.id === CAM)).toBeDefined();
  });
});

// ── AC-3: GET /api/cameras/:id/dates ─────────────────────────────────────────
describe('GET /api/cameras/:id/dates (AC-3)', () => {
  it('returns 200 with fixture dates in YYYYMMDD format', async () => {
    const res = await request(app).get(`/api/cameras/${CAM}/dates`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('20260406');
    expect(res.body).toContain('20260407');
    res.body.forEach(d => expect(d).toMatch(/^\d{8}$/));
  });

  it('returns 500 for a completely nonexistent camera', async () => {
    const res = await request(app).get('/api/cameras/no-such-camera/dates');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ── AC-4: GET /api/cameras/:id/recordings ────────────────────────────────────
describe('GET /api/cameras/:id/recordings (AC-4)', () => {
  it('returns 400 when date param is missing', async () => {
    const res = await request(app).get(`/api/cameras/${CAM}/recordings`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  it('returns 400 when date is not YYYYMMDD', async () => {
    const res = await request(app).get(`/api/cameras/${CAM}/recordings?date=2026-04-06`);
    expect(res.status).toBe(400);
  });

  it('returns 1 recording for 20260406 with correct shape', async () => {
    const res = await request(app).get(`/api/cameras/${CAM}/recordings?date=20260406`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const rec = res.body[0];
    expect(rec).toHaveProperty('token');
    expect(rec).toHaveProperty('startTime');
    expect(rec).toHaveProperty('stopTime');
    expect(rec).toHaveProperty('videoRelPath');
    expect(rec.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rec.videoRelPath).toMatch(/\.mkv$/);
  });

  it('returns [] for a date with no recordings', async () => {
    const res = await request(app).get(`/api/cameras/${CAM}/recordings?date=20201231`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns [] (not 500) for a nonexistent camera (AC-4 graceful)', async () => {
    const res = await request(app).get('/api/cameras/no-such-cam/recordings?date=20260406');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── AC-5: POST /api/cameras/:id/cache ────────────────────────────────────────
describe('POST /api/cameras/:id/cache (AC-5)', () => {
  it('returns 400 when date param is missing', async () => {
    const res = await request(app).post(`/api/cameras/${CAM}/cache`);
    expect(res.status).toBe(400);
  });

  it('returns 200 with a numeric cached count', async () => {
    const res = await request(app).post(`/api/cameras/${CAM}/cache?date=20260406`);
    expect(res.status).toBe(200);
    expect(typeof res.body.cached).toBe('number');
  });

  it('returns cached:0 for a date with no recordings', async () => {
    const res = await request(app).post(`/api/cameras/${CAM}/cache?date=20201231`);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(0);
  });
});
