import { describe, it, expect } from 'vitest';
import { getRecordingsForDate, getAvailableDates } from '../services/dbService.js';

// node:sqlite requires --experimental-sqlite. When the flag is absent (plain
// CI run), dbService falls back gracefully and returns null — which is exactly
// what AC-4 requires. The SQLite-specific tests are skipped in that case.

let hasSqlite = false;
try {
  const m = await import('node:sqlite');
  hasSqlite = !!m.DatabaseSync;
} catch { /* flag not present */ }

const CAM = 'axis-00408CE298CD';

// ── AC-4: graceful degradation (always runs) ──────────────────────────────────
describe('dbService — graceful degradation (AC-4)', () => {
  it('getAvailableDates returns null for a camera with no index.db', () => {
    expect(getAvailableDates('no-db-camera')).toBeNull();
  });

  it('getRecordingsForDate returns null for a camera with no index.db', () => {
    expect(getRecordingsForDate('no-db-camera', '20260406')).toBeNull();
  });
});

// ── AC-4: real SQLite reads (skipped when --experimental-sqlite is absent) ────
describe.skipIf(!hasSqlite)('dbService — SQLite reads (AC-4)', () => {
  describe('getAvailableDates', () => {
    it('returns the 3 dates from the fixture index.db', () => {
      const dates = getAvailableDates(CAM);
      expect(dates).not.toBeNull();
      expect(dates).toContain('20260406');
      expect(dates).toContain('20260407');
      expect(dates).toContain('20260408');
    });

    it('returns dates in YYYYMMDD format with no dashes', () => {
      getAvailableDates(CAM).forEach(d => expect(d).toMatch(/^\d{8}$/));
    });
  });

  describe('getRecordingsForDate', () => {
    it('returns 2 recordings for 20260406', () => {
      expect(getRecordingsForDate(CAM, '20260406')).toHaveLength(2);
    });

    it('returns 41 recordings for 20260407', () => {
      expect(getRecordingsForDate(CAM, '20260407')).toHaveLength(41);
    });

    it('returns 48 recordings for 20260408', () => {
      expect(getRecordingsForDate(CAM, '20260408')).toHaveLength(48);
    });

    it('all records have ISO startTime and stopTime', () => {
      getRecordingsForDate(CAM, '20260407').forEach(r => {
        expect(r.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(r.stopTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });

    it('returns correct times for the first 20260406 recording', () => {
      const recs = getRecordingsForDate(CAM, '20260406');
      const rec = recs.find(r => r.startTime === '2026-04-06T18:36:25.656980Z');
      expect(rec).toBeDefined();
      expect(rec.stopTime).toBe('2026-04-06T18:36:38.561046Z');
    });

    it('returns [] for a date with no data in DB', () => {
      expect(getRecordingsForDate(CAM, '20201231')).toHaveLength(0);
    });
  });
});
