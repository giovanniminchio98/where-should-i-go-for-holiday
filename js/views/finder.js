// "Where should I go?" finder. All inputs live in the URL so results can be shared:
// #/finder?from=2027-02-01&to=2027-02-14&a=beach&c=Asia&flex=1&budget=mid&crowds=1&sort=score
// (or month=2 instead of from/to).
import { countries, loadCountries, state } from '../lib/data.js';
import { esc, replaceHash, store } from '../lib/util.js';
import { tripEstimate, formatMoney } from '../core/prices.js';
import { t, ACTIVITY_ICON, riskIcon } from '../lib/strings.js';
import { ACTIVITIES, rankRegions } from '../core/score.js';
import { daysBetween, parseISODate, toISODate, addDays, MONTH_SHORT, formatRange, inWindow, formatDate, monthOfDoy } from '../core/dates.js';
import { stripHtml, attachStrips, legendHtml } from '../ui/strip.js';
import { mountWorldMap } from '../ui/map.js';
import { priceBadge, placeHref, placeKey, favButton, wireFavButtons, compareList, deg } from '../ui/cards.js';

function defaults() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: start, to: new Date(start.getFullYear(), start.getMonth() + 1, 0) };
}

function readParams(params) {
  let from = parseISODate(params.get('from'));
  let to = parseISODate(params.get('to'));
  const month = Number(params.get('month'));
  if (month >= 1 && month <= 12) {
    const now = new Date();
    const y = month - 1 < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    from = new Date(y, month - 1, 1);
    to = new Date(y, month, 0);
  }
  if (!from || !to || to < from) ({ from, to } = defaults());
  if ((to - from) / 864e5 > 364) to = addDays(from, 364);
  const list = k => (params.get(k) || '').split(',').filter(Boolean);
  return {
    from, to,
    activities: list('a').filter(a => ACTIVITIES.includes(a)),
    continents: list('c'),
    flexible: params.get('flex') === '1',
    budget: ['budget', 'mid', 'luxury'].includes(params.get('budget')) ? params.get('budget') : '',
    avoidCrowds: params.get('crowds') === '1',
    sort: ['score', 'price', 'temp'].includes(params.get('sort')) ? params.get('sort') : 'score',
  };
}

function writeParams(s) {
  const p = new URLSearchParams({ from: toISODate(s.from), to: toISODate(s.to) });
  if (s.activities.length) p.set('a', s.activities.join(','));
  if (s.continents.length) p.set('c', s.continents.join(','));
  if (s.flexible) p.set('flex', '1');
  if (s.budget) p.set('budget', s.budget);
  if (s.avoidCrowds) p.set('crowds', '1');
  if (s.sort !== 'score') p.set('sort', s.sort);
  replaceHash('#/finder?' + p);
}

/** The text that explains why a region fits the chosen days: the best (or shoulder) window covering most of them. */
function reasonFor(full, days, shiftedDays) {
  const d = shiftedDays || days;
  const pick = list => (list || [])
    .map(w => ({ w, c: d.filter(x => inWindow(x, w.from, w.to)).length }))
    .filter(x => x.c > 0)
    .sort((a, b) => b.c - a.c)[0]?.w;
  const best = pick(full.best);
  if (best) return { cls: 'best', label: `Best season (${formatRange(best.from, best.to)})`, why: best.why };
  const sh = pick(full.shoulder);
  if (sh) return { cls: 'shoulder', label: `Shoulder season (${formatRange(sh.from, sh.to)})`, why: sh.why };
  const wo = pick(full.worst);
  if (wo) return { cls: 'worst', label: `Overlaps a bad period (${formatRange(wo.from, wo.to)})`, why: wo.why };
  return { cls: 'na', label: 'Mixed season', why: '' };
}

