#!/usr/bin/env node
// Validates every continent file in /data against the rules in data/SCHEMA.md
// (structure, types, value ranges and semantic checks), checks that
// data/index.json is in sync, and prints a coverage report.
//
//   node scripts/validate.js            validate everything
//   node scripts/validate.js --quiet    errors only, no coverage report
//
// Exits with code 1 if any error is found. Zero dependencies.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadMeta, loadContinents } from './lib.js';
import { buildIndex } from './build-index.js';
import { isValidMmdd, mmddToDoy, YEAR_DAYS } from '../js/core/dates.js';
import { ACTIVITIES } from '../js/core/score.js';
import { ANCHORS } from '../js/core/holidays.js';

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const PLACEHOLDER = /\b(TBD|TODO|FIXME|lorem|ipsum|placeholder|xxx)\b/i;
const isStr = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);

function checkStrings(obj, where) {
  if (typeof obj === 'string') {
    if (PLACEHOLDER.test(obj)) err(where, `placeholder text found: "${obj.slice(0, 60)}"`);
  } else if (Array.isArray(obj)) obj.forEach((v, i) => checkStrings(v, `${where}[${i}]`));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) checkStrings(v, `${where}.${k}`);
}

function checkWindow(w, where, { why = false, goodFor = false, minWhy = 20 } = {}) {
  if (!w || typeof w !== 'object') return err(where, 'window must be an object');
  if (!isValidMmdd(w.from)) err(where, `invalid "from" date ${JSON.stringify(w.from)} (expected MM-DD)`);
  if (!isValidMmdd(w.to)) err(where, `invalid "to" date ${JSON.stringify(w.to)} (expected MM-DD)`);
  if (why && !isStr(w.why, minWhy)) err(where, `"why" must be a sentence (≥ ${minWhy} chars)`);
  if (goodFor && w.goodFor !== undefined) {
    if (!Array.isArray(w.goodFor)) err(where, '"goodFor" must be an array');
    else for (const a of w.goodFor) if (!ACTIVITIES.includes(a)) err(where, `unknown activity "${a}" in goodFor`);
  }
}

function checkSeries(arr, where, { min, max, nullable = false, int = false }) {
  if (arr === null && nullable) return;
  if (!Array.isArray(arr) || arr.length !== 12) return err(where, 'must be an array of 12 monthly values' + (nullable ? ' or null' : ''));
  arr.forEach((v, i) => {
    if (!isNum(v)) err(`${where}[${i}]`, 'must be a number');
    else if (v < min || v > max) err(`${where}[${i}]`, `${v} outside plausible range ${min}…${max}`);
    else if (int && !isInt(v)) err(`${where}[${i}]`, 'must be an integer');
  });
}

function windowDays(ws) {
  const s = new Set();
  for (const w of ws || []) {
    if (!isValidMmdd(w.from) || !isValidMmdd(w.to)) continue;
    const a = mmddToDoy(w.from), b = mmddToDoy(w.to);
    const len = a <= b ? b - a + 1 : YEAR_DAYS - a + b + 1;
    for (let k = 0; k < len; k++) s.add((a + k) % YEAR_DAYS);
  }
  return s;
}

