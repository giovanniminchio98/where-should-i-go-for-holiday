// "Where should I go?" scoring.
//
// For every region and a set of travel days D (day-of-year values, |D| = n):
//
//   seasonFit   = mean over D of dayValue(d), where dayValue is
//                 best 1.0 · shoulder 0.6 · unclassified 0.35 · worst 0.0
//   activityFit = mean over the chosen activities a of
//                 (share of D inside region.activityWindows[a]); 1 if no activity chosen.
//                 Regions with activityFit < 0.2 are dropped: they don't really offer
//                 what was asked for on those dates (e.g. Sri Lanka's east coast for a
//                 February beach trip).
//   riskLoad    = mean over D of the highest active risk severity that day
//                 (hurricane/typhoon/cyclone/monsoon 1.0 · flood/heat/fire/smoke/blizzard 0.6 · other 0.3)
//   crowdFit    = (5 − mean monthly crowd level over D) / 4      (0 = packed, 1 = empty)
//
//   base  = activities chosen ? 0.5·seasonFit + 0.5·activityFit : seasonFit
//   score = base − 0.15·riskLoad
//   if "avoid crowds":   score = 0.8·score + 0.2·crowdFit
//   if budget = budget:  score += 0.08·cheapness,  cheapness = clamp((250 − midEURperDay)/200, 0, 1)
//   if budget = luxury:  score += 0.03·(1 − cheapness)   (slight preference for places with luxury supply)
//   final = round(100 · clamp(score, 0, 1))
//
// "Flexible ±2 weeks" re-runs the score with the dates shifted by −14, −7, +7 and +14 days
// and keeps the best result, reporting the shift so the UI can suggest it.

import { dayClasses, DAY_VALUE, coverage, avgOverDays } from './season.js';
import { inWindow, YEAR_DAYS } from './dates.js';

export const ACTIVITIES = ['sun', 'beach', 'mountain', 'snow', 'city', 'nature', 'diving', 'roadtrip'];

const SEVERE = /hurricane|typhoon|cyclone|monsoon/i;
const MEDIUM = /flood|heat|fire|smoke|pollution|blizzard|cold|heavy rain|landslide/i;
export function riskSeverity(type) {
  if (SEVERE.test(type)) return 1;
  if (MEDIUM.test(type)) return 0.6;
  return 0.3;
}

export function cheapness(midEur) {
  if (midEur == null) return 0.5;
  return Math.min(1, Math.max(0, (250 - midEur) / 200));
}

export function priceLevel(midEur) {
  if (midEur == null) return null;
  if (midEur < 90) return 1;
  if (midEur < 180) return 2;
  return 3;
}

export function scoreRegion(region, days, opts = {}) {
  const n = days.length;
  if (!n) return null;
  const cls = dayClasses(region);

  let season = 0;
  for (const d of days) season += DAY_VALUE[cls[d]];
  const seasonFit = season / n;

  const acts = opts.activities || [];
  let activityFit = 1;
  const perActivity = {};
  if (acts.length) {
    let sum = 0;
    for (const a of acts) {
      const c = coverage(region.activityWindows?.[a], days);
      perActivity[a] = c;
      sum += c;
    }
    activityFit = sum / acts.length;
    if (activityFit < 0.2) return null;
  }

  let risk = 0;
  const activeRisks = new Set();
  for (const d of days) {
    let worst = 0;
    for (const r of region.risks || []) {
      if (inWindow(d, r.from, r.to)) {
        const s = riskSeverity(r.type);
        if (s > worst) worst = s;
        activeRisks.add(r.type);
      }
    }
    risk += worst;
  }
  const riskLoad = risk / n;

  const crowd = avgOverDays(region.crowds, days) ?? 3;
  const crowdFit = (5 - crowd) / 4;

  let score = (acts.length ? 0.5 * seasonFit + 0.5 * activityFit : seasonFit) - 0.15 * riskLoad;
  if (opts.avoidCrowds) score = 0.8 * score + 0.2 * crowdFit;
  if (opts.budget === 'budget') score += 0.08 * cheapness(region.priceMidEur);
  if (opts.budget === 'luxury') score += 0.03 * (1 - cheapness(region.priceMidEur));

  return {
    score: Math.round(100 * Math.min(1, Math.max(0, score))),
    seasonFit, activityFit, perActivity, riskLoad, crowd,
    risks: [...activeRisks],
    avgHigh: avgOverDays(region.climate?.avgHighC, days),
    avgSea: avgOverDays(region.climate?.seaTempC, days),
    avgRain: avgOverDays(region.climate?.rainMm, days),
  };
}

function shiftDays(days, k) {
  return days.map(d => (((d + k) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS);
}

/**
 * Rank every region of every country.
 * countries: array of index countries ({ iso2, name, continent, regions: [...] })
 * opts: { days, activities, continents, avoidCrowds, budget, flexible, limit }
 */
export function rankRegions(countries, opts) {
  const results = [];
  const shifts = opts.flexible ? [0, -7, 7, -14, 14] : [0];
  for (const c of countries) {
    if (opts.continents?.length && !opts.continents.includes(c.continent)) continue;
    for (const r of c.regions) {
      let best = null;
      for (const k of shifts) {
        const s = scoreRegion(r, k ? shiftDays(opts.days, k) : opts.days, opts);
        if (s && (!best || s.score > best.score)) best = { ...s, shift: k };
      }
      if (best) results.push({ country: c, region: r, ...best });
    }
  }
  results.sort((a, b) => b.score - a.score || (a.region.priceMidEur ?? 0) - (b.region.priceMidEur ?? 0));
  return opts.limit ? results.slice(0, opts.limit) : results;
}
