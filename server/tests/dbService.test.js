import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { getRecordingsForDate, getAvailableDates, getRecordingHistory, closeDb } from '../services/dbService.js';
import { cameraPath, managedDbPath } from '../services/storageService.js';

// node:sqlite requires --experimental-sqlite. Tests that need the real DB are
// skipped when the flag is absent (plain CI without the flag). Graceful
// degradation tests always run.

let hasSqlite = false;
try {
  const m = process.getBuiltinModule('node:sqlite');
  hasSqlite = !!m.DatabaseSync;
} catch { /* flag not present */ }

const CAM = 'test-cam';

// ── AC-4: graceful degradation (always runs) ──────────────────────────────────
describe('dbService — graceful degradation (AC-4)', () => {
  it('getAvailableDates returns null for a camera with no index.db', () => {
    expect(getAvailableDates('no-db-camera')).toBeNull();
  });

  it('getRecordingsForDate returns null for a camera with no index.db', () => {
    expect(getRecordingsForDate('no-db-camera', '20260406')).toBeNull();
  });

  it('getRecordingHistory returns null for a camera with no index.db', () => {
    expect(getRecordingHistory('no-db-camera', '2026-04-01T00:00:00Z')).toBeNull();
  });
});

// ── AC-4: real SQLite reads (skipped when --experimental-sqlite absent) ───────
describe.skipIf(!hasSqlite)('dbService — SQLite reads (AC-4)', () => {
  describe('getAvailableDates', () => {
    it('returns the 2 dates present in the fixture index.db', () => {
      const dates = getAvailableDates(CAM);
      expect(dates).not.toBeNull();
      expect(dates).toContain('20260406');
      expect(dates).toContain('20260407');
    });

    it('returns dates in YYYYMMDD format', () => {
      getAvailableDates(CAM).forEach(d => expect(d).toMatch(/^\d{8}$/));
    });
  });

  describe('getRecordingsForDate', () => {
    it('returns 1 recording for 20260406', () => {
      expect(getRecordingsForDate(CAM, '20260406')).toHaveLength(1);
    });

    it('returns 1 recording for 20260407', () => {
      expect(getRecordingsForDate(CAM, '20260407')).toHaveLength(1);
    });

    it('all records have ISO startTime and stopTime', () => {
      getRecordingsForDate(CAM, '20260406').forEach(r => {
        expect(r.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(r.stopTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    it('returns [] for a date with no data in DB', () => {
      expect(getRecordingsForDate(CAM, '20201231')).toHaveLength(0);
    });
  });
});

// ── Camera health: getRecordingHistory ────────────────────────────────────────
describe.skipIf(!hasSqlite)('dbService — getRecordingHistory', () => {
  let tmpCam;

  afterEach(async () => {
    if (tmpCam) {
      closeDb(tmpCam);
      await fs.rm(cameraPath(tmpCam), { recursive: true, force: true });
      tmpCam = undefined;
    }
  });

  // Same table/column names maintenance/rebuildIndex.js writes.
  async function makeManagedCamera(rows) {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    tmpCam = `tmp-history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(cameraPath(tmpCam), { recursive: true });
    const db = new DatabaseSync(managedDbPath(tmpCam));
    db.exec('CREATE TABLE cctv_maintenance_index (RecordingToken TEXT, StartTime TEXT, StopTime TEXT)');
    const insert = db.prepare('INSERT INTO cctv_maintenance_index VALUES (?, ?, ?)');
    for (const [token, start, stop] of rows) insert.run(token, start, stop);
    db.close();
    return tmpCam;
  }

  it('reads the native fixture index.db, sorted by start, with earliestStart over the whole index', () => {
    const history = getRecordingHistory(CAM, '2026-04-01T00:00:00Z');
    expect(history).not.toBeNull();
    expect(history.earliestStart).toMatch(/^2026-04-06T/);
    expect(history.recordings).toHaveLength(2);
    expect(history.recordings[0].startTime < history.recordings[1].startTime).toBe(true);
    history.recordings.forEach(r => {
      expect(Object.keys(r).sort()).toEqual(['startTime', 'stopTime']);
      expect(r.stopTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('only returns recordings started at or after sinceIso, but earliestStart still covers the whole index', () => {
    const history = getRecordingHistory(CAM, '2026-04-07T00:00:00Z');
    expect(history.recordings).toHaveLength(1);
    expect(history.recordings[0].startTime).toMatch(/^2026-04-07T/);
    expect(history.earliestStart).toMatch(/^2026-04-06T/);
  });

  it('reads a maintenance-managed index, with stopTime null when the column is NULL', async () => {
    const cam = await makeManagedCamera([
      ['B', '2026-10-20T10:00:00.000000Z', null],
      ['A', '2026-10-19T09:00:00.000000Z', '2026-10-19T09:00:30.000000Z'],
      ['OLD', '2026-10-01T09:00:00.000000Z', '2026-10-01T09:00:30.000000Z'],
    ]);
    const history = getRecordingHistory(cam, '2026-10-10T00:00:00Z');
    expect(history.earliestStart).toBe('2026-10-01T09:00:00.000000Z');
    expect(history.recordings).toEqual([
      { startTime: '2026-10-19T09:00:00.000000Z', stopTime: '2026-10-19T09:00:30.000000Z' },
      { startTime: '2026-10-20T10:00:00.000000Z', stopTime: null },
    ]);
  });

  it('returns earliestStart null and no recordings for an empty index', async () => {
    const cam = await makeManagedCamera([]);
    expect(getRecordingHistory(cam, '2026-10-10T00:00:00Z')).toEqual({ earliestStart: null, recordings: [] });
  });
});
