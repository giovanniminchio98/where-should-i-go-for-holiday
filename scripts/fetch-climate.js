#!/usr/bin/env node
// Refreshes each region's monthly climate averages from the free Open-Meteo APIs,
// using the region's representative lat/lon (or seaLat/seaLon for sea temperature).
// Dev-only. No API key needed. Node 18+ (built-in fetch).
//
//   node scripts/fetch-climate.js                     all regions, 1991–2020, dry run
//   node scripts/fetch-climate.js --write             write results into data/*.json
//   node scripts/fetch-climate.js --only=IT,TH.north  limit to countries / regions
//   node scripts/fetch-climate.js --period=1991-2020  normals period (default)
//   node scripts/fetch-climate.js --no-sea            skip sea surface temperature
//   node scripts/fetch-climate.js --sea-years=3       years of marine data to average (default 3)
//
// Sources:
//   Historical weather (ERA5 reanalysis): https://open-meteo.com/en/docs/historical-weather-api
//     → avgHighC, avgLowC, rainMm, rainDays (days ≥ 1 mm), sunHours, humidity
//   Marine API: https://open-meteo.com/en/docs/marine-weather-api
//     → seaTempC (only for regions that already have a non-null seaTempC)
//
// Reanalysis grid cells are ~25 km, so values for coasts, mountains and small islands can
// differ from station normals by 1–2 °C. Always review the diff before using --write.
// Afterwards run: node scripts/build-index.js && node scripts/validate.js

import { writeFileSync } from 'node:fs';
import { loadMeta, loadContinents } from './lib.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const WRITE = !!args.write;
const ONLY = args.only ? String(args.only).split(',') : null;
const [Y0, Y1] = String(args.period || '1991-2020').split('-').map(Number);
const SEA = !args['no-sea'];
const SEA_YEARS = Number(args['sea-years'] || 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * 2 ** i); continue; }
    throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error('Too many retries: ' + url);
}

function monthlyFromDaily(time, values, reducer) {
  // reducer: 'mean' → mean of daily values per calendar month
  //          'sumPerYear' → total per month averaged over years
  //          'countPerYear' → count of days with value ≥ 1 per month averaged over years
  const acc = Array.from({ length: 12 }, () => ({ sum: 0, n: 0, years: new Set() }));
  time.forEach((t, i) => {
    const v = values[i];
    if (v == null) return;
    const m = Number(t.slice(5, 7)) - 1;
    const a = acc[m];
    a.years.add(t.slice(0, 4));
    if (reducer === 'countPerYear') a.sum += v >= 1 ? 1 : 0;
    else a.sum += v;
    a.n++;
  });
  return acc.map(a => {
    if (!a.n) return null;
    return reducer === 'mean' ? a.sum / a.n : a.sum / a.years.size;
  });
}

const round = (arr, digits = 0) => arr.map(v => (v == null ? null : Number(v.toFixed(digits))));

async function fetchLand(lat, lon) {
  const daily = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'sunshine_duration', 'relative_humidity_2m_mean'];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${Y0}-01-01&end_date=${Y1}-12-31&daily=${daily.join(',')}&timezone=GMT`;
  const j = await getJson(url);
  const d = j.daily;
  return {
    avgHighC: round(monthlyFromDaily(d.time, d.temperature_2m_max, 'mean')),
    avgLowC: round(monthlyFromDaily(d.time, d.temperature_2m_min, 'mean')),
    rainMm: round(monthlyFromDaily(d.time, d.precipitation_sum, 'sumPerYear')),
    rainDays: round(monthlyFromDaily(d.time, d.precipitation_sum, 'countPerYear')),
    sunHours: round(monthlyFromDaily(d.time, (d.sunshine_duration || []).map(s => (s == null ? null : s / 3600)), 'sumPerYear')),
    humidity: d.relative_humidity_2m_mean ? round(monthlyFromDaily(d.time, d.relative_humidity_2m_mean, 'mean')) : null,
  };
}

async function fetchSea(lat, lon) {
  const end = new Date().getUTCFullYear() - 1;
  const start = end - SEA_YEARS + 1;
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}-01-01&end_date=${end}-12-31&hourly=sea_surface_temperature&timezone=GMT`;
  const j = await getJson(url);
  const h = j.hourly;
  if (!h?.sea_surface_temperature?.some(v => v != null)) return null;
  return round(monthlyFromDaily(h.time, h.sea_surface_temperature, 'mean'));
}

