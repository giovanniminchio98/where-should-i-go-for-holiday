// Offline world gazetteer (data/cities.tsv, ~47k places ≥ 5,000 people, GeoNames).
// Used only when a search doesn't match a curated city: the place is mapped to the
// nearest region of its country, using curated cities as anchors, and labelled as
// regional information.
import { countries, findCountry } from './data.js';

export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let rows = null;
let loading = null;
const anchorsByCountry = new Map();

export function gazetteerReady() { return !!rows; }

export function loadGazetteer() {
  if (rows) return Promise.resolve(rows);
  if (!loading) {
    loading = fetch('data/cities.tsv')
      .then(r => { if (!r.ok) throw new Error('cities ' + r.status); return r.text(); })
      .then(text => {
        const covered = new Set(countries().map(c => c.iso2));
        const out = [];
        for (const line of text.split('\n')) {
          if (!line || line[0] === '#') continue;
          const [name, cc, lat, lon, pop] = line.split('\t');
          if (!covered.has(cc)) continue;
          out.push({ name, n: norm(name), cc, lat: +lat, lon: +lon, pop: +pop });
        }
        rows = out;
        return rows;
      })
      .catch(e => { loading = null; throw e; });
  }
  return loading;
}

/** Curated city names (and aliases) per country, normalised, to avoid duplicate results. */
const curatedNames = new Map();
function curatedFor(cc) {
  if (!curatedNames.has(cc)) {
    const c = findCountry(cc);
    curatedNames.set(cc, new Set((c?.cities || []).flatMap(x => [x.name, ...x.aliases]).map(norm)));
  }
  return curatedNames.get(cc);
}

/** Anchor points for a country: region reference points plus every curated city found in the gazetteer. */
function anchors(cc) {
  if (anchorsByCountry.has(cc)) return anchorsByCountry.get(cc);
  const c = findCountry(cc);
  const list = c.regions.map(r => ({ lat: r.lat, lon: r.lon, region: r.id }));
  const byName = new Map();
  for (const row of rows) if (row.cc === cc && !byName.has(row.n)) byName.set(row.n, row);
  const reps = list.slice();
  const KM2 = (1200 / 111) ** 2; // ~1,200 km in squared degrees
  for (const city of c.cities) {
    for (const nm of [city.name, ...city.aliases]) {
      const hit = byName.get(norm(nm));
      if (!hit) continue;
      // Guard against homonyms (e.g. the town of Mount Rainier, Maryland): ignore a match that is
      // far from its own region's reference point while closer to another region's.
      const own = reps.find(a => a.region === city.region);
      const nearest = reps.reduce((m, a) => (dist2(hit, a) < dist2(hit, m) ? a : m));
      if (nearest.region !== city.region && dist2(hit, own) > KM2) continue;
      list.push({ lat: hit.lat, lon: hit.lon, region: city.region });
      break;
    }
  }
  anchorsByCountry.set(cc, list);
  return list;
}

function dist2(a, b) {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const y = b.lat - a.lat;
  return x * x + y * y;
}

/** Nearest region of the place's own country. */
export function regionForPlace(row) {
  const c = findCountry(row.cc);
  if (!c) return null;
  if (c.regions.length === 1) return c.regions[0];
  let best = null, bd = Infinity;
  for (const a of anchors(row.cc)) {
    const d = dist2(row, a);
    if (d < bd) { bd = d; best = a; }
  }
  return c.regions.find(r => r.id === best.region) || c.regions[0];
}

/** Exact and prefix matches (most populous first), excluding places already curated. */
export function searchGazetteer(q, limit = 6) {
  if (!rows) return [];
  const nq = norm(q);
  if (nq.length < 3) return [];
  const exact = [], prefix = [];
  for (const r of rows) {
    if (r.n === nq) exact.push(r);
    else if (prefix.length < 60 && r.n.startsWith(nq)) prefix.push(r);
  }
  return [...exact, ...prefix]
    .filter(r => !curatedFor(r.cc).has(r.n))
    .slice(0, limit);
}
