// Season classification for a region. Works with both full region objects
// (continent JSON files) and the compact region objects in data/index.json,
// since both share the keys best / shoulder / worst / activityWindows / risks.

import { YEAR_DAYS, mmddToDoy, monthStartDoy, DAYS_IN_MONTH, inWindow, daysLeftInWindow, formatRange } from './dates.js';

export const NONE = 0, SHOULDER = 1, BEST = 2, WORST = 3;
export const CLASS_NAMES = ['na', 'shoulder', 'best', 'worst'];
/** Value of a day for scoring: best 1, shoulder 0.6, unclassified 0.35, worst 0. */
export const DAY_VALUE = [0.35, 0.6, 1, 0];

const cache = new WeakMap();

// Class codes are ordered by precedence, so overlapping windows resolve with Math.max.
function paint(arr, windows, cls) {
  for (const w of windows || []) {
    const a = mmddToDoy(w.from), b = mmddToDoy(w.to);
    const len = a <= b ? b - a + 1 : YEAR_DAYS - a + b + 1;
    for (let k = 0; k < len; k++) {
      const i = (a + k) % YEAR_DAYS;
      arr[i] = Math.max(arr[i], cls);
    }
  }
}

/**
 * Per-day classification (Uint8Array of 365). Precedence when windows overlap:
 * worst > best > shoulder > none.
 */
export function dayClasses(region) {
  let arr = cache.get(region);
  if (arr) return arr;
  arr = new Uint8Array(YEAR_DAYS);
  paint(arr, region.shoulder, SHOULDER);
  paint(arr, region.best, BEST);
  paint(arr, region.worst, WORST);
  cache.set(region, arr);
  return arr;
}

/** 52 week statuses. Week i covers days 7i..7i+6; the last week also takes day 364. */
export function weekClasses(region) {
  const days = dayClasses(region);
  const out = [];
  for (let w = 0; w < 52; w++) {
    const start = w * 7, end = w === 51 ? YEAR_DAYS - 1 : start + 6;
    const counts = [0, 0, 0, 0];
    for (let d = start; d <= end; d++) counts[days[d]]++;
    // Majority rule with severity tie-break: a week is "worst" if ≥3 of its days are worst,
    // otherwise the most common class wins (ties favour best > shoulder > none).
    let cls;
    if (counts[WORST] >= 3) cls = WORST;
    else cls = [BEST, SHOULDER, NONE, WORST].reduce((a, b) => (counts[b] > counts[a] ? b : a), BEST);
    out.push({ index: w, start, end, cls });
  }
  return out;
}

/** Average day value per month (0..1), used for map colouring. */
export function monthScores(region) {
  const days = dayClasses(region);
  const out = [];
  for (let m = 0; m < 12; m++) {
    const s = monthStartDoy(m);
    let sum = 0;
    for (let d = s; d < s + DAYS_IN_MONTH[m]; d++) sum += DAY_VALUE[days[d]];
    out.push(sum / DAYS_IN_MONTH[m]);
  }
  return out;
}

/** Dominant class per month (for chart background bands). */
export function monthClasses(region) {
  const days = dayClasses(region);
  const out = [];
  for (let m = 0; m < 12; m++) {
    const s = monthStartDoy(m);
    const counts = [0, 0, 0, 0];
    for (let d = s; d < s + DAYS_IN_MONTH[m]; d++) counts[days[d]]++;
    out.push(counts.indexOf(Math.max(...counts)));
  }
  return out;
}

export function scoreToClass(score) {
  if (score == null) return 'na';
  if (score >= 0.75) return 'best';
  if (score >= 0.45) return 'shoulder';
  return 'worst';
}

/** The window object (from best/shoulder/worst) that contains doy, or null. */
export function windowAt(region, doy) {
  const cls = dayClasses(region)[doy];
  const list = cls === BEST ? region.best : cls === WORST ? region.worst : cls === SHOULDER ? region.shoulder : null;
  if (!list) return { cls, window: null };
  const window = list.find(w => inWindow(doy, w.from, w.to)) || null;
  return { cls, window, daysLeft: window ? daysLeftInWindow(doy, window.from, window.to) : 0 };
}

/** One-line verdict, e.g. "Best: May 15 – Jun 30 & Sep 1 – Oct 10. Avoid: Aug 5 – Aug 25." */
export function verdict(region) {
  const fmt = ws => ws.map(w => formatRange(w.from, w.to)).join(' & ');
  const best = sortWindows(region.best);
  const worst = sortWindows(region.worst);
  return {
    best: best.length ? fmt(best) : null,
    avoid: worst.length ? fmt(worst) : null,
  };
}

export function sortWindows(ws = []) {
  return [...ws].sort((a, b) => mmddToDoy(a.from) - mmddToDoy(b.from));
}

/** Fraction of `days` (array of doy) covered by any of the windows. */
export function coverage(windows, days) {
  if (!windows || !windows.length || !days.length) return 0;
  let hit = 0;
  for (const d of days) if (windows.some(w => inWindow(d, w.from, w.to))) hit++;
  return hit / days.length;
}

/** Weighted monthly average of a 12-value climate series over a set of days. */
export function avgOverDays(series, days) {
  if (!series || !days.length) return null;
  let sum = 0, n = 0;
  for (const d of days) {
    let m = 0, s = 0;
    while (m < 11 && d >= s + DAYS_IN_MONTH[m]) { s += DAYS_IN_MONTH[m]; m++; }
    if (series[m] == null) continue;
    sum += series[m]; n++;
  }
  return n ? sum / n : null;
}
