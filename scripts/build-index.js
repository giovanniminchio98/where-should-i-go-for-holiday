#!/usr/bin/env node
// Builds data/index.json — the lightweight file the app loads first. It holds
// every country's names, aliases, cities and a compact copy of each region's
// season windows and key climate series, which is enough for search, the map,
// the "right now" carousel and the finder without downloading the continent files.
//
//   node scripts/build-index.js          write data/index.json
//   node scripts/build-index.js --check  exit 1 if data/index.json is out of date

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadMeta, loadContinents } from './lib.js';
import { midEurPerDay } from '../js/core/prices.js';

const pick = ws => (ws || []).map(w => ({ from: w.from, to: w.to }));

export function buildIndex() {
  const meta = loadMeta();
  const countries = [];
  for (const c of loadContinents(meta)) {
    for (const k of c.json.countries) {
      countries.push({
        iso2: k.iso2,
        isoNum: k.isoNum,
        name: k.name,
        aliases: k.aliases,
        continent: k.continent,
        flag: k.flag,
        file: c.file,
        regions: k.regions.map(r => ({
          id: r.id,
          name: r.name,
          lat: r.lat,
          lon: r.lon,
          tags: r.tags,
          best: pick(r.best),
          shoulder: pick(r.shoulder),
          worst: pick(r.worst),
          activityWindows: Object.fromEntries(Object.entries(r.activityWindows || {}).map(([a, ws]) => [a, pick(ws)])),
          risks: (r.risks || []).map(x => ({ type: x.type, from: x.from, to: x.to })),
          climate: { avgHighC: r.climate.avgHighC, rainMm: r.climate.rainMm, seaTempC: r.climate.seaTempC ?? null },
          crowds: r.crowds,
          priceMidEur: midEurPerDay(r.prices, meta.exchangeRates),
        })),
        cities: k.cities,
      });
    }
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));
  // One country per line keeps diffs readable while staying compact.
  const body = countries.map(c => '    ' + JSON.stringify(c)).join(',\n');
  return `{\n  "dataVersion": ${JSON.stringify(meta.dataVersion)},\n  "countries": [\n${body}\n  ]\n}\n`;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const out = buildIndex();
  const path = join(DATA, 'index.json');
  if (process.argv.includes('--check')) {
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (cur !== out) {
      console.error('data/index.json is out of date. Run: node scripts/build-index.js');
      process.exit(1);
    }
    console.log('data/index.json is up to date.');
  } else {
    writeFileSync(path, out);
    console.log(`Wrote data/index.json (${(out.length / 1024).toFixed(1)} KB).`);
  }
}
