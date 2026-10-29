/**
 * Per-camera health for the Maintenance Status page, derived only from the
 * recording history already in each camera's index (read-only).
 *
 * Two rules, both relative to the camera's own previous 7 complete days:
 *  - activity: recordings today up to now vs the median of the same window
 *  - recency:  time since the last recording vs 1.5 × the longest normal gap
 * See specs/001-camera-health-status/data-model.md for the full rules.
 */

import { existsSync } from 'fs';
import config from '../config.js';
import { getRecordingHistory } from './dbService.js';
import { dbPath, listDates } from './storageService.js';
import { scanRecordingsForDate } from './xmlService.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The single place for every health threshold (FR-006). Not configurable
// from the UI or any request.
// Activity values were tuned on the 29 Sep – 20 Oct 2026 production replay
// (research.md R4): lower minimums flagged normal low-count mornings and
// weekends on healthy cameras.
export const HEALTH_THRESHOLDS = Object.freeze({
  baselineDays: 7,
  activityMinMedianForZero: 10,
  activityCriticalRatio: 0.25,
  activityCriticalMinMedian: 20,
  activityWarnRatio: 0.4,
  activityWarnMinMedian: 20,
  recencyGapMultiplier: 1.5,
  recencyMinMs: 2 * HOUR,
  cacheTtlMs: 60 * 1000,
});

const SEVERITY = { unknown: 0, ok: 1, warn: 2, critical: 3 };

export function worstLevel(levels) {
  return levels.reduce((worst, l) => (SEVERITY[l] > SEVERITY[worst] ? l : worst), 'unknown');
}

// ── Local-time helpers (Intl only; no date library) ──────────────────────────

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formatters.get(timeZone);
}

function localParts(ms, timeZone) {
  const p = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
}

