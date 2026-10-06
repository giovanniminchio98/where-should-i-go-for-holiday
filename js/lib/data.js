// Data loading: index.json first (small), continent files on demand.

const cache = new Map();

function getJson(url) {
  if (!cache.has(url)) {
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
}

export const state = { index: null, meta: null };

export async function init() {
  const [index, meta] = await Promise.all([getJson('data/index.json'), getJson('data/meta.json')]);
  state.index = index;
  state.meta = meta;
  return state;
}

export const countries = () => state.index.countries;
export const findCountry = iso2 => state.index.countries.find(c => c.iso2 === iso2?.toUpperCase());
export const findCountryByNum = num => state.index.countries.find(c => c.isoNum === num);

/** Full country record (with texts, climate, prices) from its continent file. */
export async function loadCountry(iso2) {
  const c = findCountry(iso2);
  if (!c) return null;
  const file = await getJson(`data/${c.file}.json`);
  return file.countries.find(k => k.iso2 === c.iso2) || null;
}

/** Load full data for several countries (deduplicating continent files). Returns Map iso2 → country. */
export async function loadCountries(iso2s) {
  const out = new Map();
  await Promise.all([...new Set(iso2s)].map(async iso => out.set(iso, await loadCountry(iso))));
  return out;
}

/** "IT.north" → { country, region } from the index. */
export function resolvePlace(key) {
  const [iso, id] = String(key).split('.');
  const country = findCountry(iso);
  if (!country) return null;
  const region = country.regions.find(r => r.id === id) || country.regions[0];
  return { country, region, key: `${country.iso2}.${region.id}` };
}
