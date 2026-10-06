#!/usr/bin/env node
// Builds data/cities.tsv — the offline world gazetteer used when a search
// matches no curated city. The app maps such a city to the nearest region of
// its country and labels the result as regional information.
//
// Source: GeoNames (CC BY 4.0) via the npm package all-the-cities (MIT).
// Dev-only; the output is committed, so this only needs re-running to refresh it:
//
//   npm i --no-save all-the-cities@3.1.0
//   node scripts/build-cities.js [--min-pop=5000]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DATA } from './lib.js';

const require = createRequire(import.meta.url);
const minPop = Number((process.argv.find(a => a.startsWith('--min-pop=')) || '=5000').split('=')[1]);

let cities;
try {
  cities = require('all-the-cities');
} catch {
  console.error('Missing dev dependency. Run: npm i --no-save all-the-cities@3.1.0');
  process.exit(1);
}

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Keep the most populous place per (country, name); always keep capitals and admin seats.
const best = new Map();
for (const c of cities) {
  const capital = /^PPL(C|A)$/.test(c.featureCode);
  if (c.population < minPop && !capital) continue;
  const key = c.country + '|' + norm(c.name);
  const prev = best.get(key);
  if (!prev || c.population > prev.population) best.set(key, c);
}
const rows = [...best.values()]
  .sort((a, b) => b.population - a.population)
  .map(c => {
    const [lon, lat] = c.loc.coordinates;
    return [c.name.replace(/[\t\n]/g, ' '), c.country, lat.toFixed(2), lon.toFixed(2), Math.round(c.population / 1000)].join('\t');
  });

const header = '# WhenToGo gazetteer · GeoNames (CC BY 4.0, https://www.geonames.org) via all-the-cities · columns: name, country (ISO 3166-1 alpha-2), lat, lon, population (thousands)\n';
const out = header + rows.join('\n') + '\n';
writeFileSync(join(DATA, 'cities.tsv'), out);
console.log(`Wrote data/cities.tsv: ${rows.length} places, ${(out.length / 1024).toFixed(0)} KB`);
