import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { evaluateHealth, worstLevel, HEALTH_THRESHOLDS, getCameraHealth, clearHealthCache } from '../services/healthService.js';
import { cameraPath, managedDbPath } from '../services/storageService.js';
import { closeDb } from '../services/dbService.js';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const UTC = { timeZone: 'UTC' };

// Recordings at the given UTC times-of-day (minutes since midnight) on each
// day from `fromDay` (inclusive) to `toDay` (inclusive), 30 s long each.
function daily(fromDay, toDay, minutesOfDay) {
  const out = [];
  for (let t = Date.parse(`${fromDay}T00:00:00Z`); t <= Date.parse(`${toDay}T00:00:00Z`); t += 24 * HOUR) {
    for (const m of minutesOfDay) out.push(rec(t + m * MIN));
  }
  return out;
}

function rec(startMs, durMs = 30 * 1000) {
  return { startTime: new Date(startMs).toISOString(), stopTime: new Date(startMs + durMs).toISOString() };
}

// Every `step` minutes from `from` (inclusive) to `to` (exclusive), in minutes of day.
function every(step, from, to) {
  const out = [];
  for (let m = from; m < to; m += step) out.push(m);
  return out;
}

function history(recordings, earliestStart = '2026-09-01T00:00:00Z') {
  return { earliestStart, recordings: [...recordings].sort((a, b) => a.startTime.localeCompare(b.startTime)) };
}

const NOW = new Date('2026-10-20T14:00:00Z');
// 06:00–21:30 every 30 min → 16 recordings by 14:00, overnight gap ~8.5 h.
const NORMAL = every(30, 6 * 60, 22 * 60);

