import { describe, it, expect } from 'vitest';
import { getRecordingsForDate, getAvailableDates } from '../services/dbService.js';

// node:sqlite requires --experimental-sqlite. Tests that need the real DB are
// skipped when the flag is absent (plain CI without the flag). Graceful
// degradation tests always run.

let hasSqlite = false;
try {
  const m = await import('node:sqlite');
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