function selected(iso2, id) {
  if (!ONLY) return true;
  return ONLY.some(s => s === iso2 || s === `${iso2}.${id}`);
}

// Compact JSON formatter matching the hand-written style of the data files:
// arrays of primitives and small flat objects stay on one line.
function fmt(v, indent = '') {
  const inner = indent + '  ';
  const flat = x => x === null || typeof x !== 'object';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(flat)) return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
    const flatObj = y => y && typeof y === 'object' && !Array.isArray(y) && Object.values(y).every(flat);
    const oneLine = v.every(x => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(y => flat(y) || flatObj(y) || (Array.isArray(y) && y.every(flat))));
    if (oneLine && v.every(x => Object.values(x).every(flat))) {
      const s = '[ ' + v.map(inlineObj).join(', ') + ' ]';
      if (s.length < 110) return s;
    }
    if (oneLine) return '[\n' + v.map(x => inner + inlineObj(x)).join(',\n') + '\n' + indent + ']';
    return '[\n' + v.map(x => inner + fmt(x, inner)).join(',\n') + '\n' + indent + ']';
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    if (!entries.length) return '{}';
    if (entries.every(([, x]) => flat(x)) && JSON.stringify(v).length < 90) return inlineObj(v);
    return '{\n' + entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner)}`).join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(v);
}
function inlineObj(o) {
  const val = x => Array.isArray(x) ? '[' + x.map(y => JSON.stringify(y)).join(', ') + ']'
    : x && typeof x === 'object' ? inlineObj(x) : JSON.stringify(x);
  return '{ ' + Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}: ${val(x)}`).join(', ') + ' }';
}

const meta = loadMeta();
let changedFiles = 0;
for (const c of loadContinents(meta)) {
  let changed = false;
  for (const k of c.json.countries) {
    for (const r of k.regions) {
      if (!selected(k.iso2, r.id)) continue;
      process.stdout.write(`${k.iso2}.${r.id} (${r.lat}, ${r.lon}) … `);
      try {
        const land = await fetchLand(r.lat, r.lon);
        let sea = r.climate.seaTempC;
        if (SEA && r.climate.seaTempC !== null) {
          await sleep(500);
          sea = (await fetchSea(r.seaLat ?? r.lat, r.seaLon ?? r.lon)) ?? r.climate.seaTempC;
        }
        const next = { ...r.climate, ...land, humidity: land.humidity ?? r.climate.humidity, seaTempC: sea };
        const diff = Object.keys(next).filter(key => JSON.stringify(next[key]) !== JSON.stringify(r.climate[key]));
        console.log(diff.length ? `changes in ${diff.join(', ')}` : 'no change');
        for (const key of diff) {
          console.log(`    ${key.padEnd(9)} old ${JSON.stringify(r.climate[key])}`);
          console.log(`    ${''.padEnd(9)} new ${JSON.stringify(next[key])}`);
        }
        if (diff.length) { r.climate = next; changed = true; }
      } catch (e) {
        console.log('FAILED: ' + e.message);
      }
      await sleep(1000);
    }
  }
  if (changed && WRITE) {
    writeFileSync(c.path, fmt(c.json) + '\n');
    changedFiles++;
    console.log(`→ wrote ${c.file}.json`);
  }
}
console.log(WRITE
  ? `Done. ${changedFiles} file(s) updated. Now run: node scripts/build-index.js && node scripts/validate.js`
  : 'Dry run complete. Re-run with --write to save changes.');
