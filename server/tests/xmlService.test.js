import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRecordingXml, scanRecordingsForDate } from '../services/xmlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE    = path.resolve(__dirname, '..', '..', 'video_example');
const CAM        = 'axis-00408CE298CD';

// ── AC-4: parseRecordingXml ───────────────────────────────────────────────────
describe('parseRecordingXml (AC-4)', () => {
  it('parses a well-formed recording.xml and returns correct fields', async () => {
    const xmlPath = path.join(
      FIXTURE, CAM,
      '20260406', '18',
      '20260406_183625_0D88_00408CE298CD',
      'recording.xml',
    );
    const rec = await parseRecordingXml(xmlPath);

    expect(rec).not.toBeNull();
    expect(rec.token).toBe('20260406_183625_0D88_00408CE298CD');
    expect(rec.startTime).toBe('2026-04-06T18:36:25.656980Z');
    expect(rec.stopTime).toBe('2026-04-06T18:36:38.561046Z');
    expect(rec.width).toBe(720);
    expect(rec.height).toBe(1280);
    expect(rec.framerate).toBeCloseTo(30.0);
    expect(rec.encoding).toBe('video/x-h264');
  });

  it('returns null for a nonexistent file (graceful degradation)', async () => {
    const result = await parseRecordingXml('/nonexistent/recording.xml');
    expect(result).toBeNull();
  });

  it('returns null for an XML file with no <Recording> root (block sidecar)', async () => {
    // The block .xml sidecar has no <Recording> element
    const xmlPath = path.join(
      FIXTURE, CAM,
      '20260406', '18',
      '20260406_183625_0D88_00408CE298CD',
      '20260406_18',
      '20260406_183625_69F9_00408CE298CD.xml',
    );
    const result = await parseRecordingXml(xmlPath);
    expect(result).toBeNull();
  });
});

// ── AC-4: scanRecordingsForDate ───────────────────────────────────────────────
describe('scanRecordingsForDate (AC-4)', () => {
  it('returns 2 recordings for 20260406, sorted by startTime', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260406');
    expect(recs).toHaveLength(2);
    expect(recs[0].startTime < recs[1].startTime).toBe(true);
  });

  it('each recording has token, startTime, stopTime, videoRelPath fields', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260406');
    for (const rec of recs) {
      expect(rec.token).toBeTruthy();
      expect(rec.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rec.stopTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rec.videoRelPath).toMatch(/\.mkv$/);
    }
  });

  it('first recording has the correct token and videoRelPath', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260406');
    expect(recs[0].token).toBe('20260406_183625_0D88_00408CE298CD');
    expect(recs[0].videoRelPath).toContain('20260406_18');
    expect(recs[0].videoRelPath).toMatch(/\.mkv$/);
  });

  it('returns a larger sorted list for 20260407 (41 recordings)', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260407');
    expect(recs).toHaveLength(41);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].startTime <= recs[i].startTime).toBe(true);
    }
  });

  it('returns [] for a nonexistent camera (AC-4 graceful)', async () => {
    const recs = await scanRecordingsForDate('no-such-cam', '20260406');
    expect(recs).toEqual([]);
  });

  it('returns [] for a date with no recordings', async () => {
    const recs = await scanRecordingsForDate(CAM, '20201231');
    expect(recs).toEqual([]);
  });
});
