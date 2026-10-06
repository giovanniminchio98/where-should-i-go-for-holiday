// Saved places (shortlist), stored in localStorage.
import { resolvePlace } from '../lib/data.js';
import { esc } from '../lib/util.js';
import { verdict } from '../core/season.js';
import { stripHtml, attachStrips } from '../ui/strip.js';
import { favs, favButton, wireFavButtons, placeHref, priceBadge } from '../ui/cards.js';

export function render(main) {
  const places = favs.all().map(resolvePlace).filter(Boolean);
  main.innerHTML = `
  <div class="container">
    <header class="page-head">
      <p class="eyebrow">Your shortlist</p>
      <h1>Saved places</h1>
      <p class="muted">Saved on this device only.</p>
    </header>
    ${places.length ? `
      <p><a class="btn" href="#/compare?p=${places.slice(0, 4).map(p => p.key).join(',')}">⇆ Compare ${places.length > 4 ? 'the first 4' : 'these'}</a></p>
      <h2 class="visually-hidden">Places</h2><div class="plan-grid" id="saved-grid">${places.map(p => {
        const v = verdict(p.region);
        return `<article class="card place-card" data-key="${p.key}">
          <div class="top"><span class="flag" aria-hidden="true">${p.country.flag}</span>
            <div><h3><a href="${placeHref(p.country, p.region)}">${esc(p.region.name)}</a></h3><div class="country">${esc(p.country.name)}</div></div></div>
          <p class="small" style="margin:0"><b class="t-best">Best:</b> ${esc(v.best || '–')}</p>
          ${stripHtml(p.region, { mini: true, label: p.region.name })}
          <div class="chips">${priceBadge(p.region.priceMidEur)}${favButton(p.key)}</div>
        </article>`;
      }).join('')}</div>`
    : `<div class="card empty-state"><p><b>No saved places yet.</b></p><p>Tap “☆ Save” on any country page or finder result.</p></div>`}
  </div>`;
  const grid = main.querySelector('#saved-grid');
  if (!grid) return;
  attachStrips(grid, el => resolvePlace(el.closest('[data-key]').dataset.key).region);
  const ac = new AbortController();
  wireFavButtons(grid, (key, on) => { if (!on) grid.querySelector(`[data-key="${key}"]`)?.remove(); }, ac.signal);
  return () => ac.abort();
}
