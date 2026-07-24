import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { listCameras, listDates, cameraPath } from '../services/storageService.js';
import { getRecordingsForDate, getAvailableDates } from '../services/dbService.js';
import { scanRecordingsForDate } from '../services/xmlService.js';

// Find the most recent recording (with a resolvable video file) for a
// camera, scanning backwards from the most recent date until one is found.
async function findLatestRecording(cameraId) {
  const dbDates = getAvailableDates(cameraId);
  const dates = dbDates ?? await listDates(cameraId);

  for (let i = dates.length - 1; i >= 0; i--) {
    const recordings = await scanRecordingsForDate(cameraId, dates[i]);
    const withVideo = recordings.filter(r => r.videoRelPath);
    if (withVideo.length > 0) return withVideo[withVideo.length - 1];
  }
  return null;
}

const router = Router();

// GET /api/cameras
router.get('/', async (_req, res) => {
  try {
    const cameras = await listCameras();
    res.json(cameras);
  } catch (err) {
    console.error('[cameras] listCameras:', err);
    res.status(500).json({ error: 'Failed to list cameras' });
  }
});

// GET /api/cameras/:id/dates
router.get('/:id/dates', async (req, res) => {
  const { id } = req.params;
  try {
    const dbDates = getAvailableDates(id);
    if (dbDates) return res.json(dbDates);

    const fsDates = await listDates(id);
    res.json(fsDates);
  } catch (err) {
    console.error(`[cameras] listDates ${id}:`, err);
    res.status(500).json({ error: 'Failed to list dates' });
  }
});

// GET /api/cameras/:id/latest-recording
// Returns the most recent recording (for use as a card thumbnail), or null.
router.get('/:id/latest-recording', async (req, res) => {
  const { id } = req.params;
  try {
    const recording = await findLatestRecording(id);
    res.json(recording);
  } catch (err) {
    console.error(`[cameras] latestRecording ${id}:`, err);
    res.status(500).json({ error: 'Failed to get latest recording' });
  }
});

// GET /api/cameras/:id/recordings?date=YYYYMMDD
router.get('/:id/recordings', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  if (!date || !/^\d{8}$/.test(date)) {
    return res.status(400).json({ error: 'date query param required (YYYYMMDD)' });
  }

  try {
    // XML scan is always authoritative for videoRelPath; use DB only as a
    // potential future optimisation path.
    const recordings = await scanRecordingsForDate(id, date);
    res.json(recordings);
  } catch (err) {
    console.error(`[cameras] getRecordings ${id}/${date}:`, err);
    res.status(500).json({ error: 'Failed to get recordings' });
  }
});

// POST /api/cameras/:id/cache?date=YYYYMMDD
// Pre-warms OS file cache for all video files on this date so first seek is instant.
router.post('/:id/cache', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  try {
    const recordings = await scanRecordingsForDate(id, date);
    const camPath = cameraPath(id);

    await Promise.allSettled(recordings.map(async (rec) => {
      if (!rec.videoRelPath) return;
      const absPath = path.join(camPath, rec.videoRelPath);
      const buf = Buffer.alloc(64 * 1024);
      const fd = await fs.open(absPath, 'r');
      try { await fd.read(buf, 0, buf.length, 0); }
      finally { await fd.close(); }
    }));

    res.json({ cached: recordings.length });
  } catch (err) {
    console.error(`[cameras] cache ${id}:`, err);
    res.status(500).json({ error: 'Cache failed' });
  }
});

export default router;
