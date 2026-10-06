#!/usr/bin/env node
// Dev-only unit tests for the shared core logic (dates, seasons, holidays, scoring).
// Run: node scripts/test.js

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DATA, readJson } from './lib.js';
import { mmddToDoy, doyToMmdd, inWindow, windowLength, daysBetween, formatRange } from '../js/core/dates.js';
import { dayClasses, weekClasses, BEST, WORST, verdict } from '../js/core/season.js';
import { rankRegions } from '../js/core/score.js';
import { easter, anchorDate, holidayDates } from '../js/core/holidays.js';
import { convert, inflationFactor } from '../js/core/prices.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
};
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const index = readJson(join(DATA, 'index.json'));
const region = (iso, id) => index.countries.find(c => c.iso2 === iso).regions.find(r => r.id === id);

console.log('dates');
test('MM-DD round trip', () => {
  for (let d = 0; d < 365; d++) assert.equal(mmddToDoy(doyToMmdd(d)), d);
  assert.equal(mmddToDoy('01-01'), 0);
  assert.equal(mmddToDoy('12-31'), 364);
  assert.equal(mmddToDoy('02-29'), mmddToDoy('02-28'));
});
test('year-wrapping windows', () => {
  assert.ok(inWindow(mmddToDoy('12-20'), '12-01', '02-28'));
  assert.ok(inWindow(mmddToDoy('01-15'), '12-01', '02-28'));
  assert.ok(!inWindow(mmddToDoy('03-15'), '12-01', '02-28'));
  assert.equal(windowLength('12-01', '02-28'), 31 + 31 + 28);
});
test('real date ranges expand across new year', () => {
  const days = daysBetween(new Date(2026, 11, 30), new Date(2027, 0, 2));
  assert.deepEqual(days, [363, 364, 0, 1]);
});
test('range formatting', () => {
  assert.equal(formatRange('05-15', '06-30'), 'May 15 – Jun 30');
  assert.equal(formatRange('08-05', '08-25'), 'Aug 5–25');
});

console.log('seasons');
test('Italy north: Ferragosto is worst, June is best', () => {
  const r = region('IT', 'north');
  assert.equal(dayClasses(r)[mmddToDoy('08-15')], WORST);
  assert.equal(dayClasses(r)[mmddToDoy('06-10')], BEST);
  assert.equal(weekClasses(r).length, 52);
});
test('Sri Lanka coasts run on opposite monsoons', () => {
  const sw = region('LK', 'southwest'), east = region('LK', 'east');
  const feb = mmddToDoy('02-10'), jul = mmddToDoy('07-10');
  assert.equal(dayClasses(sw)[feb], BEST);
  assert.notEqual(dayClasses(east)[feb], BEST);
  assert.equal(dayClasses(east)[jul], BEST);
  assert.notEqual(dayClasses(sw)[jul], BEST);
});
test('verdict text', () => {
  const v = verdict(region('IT', 'north'));
  assert.match(v.best, /May 15 – Jun 30/);
  assert.match(v.avoid, /Aug 5–25/);
});

console.log('holidays');
test('Easter dates', () => {
  assert.equal(ymd(easter(2026)), '2026-04-05');
  assert.equal(ymd(easter(2027)), '2027-03-28');
  assert.equal(ymd(easter(2030)), '2030-04-21');
});
test('US moving holidays', () => {
  assert.equal(ymd(anchorDate('thanksgivingUS', 2026)), '2026-11-26');
  assert.equal(ymd(anchorDate('memorialDayUS', 2026)), '2026-05-25');
  assert.equal(ymd(anchorDate('laborDayUS', 2026)), '2026-09-07');
  assert.equal(ymd(anchorDate('presidentsDayUS', 2027)), '2027-02-15');
});
test('Carnival 2027 (Easter −51, 6 days) covers Fat Tuesday', () => {
  const r = holidayDates({ moving: { anchor: 'easter', offsetDays: -51, durationDays: 6 } }, 2027);
  assert.equal(ymd(r.start), '2027-02-05');
  assert.equal(ymd(r.end), '2027-02-10'); // Ash Wednesday 2027
});
test('lunar table lookups and out-of-range years', () => {
  assert.equal(ymd(anchorDate('chineseNewYear', 2026)), '2026-02-17');
  assert.equal(anchorDate('chineseNewYear', 2040), null);
});

console.log('prices');
test('currency conversion and inflation', () => {
  const fx = { rates: { EUR: 1, USD: 1.17, GBP: 0.87 } };
  assert.equal(Math.round(convert(117, 'USD', 'EUR', fx)), 100);
  const meta = { inflation: { rates: { Europe: 0.03 } } };
  assert.equal(inflationFactor('Europe', 2026, 2026, meta), 1);
  assert.equal(inflationFactor('Europe', 2026, 2028, meta).toFixed(4), '1.0609');
});

console.log('finder');
test('"February, beach, Asia" ranks the right coasts and excludes Sri Lanka east', () => {
  const days = daysBetween(new Date(2027, 1, 1), new Date(2027, 1, 28));
  const res = rankRegions(index.countries, { days, activities: ['beach'], continents: ['Asia'] });
  const keys = res.map(r => `${r.country.iso2}.${r.region.id}`);
  assert.ok(keys.includes('TH.andaman'), 'Thailand Andaman present');
  assert.ok(keys.includes('LK.southwest'), 'Sri Lanka south-west present');
  assert.ok(!keys.includes('LK.east'), 'Sri Lanka east coast must not be returned');
  assert.ok(keys.indexOf('TH.andaman') < 10 && keys.indexOf('LK.southwest') < 10, 'both in the top 10: ' + keys.join(', '));
});
test('"July, beach, Asia" flips Sri Lanka to the east coast', () => {
  const days = daysBetween(new Date(2027, 6, 1), new Date(2027, 6, 31));
  const keys = rankRegions(index.countries, { days, activities: ['beach'], continents: ['Asia'] }).map(r => `${r.country.iso2}.${r.region.id}`);
  assert.ok(keys.includes('LK.east'));
  assert.ok(keys.indexOf('LK.east') < keys.indexOf('LK.southwest') || !keys.includes('LK.southwest'));
});
test('snow in January finds ski regions only', () => {
  const days = daysBetween(new Date(2027, 0, 10), new Date(2027, 0, 20));
  const res = rankRegions(index.countries, { days, activities: ['snow'] });
  assert.ok(res.length > 0);
  for (const r of res) assert.ok(r.region.activityWindows.snow, `${r.region.id} has a snow window`);
  const top = res.slice(0, 5).map(r => `${r.country.iso2}.${r.region.id}`);
  assert.ok(top.includes('US.rockies'), `Rockies in top 5: ${top}`);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
