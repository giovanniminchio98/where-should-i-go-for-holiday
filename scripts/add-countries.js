#!/usr/bin/env node
// Merge country records into the continent files (replacing any existing entry
// with the same iso2), keeping countries sorted by name and the house formatting.
//
//   node scripts/add-countries.js path/to/countries.json [more.json …]
//
// Each input file holds one country or an array of countries, either in the full
// schema (data/SCHEMA.md) or in the compact authoring shorthand below, which is
// expanded to the full schema. Run build-index.js and validate.js afterwards.
//
// Shorthand country:
//   { iso2, num, name, aka: "Alias|Alias", cont: "Asia", flag, sum: "summary",
//     reason: "why uniform (single-region countries)", cur: "USD",
//     cities: "Name=regionId|alias|alias; Other=regionId",
//     hol: [...], risks: [...]            (applied to every region)
//     fcdo: "slug" | false, links: [["label", "https://…"]], regions: [R, …] }
// Shorthand region R:
//   { id, name, desc, ll: [lat, lon], tags: "beach,city",
//     best: [["MM-DD","MM-DD","why","beach,city"]], worst: [[from,to,why]], sh: [[from,to,why]],
//     act: "beach:06-15/09-10;city:04-01/06-30,09-01/10-31",
//     c: [hi[12], lo[12], rainMm[12], rainDays[12], sunHours[12], sea[12]|null, humidity[12]|null],
//     cr: [12 crowd levels], risks: [[type, from, to, note]],
//     hol: [[name, approx, effect, "MM-DD/MM-DD" | "anchor:offset:days" | ""]],
//     p: [budget lo, sh, hi, midrange lo, sh, hi, hotel lo, sh, hi], pn: "price notes", cur }

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadMeta, fmt } from './lib.js';

const tri = a => ({ low: a[0], shoulder: a[1], high: a[2] });
const win = ([from, to, why, good]) => {
  const w = { from, to };
  if (why) w.why = why;
  if (good) w.goodFor = good.split(',').map(s => s.trim()).filter(Boolean);
  return w;
};

function holiday(h) {
  if (!Array.isArray(h)) return h;
  const [name, approx, effect, spec] = h;
  const out = { name, approx, effect };
  if (spec && /^\d\d-\d\d\/\d\d-\d\d$/.test(spec)) {
    const [from, to] = spec.split('/');
    out.dates = { from, to };
  } else if (spec) {
    const [anchor, off, days] = spec.split(':');
    out.moving = { anchor, offsetDays: Number(off), durationDays: Number(days) };
  }
  return out;
}

const risk = r => (Array.isArray(r) ? { type: r[0], from: r[1], to: r[2], note: r[3] } : r);

function expandRegion(r, k) {
  if (!r.c) return r; // already full schema
  const act = {};
  for (const part of (r.act || '').split(';').map(s => s.trim()).filter(Boolean)) {
    const [a, spans] = part.split(':');
    act[a.trim()] = spans.split(',').map(s => { const [from, to] = s.trim().split('/'); return { from, to }; });
  }
  const [hi, lo, rain, rd, sun, sea, hum] = r.c;
  const out = {
    id: r.id || 'country',
    name: r.name || 'Whole country',
    description: r.desc,
    lat: r.ll[0],
    lon: r.ll[1],
    tags: (r.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    best: (r.best || []).map(win),
    worst: (r.worst || []).map(win),
    shoulder: (r.sh || []).map(win),
    activityWindows: act,
    climate: { avgHighC: hi, avgLowC: lo, rainMm: rain, rainDays: rd, sunHours: sun, seaTempC: sea ?? null, humidity: hum ?? null },
    crowds: r.cr,
    risks: [...(r.risks || []), ...(k.risks || [])].map(risk),
    recurringHolidays: [...(r.hol || []), ...(k.hol || [])].map(holiday),
    prices: {
      currency: r.cur || k.cur || (k.cont === 'Europe' ? 'EUR' : 'USD'),
      referenceYear: 2026,
      budgetPerDay: tri(r.p.slice(0, 3)),
      midrangePerDay: tri(r.p.slice(3, 6)),
      hotelNightMid: tri(r.p.slice(6, 9)),
      notes: r.pn,
    },
  };
  if (r.seaLL) { out.seaLat = r.seaLL[0]; out.seaLon = r.seaLL[1]; }
  return out;
}

function expandCountry(k) {
  if (!k.cont) return k; // already full schema
  const slug = s => s.replace(/ /g, '_');
  const links = (k.links || []).map(([label, url]) => ({ label, url }));
  links.push({ label: 'Travel guide (Wikivoyage)', url: `https://en.wikivoyage.org/wiki/${encodeURI(slug(k.wv || k.name))}` });
  if (k.fcdo !== false) {
    const f = k.fcdo || k.name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-');
    links.push({ label: 'Government travel advice (UK FCDO)', url: `https://www.gov.uk/foreign-travel-advice/${f}` });
    links.push({ label: 'Entry requirements', url: `https://www.gov.uk/foreign-travel-advice/${f}/entry-requirements` });
  }
  const regions = k.regions.map(r => expandRegion(r, k));
  const out = {
    iso2: k.iso2,
    isoNum: k.num,
    name: k.name,
    aliases: (k.aka || '').split('|').map(s => s.trim()).filter(Boolean),
    continent: k.cont,
    flag: k.flag,
    summary: k.sum,
    splitByRegion: regions.length > 1,
  };
  if (regions.length === 1) out.splitReason = k.reason;
  Object.assign(out, {
    regions,
    cities: (k.cities || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
      const [name, rest = ''] = s.split('=');
      const [region, ...aliases] = rest.split('|').map(x => x.trim());
      return { name: name.trim(), aliases, region: region || regions[0].id };
    }),
    links,
    dataYear: 2026,
    lastReviewed: '2026-10',
  });
  return out;
}

const meta = loadMeta();
const byContinent = new Map(meta.continents.map(c => [c.name, c]));
const incoming = process.argv.slice(2).flatMap(f => {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return (Array.isArray(j) ? j : [j]).map(expandCountry);
});
const touched = new Map();
for (const k of incoming) {
  const c = byContinent.get(k.continent);
  if (!c) throw new Error(`${k.iso2}: unknown continent "${k.continent}"`);
  if (!touched.has(c.file)) {
    const path = join(DATA, `${c.file}.json`);
    touched.set(c.file, { path, json: existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { continent: c.name, countries: [] } });
  }
  const t = touched.get(c.file).json;
  t.countries = t.countries.filter(x => x.iso2 !== k.iso2);
  t.countries.push(k);
}
for (const [file, { path, json }] of touched) {
  json.countries.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(path, fmt(json) + '\n');
  console.log(`${file}.json: ${json.countries.length} countries`);
}
console.log(`Merged ${incoming.length} countr${incoming.length === 1 ? 'y' : 'ies'}: ${incoming.map(k => k.iso2).join(' ')}`);