// Offset of `timeZone` from UTC at instant `ms` (to the second).
function tzOffsetMs(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Instant of local midnight on the local calendar day `dayOffset` days from
// the one containing `ms`.
export function startOfLocalDay(ms, timeZone, dayOffset = 0) {
  const p = localParts(ms, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day + dayOffset);
  const guess = wall - tzOffsetMs(wall, timeZone);
  return wall - tzOffsetMs(guess, timeZone);
}

// YYYYMMDD of the local calendar day containing `ms` (the date-folder format).
function localDateFolder(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

function localTimeOfDay(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

// ── Evaluation (pure) ────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function result(level, reasons, nowMs, figures = {}) {
  return {
    level,
    reasons,
    evaluatedAt: new Date(nowMs).toISOString(),
    figures: {
      todayCount: 0,
      usualCount: null,
      completeDays: 0,
      lastRecordingEnd: null,
      longestGapMs: null,
      recencyThresholdMs: null,
      ...figures,
    },
  };
}

/**
 * @param {{earliestStart: string|null, recordings: {startTime: string, stopTime: string|null}[]}|null} history
 * @param {Date|number} now
 * @param {{timeZone?: string, thresholds?: typeof HEALTH_THRESHOLDS}} [opts]
 */
export function evaluateHealth(history, now, { timeZone = 'UTC', thresholds = HEALTH_THRESHOLDS } = {}) {
  const t = thresholds;
  const nowMs = typeof now === 'number' ? now : now.getTime();

  if (!history) return result('unknown', ['recording data unavailable'], nowMs);

  let skipped = 0;
  const recs = [];
  for (const r of history.recordings) {
    const start = Date.parse(r.startTime);
    if (Number.isNaN(start)) { skipped++; continue; }
    if (start > nowMs) continue;
    const stop = r.stopTime ? Date.parse(r.stopTime) : NaN;
    const end = Number.isNaN(stop) ? start : Math.min(Math.max(stop, start), nowMs);
    recs.push({ start, end });
  }
  if (skipped) console.warn(`[healthService] skipped ${skipped} recording(s) with an unparsable start time`);
  recs.sort((a, b) => a.start - b.start);

  const earliest = history.earliestStart ? Date.parse(history.earliestStart) : NaN;
  if (recs.length === 0) {
    if (Number.isNaN(earliest) || earliest > nowMs) return result('unknown', ['no recordings found'], nowMs);
    return result('critical', [`No recordings for more than ${t.baselineDays} days`], nowMs);
  }

  const todayStart = startOfLocalDay(nowMs, timeZone);
  const sinceMidnight = nowMs - todayStart;
  const dayStarts = [];
  for (let i = 1; i <= t.baselineDays; i++) dayStarts.push(startOfLocalDay(nowMs, timeZone, -i));
  const baselineStart = dayStarts[dayStarts.length - 1];

  // A day is complete only if the index already held recordings before it
  // began — excludes a new camera's first day and the retention boundary.
  const completeDays = Number.isNaN(earliest) ? 0 : dayStarts.filter(ds => ds >= earliest).length;

  const countBetween = (from, to) => recs.filter(r => r.start >= from && r.start < to).length;
  const todayCount = recs.filter(r => r.start >= todayStart).length;

  // Typical longest gap: each baseline day's longest gap between consecutive
  // recordings (assigned to the day the earlier recording started), then the
  // median across days — so one past outage can't loosen the threshold for a
  // week, and an ongoing outage (open trailing gap) never counts at all.
  const dailyLongest = new Map();
  for (let i = 1; i < recs.length; i++) {
    const prev = recs[i - 1];
    if (prev.start < baselineStart || prev.start >= todayStart) continue;
    const day = dayStarts.find(ds => prev.start >= ds);
    const gap = Math.max(0, recs[i].start - prev.end);
    if (!dailyLongest.has(day) || gap > dailyLongest.get(day)) dailyLongest.set(day, gap);
  }
  const longestGapMs = dailyLongest.size ? median([...dailyLongest.values()]) : null;
  const recencyThresholdMs = longestGapMs === null
    ? t.recencyMinMs
    : Math.max(t.recencyMinMs, t.recencyGapMultiplier * longestGapMs);
  const lastEnd = recs.reduce((m, r) => Math.max(m, r.end), 0);
  const sinceLast = nowMs - lastEnd;

  // Every rule that ran explains itself, so an ok label has a reason too.
  // Problems come first, then "learning", then the rules that passed.
  const levels = [];
  const problems = [];
  const passed = [];
  const learning = completeDays < t.baselineDays;

  let usualCount = null;
  if (!learning) {
    usualCount = median(dayStarts.map(ds => countBetween(ds, ds + sinceMidnight)));
    let activity = 'ok';
    if (usualCount >= t.activityMinMedianForZero && todayCount === 0) activity = 'critical';
    else if (usualCount >= t.activityCriticalMinMedian && todayCount < t.activityCriticalRatio * usualCount) activity = 'critical';
    else if (usualCount >= t.activityWarnMinMedian && todayCount < t.activityWarnRatio * usualCount) activity = 'warn';
    levels.push(activity);
    const text = `${todayCount} recording${todayCount === 1 ? '' : 's'} today; usually ~${Math.round(usualCount)} by ${localTimeOfDay(nowMs, timeZone)}`;
    (activity === 'ok' ? passed : problems).push(text);
  }

  const recencyCritical = sinceLast > recencyThresholdMs;
  if (recencyCritical) {
    levels.push('critical');
    problems.unshift(longestGapMs === null
      ? `No recordings for ${formatDuration(sinceLast)} (limit ${formatDuration(recencyThresholdMs)})`
      : `No recordings for ${formatDuration(sinceLast)}; normally at most ~${formatDuration(longestGapMs)} apart`);
  } else {
    if (!learning) levels.push('ok');
    passed.unshift(`Last recording ${formatDuration(sinceLast)} ago; alert after ${formatDuration(recencyThresholdMs)}`);
  }

  const reasons = [...problems, ...(learning ? [`learning (${completeDays} of ${t.baselineDays} days)`] : []), ...passed];

  return result(worstLevel(levels), reasons, nowMs, {
    todayCount,
    usualCount,
    completeDays,
    lastRecordingEnd: new Date(lastEnd).toISOString(),
    longestGapMs,
    recencyThresholdMs,
  });
}

// ── Reads + memoisation ──────────────────────────────────────────────────────

const cache = new Map();

export function clearHealthCache() {
  cache.clear();
}

// A managed camera's index_[managed].db is only rebuilt hourly, but its
// recordings can land on the share at any time — the S3 sync delivers a
// backlog of days in one burst — and playback scans the folders live. So
// re-scan the date folders from the index's newest recording on and merge
// them in; otherwise health reports a multi-day outage for up to an hour
// while playback already shows today's footage. A native index.db is kept
// live by the camera itself and needs none of this.
async function withLiveTail(cameraId, history, sinceIso, timeZone) {
  if (!history || existsSync(dbPath(cameraId))) return history;

  const lastStart = Date.parse(history.recordings.at(-1)?.startTime);
  const fromMs = Number.isNaN(lastStart) ? Date.parse(sinceIso) : lastStart;
  // One day earlier tolerates the camera's folder time zone differing from
  // HEALTH_TIMEZONE.
  const fromDate = localDateFolder(fromMs - DAY, timeZone);
  const dates = (await listDates(cameraId)).filter(d => d >= fromDate);
  if (dates.length === 0) return history;

  const byStart = new Map(history.recordings.map(r => [r.startTime, r]));
  for (const date of dates) {
    for (const rec of await scanRecordingsForDate(cameraId, date)) {
      if (!rec.startTime || rec.startTime < sinceIso) continue;
      byStart.set(rec.startTime, { startTime: rec.startTime, stopTime: rec.stopTime ?? null });
    }
  }
  const recordings = [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { earliestStart: history.earliestStart ?? recordings[0]?.startTime ?? null, recordings };
}

// Never throws: an unexpected error is logged and reported as null (the
// client shows it as unknown), and is cached like any other result so a
// broken index logs at most once per TTL.
export async function getCameraHealth(cameraId, now = new Date()) {
  const nowMs = now.getTime();
  const hit = cache.get(cameraId);
  if (hit && nowMs - hit.at < HEALTH_THRESHOLDS.cacheTtlMs) return hit.value;

  let value;
  try {
    const timeZone = config.healthTimeZone;
    const sinceIso = new Date(startOfLocalDay(nowMs, timeZone, -HEALTH_THRESHOLDS.baselineDays)).toISOString();
    const history = await withLiveTail(cameraId, getRecordingHistory(cameraId, sinceIso), sinceIso, timeZone);
    value = evaluateHealth(history, nowMs, { timeZone });
  } catch (err) {
    console.warn(`[healthService] health evaluation failed for ${cameraId}: ${err.message}`);
    value = null;
  }
  cache.set(cameraId, { at: nowMs, value });
  return value;
}