export function render(main, params) {
  const s = readParams(params);
  const continents = [...new Set(countries().map(c => c.continent))].sort();
  main.innerHTML = `
  <div class="container">
    <header class="page-head">
      <p class="eyebrow">Finder</p>
      <h1>${t('finder.title')}</h1>
      <p class="muted" style="max-width:60ch">${t('finder.lede')}</p>
    </header>
    <div class="finder-layout">
      <form class="card finder-form" id="finder-form" aria-label="Finder options">
        <div class="field"><span class="field-label">Dates</span>
          <div class="date-row">
            <div class="field"><label for="f-from" class="visually-hidden">From</label><input class="input" type="date" id="f-from" value="${toISODate(s.from)}"></div>
            <div class="field"><label for="f-to" class="visually-hidden">To</label><input class="input" type="date" id="f-to" value="${toISODate(s.to)}" min="${toISODate(s.from)}" aria-describedby="f-date-err"></div>
          </div>
          <p class="field-error" id="f-date-err" role="alert" hidden></p>
          <div class="chips" role="group" aria-label="Whole month">${MONTH_SHORT.map((m, i) => `<button type="button" class="chip" data-month="${i}" style="padding:4px 9px;font-size:.8rem">${m}</button>`).join('')}</div>
          <label class="toggle"><input type="checkbox" id="f-flex" ${s.flexible ? 'checked' : ''}> Flexible ±2 weeks</label>
        </div>
        <div class="field"><span class="field-label" id="f-act-l">Activities</span>
          <div class="chips" role="group" aria-labelledby="f-act-l">${ACTIVITIES.map(a => `<button type="button" class="chip" data-act="${a}" aria-pressed="${s.activities.includes(a)}">${ACTIVITY_ICON[a]} ${esc(t('act.' + a))}</button>`).join('')}</div>
        </div>
        <div class="field"><span class="field-label" id="f-cont-l">Continents</span>
          <div class="chips" role="group" aria-labelledby="f-cont-l">
            <button type="button" class="chip" data-cont="" aria-pressed="${!s.continents.length}">Anywhere</button>
            ${continents.map(c => `<button type="button" class="chip" data-cont="${esc(c)}" aria-pressed="${s.continents.includes(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label for="f-budget">Budget</label>
          <select class="input" id="f-budget">
            <option value="">Any</option><option value="budget">Budget</option><option value="mid">Mid-range</option><option value="luxury">Luxury</option>
          </select></div>
        <label class="toggle"><input type="checkbox" id="f-crowds" ${s.avoidCrowds ? 'checked' : ''}> Avoid crowds</label>
      </form>
      <div>
        <div class="results-head">
          <p class="muted" id="f-summary" aria-live="polite" style="margin:0"></p>
          <div class="field" style="grid-template-columns:auto auto;align-items:center"><label for="f-sort">Sort</label>
            <select class="input" id="f-sort" style="min-height:36px;padding:6px 10px"><option value="score">Best match</option><option value="price">Cheapest</option><option value="temp">Warmest</option></select></div>
        </div>
        <div class="card map-card" style="margin-bottom:16px"><div id="finder-map"></div>${legendHtml()}</div>
        <div class="trip-note small muted" id="f-cost-note"></div>
        <h2 class="visually-hidden">Results</h2><div class="results" id="results"></div>
      </div>
    </div>
  </div>`;

  const form = main.querySelector('#finder-form');
  form.querySelector('#f-budget').value = s.budget;
  main.querySelector('#f-sort').value = s.sort;
  const resultsEl = main.querySelector('#results');
  let mapApi, current = [];
  const bestByCountry = new Map();

  mountWorldMap(main.querySelector('#finder-map'), {
    zoomKey: 'finder',
    classFor: c => {
      const r = bestByCountry.get(c.iso2);
      if (!r) return 'na';
      return r.score >= 75 ? 'best' : r.score >= 50 ? 'shoulder' : 'worst';
    },
    labelFor: c => {
      const r = bestByCountry.get(c.iso2);
      return `<strong>${c.flag} ${esc(c.name)}</strong>${r ? `Top match: ${esc(r.region.name)} · ${r.score}/100` : 'No match for these filters'}`;
    },
    onSelect: iso => {
      const r = bestByCountry.get(iso);
      location.hash = r ? placeHref(r.country, r.region) : `#/country/${iso}`;
    },
  }).then(api => { mapApi = api; });

  // Trip cost estimate per result (per person, excluding flights), in the chosen currency.
  const CURRENCIES = ['EUR', 'USD', 'GBP'];
  const levelName = { '': 'mid-range', mid: 'mid-range', budget: 'budget', luxury: 'luxury' };
  const money = v => formatMoney(v, store.get('currency', 'EUR'));
  function costHtml(region, continent, days) {
    const e = tripEstimate(region, continent, days, { level: s.budget, year: s.from.getFullYear(), currency: store.get('currency', 'EUR'), meta: state.meta, monthOf: monthOfDoy });
    if (!e) return '';
    const split = e.stay != null ? ` <span class="muted">(stay ≈ ${money(e.stay)} · food, transport &amp; activities ≈ ${money(e.daily)})</span>` : '';
    return `<p class="trip-cost">💶 <b>≈ ${money(e.total)}</b> per person for ${e.days} day${e.days === 1 ? '' : 's'}${split}</p>`;
  }
  function renderCostNote() {
    const cur = store.get('currency', 'EUR');
    main.querySelector('#f-cost-note').innerHTML = `<span>💶 Trip estimates: per person, ${levelName[s.budget]} level${s.budget === 'budget' ? '' : ', sharing a double room'}, with each day priced for its season. Rough guide only — <b>flights not included</b>.</span>
      <span class="segmented" role="group" aria-label="Currency">${CURRENCIES.map(c => `<button type="button" data-cur="${c}" aria-pressed="${c === cur}">${c}</button>`).join('')}</span>`;
  }
  main.querySelector('#f-cost-note').addEventListener('click', e => {
    const b = e.target.closest('[data-cur]');
    if (!b) return;
    store.set('currency', b.dataset.cur);
    run();
  });

  // The end date can't be before the start date: flag it in red and hold the search until it's fixed.
  const fromEl = form.querySelector('#f-from'), toEl = form.querySelector('#f-to'), errEl = form.querySelector('#f-date-err');
  function datesValid() {
    const f = parseISODate(fromEl.value), to = parseISODate(toEl.value);
    if (f) toEl.min = fromEl.value;
    const msg = !f || !to ? 'Choose both a start and an end date.'
      : to < f ? 'The end date is before the start date. Choose a later end date.' : '';
    toEl.setAttribute('aria-invalid', String(!!msg && (!to || to < f)));
    fromEl.setAttribute('aria-invalid', String(!!msg && !f));
    errEl.textContent = msg;
    errEl.hidden = !msg;
    return !msg;
  }

  let runId = 0;
  async function run() {
    const id = ++runId;
    if (!datesValid()) {
      main.querySelector('#f-summary').textContent = 'Fix the dates to see results.';
      resultsEl.innerHTML = `<div class="card empty-state"><p><b>Those dates don't work.</b></p><p>The trip has to end on or after the day it starts.</p></div>`;
      return;
    }
    renderCostNote();
    writeParams(s);
    const days = daysBetween(s.from, s.to);
    const res = rankRegions(countries(), { days, activities: s.activities, continents: s.continents, flexible: s.flexible, avoidCrowds: s.avoidCrowds, budget: s.budget });
    bestByCountry.clear();
    for (const r of res) if (!bestByCountry.has(r.country.iso2)) bestByCountry.set(r.country.iso2, r);
    mapApi?.refresh();
    const sorted = [...res];
    if (s.sort === 'price') sorted.sort((a, b) => (a.region.priceMidEur ?? 1e9) - (b.region.priceMidEur ?? 1e9) || b.score - a.score);
    if (s.sort === 'temp') sorted.sort((a, b) => (b.avgHigh ?? -99) - (a.avgHigh ?? -99));
    current = sorted.slice(0, 40);
    const nDays = days.length;
    main.querySelector('#f-summary').textContent =
      `${res.length} region${res.length === 1 ? '' : 's'} for ${formatDate(s.from)} – ${formatDate(s.to)} (${nDays} day${nDays === 1 ? '' : 's'})` +
      (s.activities.length ? ` · ${s.activities.map(a => t('act.' + a)).join(', ')}` : '');
    if (!current.length) {
      resultsEl.innerHTML = `<div class="card empty-state"><p><b>No region fits all of that.</b></p><p>Try fewer activities, more continents or the flexible ±2 weeks option.</p></div>`;
      return;
    }
    const full = await loadCountries(current.map(r => r.country.iso2));
    if (id !== runId) return;
    resultsEl.innerHTML = current.map((r, i) => {
      const fr = full.get(r.country.iso2)?.regions.find(x => x.id === r.region.id) || r.region;
      const shifted = r.shift ? days.map(d => (d + r.shift + 365) % 365) : null;
      const reason = reasonFor(fr, days, shifted);
      const key = placeKey(r.country, r.region);
      const color = r.score >= 75 ? 'var(--best)' : r.score >= 50 ? 'var(--shoulder)' : 'var(--worst)';
      const matched = s.activities.filter(a => (r.perActivity[a] || 0) > 0);
      return `<article class="card result" style="animation-delay:${Math.min(i, 10) * 40}ms">
        <div class="score" style="--p:${r.score};--c:${color}" role="img" aria-label="Match score ${r.score} out of 100"><span>${r.score}</span></div>
        <div class="body">
          <h3><a href="${placeHref(r.country, r.region)}">${r.country.flag} ${esc(r.country.name)} › ${esc(r.region.name)}</a></h3>
          <div class="chips"><span class="badge ${reason.cls}">${esc(reason.label)}</span>${priceBadge(r.region.priceMidEur)}
            ${matched.map(a => `<span class="badge" title="${esc(t('act.' + a))}: ${Math.round(r.perActivity[a] * 100)}% of your days">${ACTIVITY_ICON[a]} ${esc(t('act.' + a))}</span>`).join('')}</div>
          ${reason.why ? `<p class="why">${esc(reason.why)}</p>` : ''}
          ${costHtml(fr, r.country.continent, shifted || days)}
          <div class="stats"><span>Highs <b>${deg(r.avgHigh)}</b></span>${r.avgSea != null ? `<span>Sea <b>${deg(r.avgSea)}</b></span>` : ''}<span>Rain <b>${Math.round(r.avgRain)} mm</b>/mo</span><span>Crowds <b>${r.crowd.toFixed(1)}</b>/5</span></div>
          ${r.risks.length ? `<p class="small muted" style="margin:0">Watch out: ${r.risks.map(x => `${riskIcon(x)} ${esc(x)}`).join(' · ')}</p>` : ''}
          ${r.shift ? `<p class="small" style="margin:0">💡 Shift your dates by ${r.shift > 0 ? '+' : ''}${r.shift} days for a better match.</p>` : ''}
          <div class="actions">${favButton(key)}<button class="btn small" type="button" data-compare="${key}">⇆ Compare</button></div>
        </div>
        ${stripHtml(fr, { mini: true, range: days, label: r.region.name })}
      </article>`;
    }).join('');
    attachStrips(resultsEl, el => {
      const k = el.closest('.result').querySelector('[data-compare]').dataset.compare.split('.');
      return full.get(k[0])?.regions.find(x => x.id === k[1]);
    });
  }

  form.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.month != null) {
      const m = Number(chip.dataset.month);
      const now = new Date();
      const y = m < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
      s.from = new Date(y, m, 1);
      s.to = new Date(y, m + 1, 0);
      form.querySelector('#f-from').value = toISODate(s.from);
      form.querySelector('#f-to').value = toISODate(s.to);
    } else if (chip.dataset.act) {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      s.activities = on ? [...s.activities, chip.dataset.act] : s.activities.filter(a => a !== chip.dataset.act);
    } else if (chip.dataset.cont != null) {
      const c = chip.dataset.cont;
      if (!c) s.continents = [];
      else s.continents = s.continents.includes(c) ? s.continents.filter(x => x !== c) : [...s.continents, c];
      form.querySelectorAll('[data-cont]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cont ? s.continents.includes(b.dataset.cont) : !s.continents.length)));
    }
    run();
  });
  form.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'f-from' || id === 'f-to') {
      const f = parseISODate(fromEl.value), to = parseISODate(toEl.value);
      if (f && to && to >= f) { s.from = f; s.to = (to - f) / 864e5 > 364 ? addDays(f, 364) : to; }
    }
    if (id === 'f-flex') s.flexible = e.target.checked;
    if (id === 'f-budget') s.budget = e.target.value;
    if (id === 'f-crowds') s.avoidCrowds = e.target.checked;
    run();
  });
  form.addEventListener('input', e => { if (e.target === fromEl || e.target === toEl) datesValid(); });
  main.querySelector('#f-sort').addEventListener('change', e => { s.sort = e.target.value; run(); });
  const ac = new AbortController();
  wireFavButtons(resultsEl, null, ac.signal);
  resultsEl.addEventListener('click', e => {
    const k = e.target.closest('[data-compare]')?.dataset.compare;
    if (k) location.hash = '#/compare?p=' + compareList.add(k).join(',');
  });
  run();
  return () => ac.abort();
}