describe('evaluateHealth — US1 rules', () => {
  it('(a) normal recording → ok, with each passed rule explained', () => {
    const h = history([...daily('2026-10-10', '2026-10-19', NORMAL), ...daily('2026-10-20', '2026-10-20', every(30, 6 * 60, 14 * 60))]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.level).toBe('ok');
    expect(r.reasons).toEqual([
      'Last recording 30m ago; alert after 13h',
      '16 recordings today; usually ~16 by 14:00',
    ]);
  });

  it('(b) usual count ≥ 3 and none today → critical, reason names both counts', () => {
    const h = history(daily('2026-10-10', '2026-10-19', NORMAL));
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.level).toBe('critical');
    const reason = r.reasons.find(s => s.includes('today'));
    expect(reason).toContain('0 recordings today');
    expect(reason).toContain('~16');
    expect(reason).toContain('14:00');
  });

  it('(c) busy camera below 25% of usual → critical even while recency is fine', () => {
    const h = history([
      ...daily('2026-10-10', '2026-10-19', every(12, 6 * 60, 22 * 60)),
      ...daily('2026-10-20', '2026-10-20', [6 * 60, 10 * 60, 13 * 60 + 30]),
    ]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.level).toBe('critical');
    expect(r.figures.todayCount).toBe(3);
    expect(r.reasons).toHaveLength(2);
    expect(r.reasons[0]).toMatch(/^3 recordings today; usually ~40 by 14:00/);
    expect(r.reasons[1]).toMatch(/^Last recording 30m ago; alert after /);
  });

  it('(c) quiet camera with a small usual count is not flagged for a small shortfall', () => {
    const h = history([
      ...daily('2026-10-10', '2026-10-19', NORMAL),
      ...daily('2026-10-20', '2026-10-20', [6 * 60, 10 * 60, 13 * 60 + 30]),
    ]);
    expect(evaluateHealth(h, NOW, UTC).level).toBe('ok');
  });

  it('(d) today below 50% but not stopped (15 vs ~40) → warn naming both counts', () => {
    const h = history([
      ...daily('2026-10-10', '2026-10-19', every(12, 6 * 60, 22 * 60)),
      ...daily('2026-10-20', '2026-10-20', every(32, 6 * 60, 14 * 60)),
    ]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.figures.usualCount).toBe(40);
    expect(r.figures.todayCount).toBe(15);
    expect(r.level).toBe('warn');
    expect(r.reasons[0]).toBe('15 recordings today; usually ~40 by 14:00');
    expect(r.reasons[1]).toMatch(/^Last recording /);
  });

  it('(e) gap longer than 1.5 × the typical longest gap → critical "No recordings for …"', () => {
    // 2 recordings a day (median < 3, so the activity rule stays ok); longest gap 23 h → threshold 34.5 h.
    const h = history(daily('2026-10-10', '2026-10-18', [6 * 60, 7 * 60]));
    const r = evaluateHealth(h, new Date('2026-10-20T18:00:00Z'), UTC);
    expect(r.level).toBe('critical');
    expect(r.reasons).toHaveLength(2);
    expect(r.reasons[0]).toMatch(/^No recordings for 2d 11h; normally at most ~23h apart$/);
    expect(r.reasons[1]).toMatch(/recordings today; usually ~/);
    expect(r.figures.recencyThresholdMs).toBeCloseTo(1.5 * r.figures.longestGapMs, -3);
  });

  it('(f) fewer than 7 complete days and recency ok → unknown, "learning (N of 7 days)"', () => {
    const h = history(
      [...daily('2026-10-16', '2026-10-19', NORMAL), ...daily('2026-10-20', '2026-10-20', every(30, 6 * 60, 14 * 60))],
      '2026-10-16T06:00:00Z',
    );
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.level).toBe('unknown');
    expect(r.reasons).toEqual(['learning (3 of 7 days)', 'Last recording 30m ago; alert after 13h']);
    expect(r.figures.completeDays).toBe(3);
    expect(r.figures.usualCount).toBeNull();
  });

  it('(f) fewer than 7 complete days and recency exceeded → critical', () => {
    const h = history(daily('2026-10-16', '2026-10-19', NORMAL), '2026-10-16T06:00:00Z');
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.level).toBe('critical');
    expect(r.reasons[0]).toMatch(/^No recordings for 16h/);
    expect(r.reasons).toContain('learning (3 of 7 days)');
  });

  it('(g) no index → unknown "recording data unavailable"', () => {
    const r = evaluateHealth(null, NOW, UTC);
    expect(r.level).toBe('unknown');
    expect(r.reasons).toEqual(['recording data unavailable']);
  });

  it('(g) empty index → unknown "no recordings found"', () => {
    const r = evaluateHealth({ earliestStart: null, recordings: [] }, NOW, UTC);
    expect(r.level).toBe('unknown');
    expect(r.reasons).toEqual(['no recordings found']);
  });

  it('(g) older recordings exist but none in the last 7 days → critical', () => {
    const r = evaluateHealth({ earliestStart: '2026-04-06T18:36:25Z', recordings: [] }, NOW, UTC);
    expect(r.level).toBe('critical');
    expect(r.reasons).toEqual(['No recordings for more than 7 days']);
  });

  it('(h) most severe wins; unknown never outranks a real result', () => {
    expect(worstLevel(['ok', 'warn'])).toBe('warn');
    expect(worstLevel(['warn', 'critical', 'ok'])).toBe('critical');
    expect(worstLevel(['unknown', 'ok'])).toBe('ok');
    expect(worstLevel([])).toBe('unknown');
  });

  it('(i) figures carry the numbers the reasons are based on', () => {
    const h = history([...daily('2026-10-10', '2026-10-19', NORMAL), ...daily('2026-10-20', '2026-10-20', every(30, 6 * 60, 14 * 60))]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.evaluatedAt).toBe(NOW.toISOString());
    expect(r.figures).toEqual({
      todayCount: 16,
      usualCount: 16,
      completeDays: 7,
      lastRecordingEnd: '2026-10-20T13:30:30.000Z',
      longestGapMs: 8.5 * HOUR - 30 * 1000,
      recencyThresholdMs: 1.5 * (8.5 * HOUR - 30 * 1000),
    });
  });

  it('(j) fewer than 2 recordings in the baseline → no longest gap, 2 h minimum threshold', () => {
    const h = history([rec(Date.parse('2026-10-19T06:00:00Z'))], '2026-04-01T00:00:00Z');
    const r = evaluateHealth(h, new Date('2026-10-19T07:00:00Z'), UTC);
    expect(r.figures.longestGapMs).toBeNull();
    expect(r.figures.recencyThresholdMs).toBe(HEALTH_THRESHOLDS.recencyMinMs);
    expect(r.figures.recencyThresholdMs).toBe(7200000);
    expect(r.level).toBe('ok');
  });

  it('ignores recordings that start after "now" (replaying history)', () => {
    const h = history(daily('2026-10-10', '2026-10-21', NORMAL));
    const r = evaluateHealth(h, NOW, UTC);
    // 16 before 14:00 plus the one starting exactly at "now", whose end is clamped to now.
    expect(r.figures.todayCount).toBe(17);
    expect(r.figures.lastRecordingEnd).toBe(NOW.toISOString());
  });

  it('skips rows with an unparsable start time instead of failing', () => {
    const h = history([...daily('2026-10-10', '2026-10-19', NORMAL), ...daily('2026-10-20', '2026-10-20', every(30, 6 * 60, 14 * 60))]);
    h.recordings.push({ startTime: 'garbage', stopTime: null });
    expect(evaluateHealth(h, NOW, UTC).level).toBe('ok');
  });

  it('treats a null stop time as ending at its start', () => {
    const h = history([...daily('2026-10-10', '2026-10-19', NORMAL), { startTime: '2026-10-20T13:59:00.000Z', stopTime: null }]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.figures.lastRecordingEnd).toBe('2026-10-20T13:59:00.000Z');
  });
});

