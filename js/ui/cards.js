// Shared bits of markup and small stores for saved places and the compare list.
import { esc, store, toast } from '../lib/util.js';
import { t, ACTIVITY_ICON } from '../lib/strings.js';
import { priceLevel } from '../core/score.js';

export function activityChip(a, small = false) {
  return `<span class="badge" title="${esc(t('act.' + a))}">${ACTIVITY_ICON[a] || ''}${small ? '' : ' ' + esc(t('act.' + a))}</span>`;
}

export function priceBadge(midEur) {
  const lvl = priceLevel(midEur);
  if (!lvl) return '';
  const label = ['', 'Budget-friendly', 'Mid-priced', 'Expensive'][lvl];
  return `<span class="badge" title="${label}: about €${midEur}/day mid-range" aria-label="${label}">${'€'.repeat(lvl)}<span style="opacity:.3">${'€'.repeat(3 - lvl)}</span></span>`;
}

export const placeKey = (country, region) => `${country.iso2}.${region.id}`;
export const placeHref = (country, region) => `#/country/${country.iso2}/${region.id}`;
export const deg = v => (v == null ? '–' : `${Math.round(v)}°C`);

// ── Saved places (favourites) ─────────────────────────
export const favs = {
  all: () => store.get('favs', []),
  has: key => favs.all().includes(key),
  toggle(key) {
    const list = favs.all();
    const on = !list.includes(key);
    store.set('favs', on ? [key, ...list] : list.filter(k => k !== key));
    toast(on ? 'Saved to your shortlist' : 'Removed from your shortlist');
    return on;
  },
};

// ── Compare list (max 4) ─────────────────────────────
export const compareList = {
  all: () => store.get('compare', []),
  set: list => store.set('compare', list.slice(0, 4)),
  add(key) {
    const list = compareList.all().filter(k => k !== key);
    list.push(key);
    const trimmed = list.slice(-4);
    compareList.set(trimmed);
    return trimmed;
  },
};

export function favButton(key, small = true) {
  const on = favs.has(key);
  return `<button class="btn${small ? ' small' : ''}" type="button" data-fav="${esc(key)}" aria-pressed="${on}">${on ? '★ Saved' : '☆ Save'}</button>`;
}

/** Delegated handler for [data-fav] buttons inside root. */
export function wireFavButtons(root, after, signal) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    const on = favs.toggle(b.dataset.fav);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = on ? '★ Saved' : '☆ Save';
    after?.(b.dataset.fav, on);
  }, { signal });
}
