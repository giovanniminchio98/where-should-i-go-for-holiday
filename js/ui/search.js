// Fuzzy search over countries, aliases, regions and cities (Fuse.js), as an
// accessible combobox with keyboard navigation and recent searches.
import { getFuse } from '../lib/libs.js';
import { countries, findCountry } from '../lib/data.js';
import { loadGazetteer, searchGazetteer, regionForPlace } from '../lib/gazetteer.js';
import { esc, store, debounce } from '../lib/util.js';
import { t } from '../lib/strings.js';

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let entries, fuse, fusePromise;

function buildEntries() {
  if (entries) return entries;
  entries = [];
  for (const c of countries()) {
    entries.push({ kind: 'country', label: c.name, aliases: c.aliases, flag: c.flag, path: c.continent, iso2: c.iso2, region: null, href: `#/country/${c.iso2}` });
    if (c.regions.length > 1) for (const r of c.regions) {
      entries.push({ kind: 'region', label: r.name, aliases: [], flag: c.flag, path: c.name, iso2: c.iso2, region: r.id, href: `#/country/${c.iso2}/${r.id}?hl=1` });
    }
    for (const city of c.cities) {
      const r = c.regions.find(x => x.id === city.region);
      entries.push({
        kind: 'city', label: city.name, aliases: city.aliases, flag: c.flag,
        path: c.regions.length > 1 ? `${c.name} › ${r.name}` : c.name,
        iso2: c.iso2, region: city.region, href: `#/country/${c.iso2}/${city.region}?hl=1`,
      });
    }
  }
  for (const e of entries) { e.n = norm(e.label); e.an = e.aliases.map(norm); }
  return entries;
}

function ensureFuse() {
  if (!fusePromise) {
    fusePromise = getFuse().then(Fuse => {
      fuse = new Fuse(buildEntries(), {
        keys: [{ name: 'n', weight: 3 }, { name: 'an', weight: 2 }],
        threshold: 0.32,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 2,
      });
    }).catch(() => { fusePromise = null; });
  }
  return fusePromise;
}

const KIND_RANK = { country: 0, city: 1, region: 2, place: 3 };

export function searchPlaces(q, limit = 8) {
  const nq = norm(q);
  if (!nq) return [];
  const list = buildEntries();
  // Exact and prefix matches always come first, so "Rio" finds Rio before fuzzy neighbours.
  const exact = list.filter(e => e.n === nq || e.an.includes(nq));
  const prefix = list.filter(e => !exact.includes(e) && (e.n.startsWith(nq) || e.an.some(a => a.startsWith(nq))));
  let fuzzy = [];
  if (fuse) fuzzy = fuse.search(nq, { limit: limit * 2 }).map(r => r.item);
  else fuzzy = list.filter(e => e.n.includes(nq) || e.an.some(a => a.includes(nq)));
  const seen = new Set();
  const sortKind = arr => arr.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  // Places from the world gazetteer (when loaded) rank above fuzzy guesses.
  const places = searchGazetteer(q, 5).map(placeEntry).filter(Boolean);
  return [...sortKind(exact), ...sortKind(prefix), ...places, ...fuzzy].filter(e => (seen.has(e) ? false : seen.add(e))).slice(0, limit);
}

/** A gazetteer place → search entry pointing at the nearest region, flagged as regional info. */
function placeEntry(row) {
  const c = findCountry(row.cc);
  const r = regionForPlace(row);
  if (!c || !r) return null;
  return {
    kind: 'place', label: row.name, aliases: [], flag: c.flag,
    path: c.regions.length > 1 ? `${c.name} › ${r.name}` : c.name,
    iso2: c.iso2, region: r.id, n: row.n, an: [],
    href: `#/country/${c.iso2}/${r.id}?city=${encodeURIComponent(row.name)}`,
  };
}

function matchedAlias(e, q) {
  const nq = norm(q);
  if (e.n.includes(nq)) return null;
  const i = e.an.findIndex(a => a.includes(nq) || nq.includes(a));
  return i >= 0 ? e.aliases[i] : null;
}

let uid = 0;
/**
 * Mount a search combobox in container.
 * opts.large, opts.placeholder, opts.onSelect(entry) (default: navigate), opts.recent (default true)
 */
export function mountSearch(container, opts = {}) {
  const id = 'search-' + ++uid;
  container.innerHTML = `
    <div class="search${opts.large ? ' large' : ''}">
      <label class="visually-hidden" for="${id}">${esc(opts.placeholder || t('home.search'))}</label>
      <input id="${id}" class="search-input" type="search" autocomplete="off" spellcheck="false"
        placeholder="${esc(opts.placeholder || t('home.search'))}"
        role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list">
      <ul class="search-list" id="${id}-list" role="listbox" hidden></ul>
    </div>`;
  const input = container.querySelector('input');
  const list = container.querySelector('ul');
  const useRecent = opts.recent !== false;
  let items = [];
  let active = -1;

  const select = e => {
    if (!e) return;
    if (useRecent) {
      const recent = store.get('recent', []).filter(r => r.href !== e.href);
      recent.unshift({ label: e.label, path: e.path, flag: e.flag, href: e.href, kind: e.kind, iso2: e.iso2, region: e.region });
      store.set('recent', recent.slice(0, 6));
    }
    close();
    input.value = '';
    input.blur();
    window.wtgResetZoom?.();
    if (opts.onSelect) opts.onSelect(e);
    else location.hash = e.href;
  };

  function render(q) {
    const recentMode = !q.trim();
    items = recentMode ? (useRecent ? store.get('recent', []) : []) : searchPlaces(q);
    active = items.length && !recentMode ? 0 : -1;
    if (recentMode && !items.length) return close();
    list.innerHTML = (recentMode ? `<li class="group" role="presentation">${t('search.recent')}</li>` : '') +
      (items.length ? items.map((e, i) => {
        const alias = recentMode ? null : matchedAlias(e, q);
        return `<li role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${i === active}">
          <span class="flag" aria-hidden="true">${e.flag}</span>
          <span><span class="main">${esc(e.label)}</span>${alias ? ` <span class="path">(${esc(alias)})</span>` : ''}
          <span class="path"> → ${esc(e.path)}</span></span>
          <span class="kind">${e.kind === 'place' ? 'regional info' : esc(e.kind)}</span></li>`;
      }).join('') : `<li class="empty" role="presentation">${t('search.none')}</li>`);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', active >= 0 ? `${id}-o${active}` : '');
  }
  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    for (const li of list.querySelectorAll('[role=option]')) li.setAttribute('aria-selected', String(Number(li.dataset.i) === active));
    input.setAttribute('aria-activedescendant', `${id}-o${active}`);
    list.querySelector(`#${id}-o${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  const update = debounce(() => render(input.value), 60);
  input.addEventListener('input', () => {
    ensureFuse().then(() => { if (document.activeElement === input) update(); });
    // The world gazetteer is only fetched once someone types a real query.
    if (input.value.trim().length >= 3) loadGazetteer().then(() => { if (document.activeElement === input) update(); }).catch(() => {});
    update();
  });
  input.addEventListener('focus', () => { ensureFuse(); render(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(input.value); else move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list.hidden) render(input.value); select(items[active] || items[0]); }
    else if (e.key === 'Escape') { if (!list.hidden) close(); else input.value = ''; }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const li = e.target.closest('[role=option]');
    if (li) select(items[Number(li.dataset.i)]);
  });
  return { input, focus: () => input.focus() };
}