describe('evaluateHealth — US2: quiet cameras are not false alarms', () => {
  it('one past outage does not loosen the threshold (median of daily longest gaps)', () => {
    // Normal ~8.5 h overnight gaps, plus a single 30 h outage on 14–15 Oct.
    const recs = daily('2026-10-10', '2026-10-19', NORMAL)
      .filter(r => !(r.startTime > '2026-10-14T12:00' && r.startTime < '2026-10-15T18:00'));
    const r = evaluateHealth(history(recs), NOW, UTC);
    expect(r.figures.longestGapMs).toBe(8.5 * HOUR - 30 * 1000);
  });

  it('(a) longest normal gap 14 h, 10 h since the last recording → ok', () => {
    const h = history(daily('2026-10-10', '2026-10-19', [8 * 60, 10 * 60, 12 * 60, 14 * 60, 18 * 60]));
    const r = evaluateHealth(h, new Date('2026-10-20T04:00:00Z'), UTC);
    expect(r.figures.longestGapMs).toBe(14 * HOUR - 30 * 1000);
    expect(r.level).toBe('ok');
  });

  it('(b) camera that usually has 0–1 recordings by 08:00 has 0 at 08:00 → ok', () => {
    const recs = daily('2026-10-10', '2026-10-19', [9 * 60, 12 * 60, 15 * 60, 18 * 60]);
    for (const day of ['2026-10-11', '2026-10-13', '2026-10-15', '2026-10-17', '2026-10-19']) {
      recs.push(rec(Date.parse(`${day}T07:30:00Z`)));
    }
    const r = evaluateHealth(history(recs), new Date('2026-10-20T08:00:00Z'), UTC);
    expect(r.figures.todayCount).toBe(0);
    expect(r.figures.usualCount).toBeLessThanOrEqual(1);
    expect(r.level).toBe('ok');
  });

  it('(c) an ongoing outage (open trailing gap) does not enlarge the longest gap', () => {
    const h = history([
      ...daily('2026-10-10', '2026-10-18', NORMAL),
      ...daily('2026-10-19', '2026-10-19', every(30, 6 * 60, 12 * 60 + 1)),
    ]);
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.figures.longestGapMs).toBe(8.5 * HOUR - 30 * 1000);
    expect(r.level).toBe('critical');
  });

  it('(d) a partially retained oldest day is not counted as complete', () => {
    const h = history(daily('2026-10-13', '2026-10-19', NORMAL), '2026-10-13T10:00:00Z');
    const r = evaluateHealth(h, NOW, UTC);
    expect(r.figures.completeDays).toBe(6);
    expect(r.reasons).toContain('learning (6 of 7 days)');
  });

  it('(e) day boundaries follow the configured time zone', () => {
    // 22:30Z on 19 Oct is 01:30 on 20 Oct in Moscow (UTC+3).
    const h = history([...daily('2026-10-10', '2026-10-19', every(30, 6 * 60, 18 * 60)), rec(Date.parse('2026-10-19T22:30:00Z'))]);
    const now = new Date('2026-10-20T02:00:00Z'); // 05:00 in Moscow
    expect(evaluateHealth(h, now, { timeZone: 'Europe/Moscow' }).figures.todayCount).toBe(1);
    expect(evaluateHealth(h, now, UTC).figures.todayCount).toBe(0);
  });

  it('(f) SC-002: a camera that stops mid-day turns red right after its own recency threshold', () => {
    const h = history([
      ...daily('2026-10-13', '2026-10-19', every(30, 7 * 60, 21 * 60)),
      ...daily('2026-10-20', '2026-10-20', every(30, 7 * 60, 10 * 60 + 1)),
    ]);
    const lastEnd = Date.parse('2026-10-20T10:00:30Z');
    const threshold = evaluateHealth(h, lastEnd + HOUR, UTC).figures.recencyThresholdMs;
    expect(evaluateHealth(h, lastEnd + threshold - MIN, UTC).level).not.toBe('critical');
    expect(evaluateHealth(h, lastEnd + threshold + MIN, UTC).level).toBe('critical');
  });
});

