// Compare 2–4 places side by side: #/compare?p=IT.north,TH.andaman
import { resolvePlace, loadCountries } from '../lib/data.js';
import { esc, replaceHash } from '../lib/util.js';
import { verdict, monthScores } from '../core/season.js';
import { MONTH_SHORT, todayDoy, monthOfDoy } from '../core/dates.js';
import { stripHtml, attachStrips, legendHtml } from '../ui/strip.js';
import { renderMiniClimate, destroyCharts } from '../ui/charts.js';
import { mountSearch } from '../ui/search.js';
import { compareList, placeHref, priceBadge, deg } from '../ui/cards.js';

export async function render(main, params) {
  const fromUrl = (params.get('p') || '').split(',').filter(Boolean);
  const keys = (fromUrl.length ? fromUrl : compareList.all()).map(resolvePlace).filter(Boolean).map(p => p.key);
  const unique = [...new Set(keys)].slice(0, 4);
  compareList.set(unique);
  if (!fromUrl.length && unique.length) replaceHash('#/compare?p=' + unique.join(','));

  main.innerHTML = `
  <div class="container">
    <header class="page-head">
      <p class="eyebrow">Compare</p>
      <h1>Side by side</h1>
      <p class="muted">Compare up to four places' seasons and climate. Add a country, region or city:</p>
      <div id="compare-search" style="max-width:480px"></div>
    </header>
    <div id="compare-body"></div>
  </div>`;

  const go = list => { location.hash = '#/compare?p=' + list.join(','); };
  mountSearch(main.querySelector('#compare-search'), {
    placeholder: 'Add a place to compare…',
    recent: false,
    onSelect: e => {
      const key = e.region ? `${e.iso2}.${e.region}` : resolvePlace(e.iso2).key;
      go(compareList.add(key));
    },
  });

  const body = main.querySelector('#compare-body');
  if (!unique.length) {
    body.innerHTML = `<div class="card empty-state"><p><b>Nothing to compare yet.</b></p><p>Search above, or use “Compare with…” on any country page.</p></div>`;
    return;
  }
  const places = unique.map(resolvePlace);
  const full = await loadCountries(places.map(p => p.country.iso2));
  if (!body.isConnected) return;
  const m = monthOfDoy(todayDoy());
  const regions = places.map(p => full.get(p.country.iso2).regions.find(r => r.id === p.region.id));

  body.innerHTML = `
    <div style="margin-bottom:14px">${legendHtml()}</div>
    <h2 class="visually-hidden">Places</h2>
    <div class="compare-grid">${places.map((p, i) => {
      const r = regions[i];
      const v = verdict(r);
      return `<article class="card compare-card" data-key="${p.key}">
        <div class="head"><span class="flag" aria-hidden="true">${p.country.flag}</span>
          <div style="flex:1"><h3><a href="${placeHref(p.country, p.region)}">${esc(r.name)}</a></h3><div class="small muted">${esc(p.country.name)}</div></div>
          <button class="icon-btn" type="button" data-remove="${p.key}" aria-label="Remove ${esc(r.name)}">✕</button></div>
        ${stripHtml(r, { mini: true, label: r.name })}
        <p class="small" style="margin:0"><b class="t-best">Best:</b> ${esc(v.best || '–')}<br><b class="t-worst">Avoid:</b> ${esc(v.avoid || '–')}</p>
        <div class="chart-wrap"><canvas role="img" aria-label="Temperature and rain for ${esc(r.name)}"></canvas></div>
        <dl class="kv">
          <dt>High now (${MONTH_SHORT[m]})</dt><dd>${deg(r.climate.avgHighC[m])}</dd>
          <dt>Sea now</dt><dd>${r.climate.seaTempC ? deg(r.climate.seaTempC[m]) : '–'}</dd>
          <dt>Rain now</dt><dd>${r.climate.rainMm[m]} mm</dd>
          <dt>Warmest month</dt><dd>${MONTH_SHORT[r.climate.avgHighC.indexOf(Math.max(...r.climate.avgHighC))]}</dd>
          <dt>Driest month</dt><dd>${MONTH_SHORT[r.climate.rainMm.indexOf(Math.min(...r.climate.rainMm))]}</dd>
          <dt>Price level</dt><dd>${priceBadge(p.region.priceMidEur)}</dd>
        </dl>
      </article>`;
    }).join('')}</div>
    <section class="section">
      <h2>Month by month</h2>
      <div class="card table-scroll"><table>
        <caption>Season rating per month (★ best · ◐ shoulder · ✕ avoid · · mixed)</caption>
        <thead><tr><th scope="col">Place</th>${MONTH_SHORT.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead>
        <tbody>${regions.map((r, i) => `<tr><th scope="row">${places[i].country.flag} ${esc(r.name)}</th>${monthScores(r).map(s =>
          `<td>${s >= 0.75 ? '<span style="color:var(--best)">★</span>' : s >= 0.45 ? '<span style="color:var(--shoulder)">◐</span>' : s < 0.2 ? '<span style="color:var(--worst)">✕</span>' : '·'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>`;

  attachStrips(body, el => regions[places.findIndex(p => p.key === el.closest('[data-key]').dataset.key)]);
  body.querySelectorAll('canvas').forEach((c, i) => renderMiniClimate(c, regions[i]));
  body.addEventListener('click', e => {
    const k = e.target.closest('[data-remove]')?.dataset.remove;
    if (k) go(unique.filter(x => x !== k));
  });
  return () => destroyCharts(body);
}