function checkRegion(r, where, fx) {
  if (!/^[a-z0-9-]+$/.test(r.id || '')) err(where, `region id "${r.id}" must be a lowercase slug`);
  if (!isStr(r.name)) err(where, 'missing name');
  if (!isStr(r.description, 10)) err(where, 'missing description');
  if (!isNum(r.lat) || r.lat < -90 || r.lat > 90) err(where, 'lat must be a number in −90…90');
  if (!isNum(r.lon) || r.lon < -180 || r.lon > 180) err(where, 'lon must be a number in −180…180');
  if (!Array.isArray(r.tags) || !r.tags.every(t => isStr(t))) err(where, 'tags must be an array of strings');

  for (const kind of ['best', 'worst', 'shoulder']) {
    if (!Array.isArray(r[kind])) { err(where, `"${kind}" must be an array`); continue; }
    // Shoulder periods are transitions, so a short note is enough; best/worst need a real reason.
    r[kind].forEach((w, i) => checkWindow(w, `${where}.${kind}[${i}]`, { why: true, goodFor: kind === 'best', minWhy: kind === 'shoulder' ? 10 : 20 }));
  }
  if (Array.isArray(r.best) && !r.best.length) err(where, 'needs at least one "best" window');
  if (Array.isArray(r.worst) && !r.worst.length) warn(where, 'no "worst" window');

  const best = windowDays(r.best), worst = windowDays(r.worst);
  const overlap = [...best].filter(d => worst.has(d)).length;
  if (overlap) err(where, `best and worst windows overlap on ${overlap} day(s)`);
  const covered = new Set([...best, ...worst, ...windowDays(r.shoulder)]).size;
  if (covered < 200) warn(where, `only ${covered}/365 days are classified as best/shoulder/worst`);

  if (!r.activityWindows || typeof r.activityWindows !== 'object') err(where, 'missing activityWindows');
  else for (const [a, ws] of Object.entries(r.activityWindows)) {
    if (!ACTIVITIES.includes(a)) err(where, `unknown activity "${a}" (allowed: ${ACTIVITIES.join(', ')})`);
    if (!Array.isArray(ws) || !ws.length) err(`${where}.activityWindows.${a}`, 'must be a non-empty array');
    else ws.forEach((w, i) => checkWindow(w, `${where}.activityWindows.${a}[${i}]`));
  }

  const c = r.climate;
  if (!c) err(where, 'missing climate');
  else {
    checkSeries(c.avgHighC, `${where}.climate.avgHighC`, { min: -40, max: 50 });
    checkSeries(c.avgLowC, `${where}.climate.avgLowC`, { min: -50, max: 40 });
    checkSeries(c.rainMm, `${where}.climate.rainMm`, { min: 0, max: 2500 });
    checkSeries(c.rainDays, `${where}.climate.rainDays`, { min: 0, max: 31 });
    checkSeries(c.sunHours, `${where}.climate.sunHours`, { min: 0, max: 450 });
    checkSeries(c.seaTempC, `${where}.climate.seaTempC`, { min: -2, max: 35, nullable: true });
    checkSeries(c.humidity, `${where}.climate.humidity`, { min: 0, max: 100, nullable: true });
    if (Array.isArray(c.avgHighC) && Array.isArray(c.avgLowC))
      c.avgHighC.forEach((h, i) => { if (c.avgLowC[i] > h) err(`${where}.climate`, `month ${i + 1}: low (${c.avgLowC[i]}) above high (${h})`); });
    if (c.seaTempC === null && (r.tags || []).includes('beach')) warn(where, 'tagged "beach" but seaTempC is null');
  }
  checkSeries(r.crowds, `${where}.crowds`, { min: 1, max: 5, int: true });

  if (!Array.isArray(r.risks)) err(where, '"risks" must be an array');
  else r.risks.forEach((x, i) => {
    const w = `${where}.risks[${i}]`;
    if (!isStr(x.type)) err(w, 'missing type');
    if (!isStr(x.note, 10)) err(w, 'missing note');
    checkWindow(x, w);
  });

  if (!Array.isArray(r.recurringHolidays)) err(where, '"recurringHolidays" must be an array');
  else r.recurringHolidays.forEach((h, i) => {
    const w = `${where}.recurringHolidays[${i}]`;
    if (!isStr(h.name)) err(w, 'missing name');
    if (!isStr(h.approx)) err(w, 'missing approx');
    if (!isStr(h.effect, 10)) err(w, 'missing effect');
    if (h.moving) {
      if (!ANCHORS.includes(h.moving.anchor)) err(w, `unknown anchor "${h.moving.anchor}" (allowed: ${ANCHORS.join(', ')})`);
      if (!isInt(h.moving.offsetDays)) err(w, 'moving.offsetDays must be an integer');
      if (!isInt(h.moving.durationDays) || h.moving.durationDays < 1) err(w, 'moving.durationDays must be an integer ≥ 1');
    }
    if (h.dates) checkWindow(h.dates, `${w}.dates`);
  });

  const p = r.prices;
  if (!p) err(where, 'missing prices');
  else {
    if (!fx.rates[p.currency]) err(`${where}.prices`, `currency "${p.currency}" missing from meta.json exchange rates`);
    if (!isInt(p.referenceYear) || p.referenceYear < 2020) err(`${where}.prices`, 'referenceYear must be a year');
    for (const k of ['budgetPerDay', 'midrangePerDay', 'hotelNightMid']) {
      const b = p[k];
      if (!b || !['low', 'shoulder', 'high'].every(s => isNum(b[s]) && b[s] > 0)) err(`${where}.prices.${k}`, 'needs positive low/shoulder/high numbers');
      else if (!(b.low <= b.shoulder && b.shoulder <= b.high)) err(`${where}.prices.${k}`, 'expected low ≤ shoulder ≤ high');
    }
    if (!isStr(p.notes, 10)) warn(`${where}.prices`, 'no notes');
  }
}