// ── SC-001 / SC-002 / SC-003 replay against real production history ──────────
// Start/stop timestamps exported read-only from the 7 production indexes for
// 29 Sep – 20 Oct 2026 (earliestStart clamped to the export window).
describe('evaluateHealth — replay of the October 2026 incident', () => {
  const fixture = JSON.parse(readFileSync(new URL('./health-fixtures/oct-2026.json', import.meta.url), 'utf-8'));
  const MSK = { timeZone: 'Europe/Moscow' };
  const FAILED = ['axis-b8a44f6c2746', 'axis-b8a44f734f32', 'axis-b8a44f73558a', 'axis-00408CE2767E'];
  const HEALTHY = ['axis-00408CE298CD', 'axis-00408CF0FE28', 'axis-ACCC8E368EE5'];

  function hourly(fromIso, toIso) {
    const out = [];
    for (let t = Date.parse(fromIso); t <= Date.parse(toIso); t += HOUR) out.push(t);
    return out;
  }

  it('has all 7 cameras', () => {
    expect(Object.keys(fixture).sort()).toEqual([...FAILED, ...HEALTHY].sort());
  });

  it('SC-001: the four failed cameras are critical by 18 Oct 23:00 MSK', () => {
    for (const cam of FAILED) {
      expect(evaluateHealth(fixture[cam], Date.parse('2026-10-18T23:00:00+03:00'), MSK).level, cam).toBe('critical');
    }
  });

  it('SC-001: the three healthy cameras are ok at every hour of 13–19 Oct', () => {
    const bad = [];
    for (const cam of HEALTHY) {
      for (const t of hourly('2026-10-13T00:00:00+03:00', '2026-10-19T23:00:00+03:00')) {
        const r = evaluateHealth(fixture[cam], t, MSK);
        if (r.level !== 'ok') bad.push(`${cam} @ ${new Date(t).toISOString()}: ${r.level} ${r.reasons.join(' | ')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('SC-002: every recency threshold is ≤ 24 h until the camera is first flagged critical', () => {
    const over = [];
    for (const cam of Object.keys(fixture)) {
      for (const t of hourly('2026-10-13T00:00:00+03:00', '2026-10-19T23:00:00+03:00')) {
        const r = evaluateHealth(fixture[cam], t, MSK);
        if (r.level === 'critical') break;
        if (r.figures.recencyThresholdMs > 24 * HOUR) over.push(`${cam} @ ${new Date(t).toISOString()}: ${r.figures.recencyThresholdMs / HOUR}h`);
      }
    }
    expect(over).toEqual([]);
  });

  it('SC-003: no false-alarm day for the healthy cameras over 7–20 Oct', () => {
    const falseDays = new Set();
    let days = 0;
    for (let d = 7; d <= 20; d++) {
      days++;
      const day = `2026-10-${String(d).padStart(2, '0')}`;
      for (const cam of HEALTHY) {
        for (const t of hourly(`${day}T00:00:00+03:00`, `${day}T23:00:00+03:00`)) {
          const level = evaluateHealth(fixture[cam], t, MSK).level;
          if (level === 'warn' || level === 'critical') falseDays.add(`${cam} ${day}`);
        }
      }
    }
    console.log(`[SC-003] ${days} days × ${HEALTHY.length} cameras, false-alarm days: ${falseDays.size}`, [...falseDays]);
    expect(falseDays.size).toBe(0);
  });
});

describe('getCameraHealth on a managed camera', () => {
  let camId = null;

  afterEach(async () => {
    clearHealthCache();
    if (!camId) return;
    closeDb(camId);
    await fs.rm(cameraPath(camId), { recursive: true, force: true });
    camId = null;
  });

  // Oct 2026: the S3 sync delivered ~2 days of recordings in one burst; for
  // the rest of the hour, until the next index rebuild, health said
  // "No recordings for 2d" while playback (a live folder scan) showed today.
  it('counts recordings that reached the share after the last index rebuild', async () => {
    const now = new Date();
    const nowMs = now.getTime();
    camId = `tmp-health-${nowMs}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(cameraPath(camId), { recursive: true });

    // Index as last rebuilt: a recording every hour for 10 days, ending 2 days ago.
    const db = new DatabaseSync(managedDbPath(camId));
    db.exec('CREATE TABLE cctv_maintenance_index (RecordingToken TEXT PRIMARY KEY, StartTime TEXT, StopTime TEXT)');
    const insert = db.prepare('INSERT INTO cctv_maintenance_index VALUES (?, ?, ?)');
    for (let t = nowMs - 12 * 24 * HOUR; t < nowMs - 2 * 24 * HOUR; t += HOUR) {
      insert.run(`tok-${t}`, new Date(t).toISOString(), new Date(t + 60_000).toISOString());
    }
    db.close();

    // A recording that has since landed on the share (test time zone is UTC).
    const start = new Date(nowMs - 10 * 60_000);
    const date = start.toISOString().slice(0, 10).replace(/-/g, '');
    const hour = start.toISOString().slice(11, 13);
    const token = `${date}_${hour}0000_LIVE`;
    const dir = path.join(cameraPath(camId), date, hour, token);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'recording.xml'),
      `<Recording RecordingToken="${token}"><StartTime>${start.toISOString()}</StartTime>` +
      `<StopTime>${new Date(start.getTime() + 60_000).toISOString()}</StopTime></Recording>`);

    const health = await getCameraHealth(camId, now);
    expect(health.reasons[0]).not.toMatch(/No recordings for/);
    expect(health.figures.lastRecordingEnd).toBe(new Date(start.getTime() + 60_000).toISOString());
  });
});
