import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseRecordingXml, scanRecordingsForDate } from '../services/xmlService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES   = path.resolve(__dirname, 'fixtures');
const CAM        = 'test-cam';

// ── AC-4: parseRecordingXml ───────────────────────────────────────────────────
describe('parseRecordingXml (AC-4)', () => {
  it('parses a well-formed recording.xml and returns correct fields', async () => {
    const xmlPath = path.join(
      FIXTURES, CAM,
      '20260406', '18',
      '20260406_183625_TOK1',
      'recording.xml',
    );
    const rec = await parseRecordingXml(xmlPath);

    expect(rec).not.toBeNull();
    expect(rec.token).toBe('20260406_183625_TOK1');
    expect(rec.startTime).toBe('2026-04-06T18:36:25.656980Z');
    expect(rec.stopTime).toBe('2026-04-06T18:36:38.561046Z');
    expect(rec.width).toBe(720);
    expect(rec.height).toBe(1280);
    expect(rec.framerate).toBeCloseTo(30.0);
    expect(rec.encoding).toBe('video/x-h264');
  });

  it('returns null for a nonexistent file (graceful degradation)', async () => {
    expect(await parseRecordingXml('/nonexistent/recording.xml')).toBeNull();
  });
});

// ── AC-4: scanRecordingsForDate ───────────────────────────────────────────────
describe('scanRecordingsForDate (AC-4)', () => {
  it('returns 1 recording for 20260406, sorted by startTime', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260406');
    expect(recs).toHaveLength(1);
    expect(recs[0].token).toBe('20260406_183625_TOK1');
    expect(recs[0].startTime).toBe('2026-04-06T18:36:25.656980Z');
    expect(recs[0].stopTime).toBe('2026-04-06T18:36:38.561046Z');
    expect(recs[0].videoRelPath).toMatch(/\.mkv$/);
  });

  it('each recording has token, startTime, stopTime, videoRelPath', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260406');
    for (const rec of recs) {
      expect(rec.token).toBeTruthy();
      expect(rec.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rec.stopTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rec.videoRelPath).toMatch(/\.mkv$/);
    }
  });

  it('returns 1 recording for 20260407', async () => {
    const recs = await scanRecordingsForDate(CAM, '20260407');
    expect(recs).toHaveLength(1);
    expect(recs[0].token).toBe('20260407_045930_TOK2');
  });

  it('returns [] for a nonexistent camera (AC-4 graceful)', async () => {
    expect(await scanRecordingsForDate('no-such-cam', '20260406')).toEqual([]);
  });

  it('returns [] for a date with no recordings', async () => {
    expect(await scanRecordingsForDate(CAM, '20201231')).toEqual([]);
  });
});