function checkCountry(k, where, continentName, fx, seen) {
  if (!/^[A-Z]{2}$/.test(k.iso2 || '')) err(where, 'iso2 must be two uppercase letters');
  if (seen.iso2.has(k.iso2)) err(where, `duplicate iso2 ${k.iso2}`);
  seen.iso2.add(k.iso2);
  if (!/^\d{3}$/.test(k.isoNum || '')) err(where, 'isoNum must be a 3-digit ISO 3166-1 numeric code string');
  if (!isStr(k.name)) err(where, 'missing name');
  if (!Array.isArray(k.aliases)) err(where, 'aliases must be an array');
  if (k.continent !== continentName) err(where, `continent "${k.continent}" does not match file continent "${continentName}"`);
  if (!isStr(k.flag)) err(where, 'missing flag');
  if (!isStr(k.summary, 80)) err(where, 'summary must be a paragraph (≥ 80 chars)');
  if (typeof k.splitByRegion !== 'boolean') err(where, 'splitByRegion must be boolean');
  if (!Array.isArray(k.regions) || !k.regions.length) return err(where, 'needs at least one region');
  if (k.splitByRegion === false) {
    if (k.regions.length !== 1) err(where, 'splitByRegion=false requires exactly one region');
    if (!isStr(k.splitReason, 20)) err(where, 'splitByRegion=false requires "splitReason" explaining why the country is climatically uniform');
  }
  if (k.splitByRegion === true && k.regions.length < 2) err(where, 'splitByRegion=true requires 2+ regions');

  const ids = new Set();
  k.regions.forEach((r, i) => {
    if (ids.has(r.id)) err(where, `duplicate region id "${r.id}"`);
    ids.add(r.id);
    checkRegion(r, `${where} › ${r.id || `regions[${i}]`}`, fx);
  });

  if (!Array.isArray(k.cities)) err(where, 'cities must be an array');
  else k.cities.forEach((c, i) => {
    if (!isStr(c.name)) err(`${where}.cities[${i}]`, 'missing name');
    if (!Array.isArray(c.aliases)) err(`${where}.cities[${i}]`, 'aliases must be an array');
    if (!ids.has(c.region)) err(`${where}.cities[${i}]`, `unknown region "${c.region}"`);
  });
  if (!Array.isArray(k.links) || k.links.length < 2) err(where, 'needs at least 2 links');
  else k.links.forEach((l, i) => {
    if (!isStr(l.label)) err(`${where}.links[${i}]`, 'missing label');
    if (!/^https:\/\//.test(l.url || '')) err(`${where}.links[${i}]`, 'url must be https');
  });
  if (!isInt(k.dataYear)) err(where, 'dataYear must be an integer');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k.lastReviewed || '')) err(where, 'lastReviewed must be YYYY-MM');
  checkStrings(k, where);
}

const meta = loadMeta();
const fx = meta.exchangeRates;
const seen = { iso2: new Set() };
const report = [];

for (const c of loadContinents(meta)) {
  if (c.json.continent !== c.name) err(c.file, `"continent" should be "${c.name}"`);
  if (!Array.isArray(c.json.countries)) { err(c.file, 'missing countries array'); continue; }
  for (const k of c.json.countries) {
    checkCountry(k, `${c.file}.json › ${k.iso2 || k.name}`, c.name, fx, seen);
    report.push({ continent: c.name, iso2: k.iso2, name: k.name, regions: (k.regions || []).length });
  }
}

const indexPath = join(DATA, 'index.json');
if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== buildIndex())
  err('index.json', 'out of date — run: node scripts/build-index.js');

if (!process.argv.includes('--quiet')) {
  console.log('\nCoverage report');
  console.log('───────────────');
  const byCont = {};
  for (const r of report) (byCont[r.continent] ||= []).push(r);
  for (const [cont, list] of Object.entries(byCont)) {
    console.log(`${cont}: ${list.length} countr${list.length === 1 ? 'y' : 'ies'}, ${list.reduce((s, r) => s + r.regions, 0)} regions`);
    for (const r of list) console.log(`  ${r.iso2}  ${r.name.padEnd(28)} ${r.regions} region${r.regions === 1 ? '' : 's'}`);
  }
  console.log(`Total: ${report.length} countries, ${report.reduce((s, r) => s + r.regions, 0)} regions\n`);
  if (warnings.length) {
    console.log(`${warnings.length} warning(s):`);
    for (const w of warnings) console.log('  ⚠ ' + w);
  }
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('✓ All data files valid.');
