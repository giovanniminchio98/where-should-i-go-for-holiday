// Country page: slide-in panel on desktop, full page on mobile. Deep link: #/country/IT/north
import { loadCountry, findCountry, state } from '../lib/data.js';
import { esc, store, toast, $ } from '../lib/util.js';
import { t, ACTIVITY_ICON, riskIcon } from '../lib/strings.js';
import { verdict, sortWindows } from '../core/season.js';
import { formatRange, windowLength, mmddToDoy, dateToDoy, formatDate, MONTH_SHORT, YEAR_DAYS } from '../core/dates.js';
import { holidayDates } from '../core/holidays.js';
import { convert, inflationFactor, formatMoney } from '../core/prices.js';
import { riskSeverity } from '../core/score.js';
import { stripHtml, attachStrips, legendHtml } from '../ui/strip.js';
import { renderRegionCharts, destroyCharts } from '../ui/charts.js';
import { mountLocator } from '../ui/map.js';
import { favButton, wireFavButtons, compareList, placeKey } from '../ui/cards.js';
import { shareCard } from '../ui/share.js';

const CURRENCIES = ['EUR', 'USD', 'GBP'];

function periodCards(list, cls) {
  return `<div class="period-grid">${sortWindows(list).map(w => `
    <article class="period ${cls}">
      <div class="dates">${esc(formatRange(w.from, w.to))} <span class="len">${Math.round(windowLength(w.from, w.to) / 7)} wk</span></div>
      <p>${esc(w.why)}</p>
      ${w.goodFor?.length ? `<div class="good-for" aria-label="Good for">${w.goodFor.map(a => `<span class="badge">${ACTIVITY_ICON[a]} ${esc(t('act.' + a))}</span>`).join('')}</div>` : ''}
    </article>`).join('')}</div>`;
}

function upcoming(h, now) {
  const year = now.getFullYear();
  let d = holidayDates(h, year);
  if (d && d.end < new Date(year, now.getMonth(), now.getDate())) d = holidayDates(h, year + 1) || d;
  return d;
}

function holidaysHtml(region, now) {
  if (!region.recurringHolidays.length) return '<p class="muted">No major recurring holidays affect travel here.</p>';
  return `<ul class="holiday-list">${region.recurringHolidays.map(h => {
    const d = upcoming(h, now);
    const y1 = d?.start.getFullYear(), y2 = d?.end.getFullYear();
    const when = !d ? h.approx
      : +d.end === +d.start ? `${formatDate(d.start)} ${y1}`
      : y1 === y2 ? `${formatDate(d.start)} – ${formatDate(d.end)} ${y1}`
      : `${formatDate(d.start)} ${y1} – ${formatDate(d.end)} ${y2}`;
    return `<li><div><div class="when">${esc(when)}</div>${d ? `<div class="small muted">${esc(h.approx)}</div>` : ''}</div>
      <div><div class="name">${esc(h.name)}</div><div>${esc(h.effect)}</div></div></li>`;
  }).join('')}</ul>`;
}

function stripHolidays(region, now) {
  const out = [];
  for (const h of region.recurringHolidays) {
    const d = holidayDates(h, now.getFullYear());
    if (d) out.push({ name: h.name, start: dateToDoy(d.start), end: dateToDoy(d.end) });
  }
  return out;
}

function risksHtml(region) {
  if (!region.risks.length) return '<p class="muted">No significant seasonal hazards.</p>';
  const seg = (from, to) => {
    const a = mmddToDoy(from), b = mmddToDoy(to);
    return a <= b ? [[a, b]] : [[a, YEAR_DAYS - 1], [0, b]];
  };
  return `<div class="risk-timeline" role="list">
    <div class="risk-row" aria-hidden="true"><span></span><div class="strip-months">${MONTH_SHORT.map(m => `<span>${m}</span>`).join('')}</div></div>
    ${region.risks.map(r => {
      const sev = riskSeverity(r.type);
      const cls = sev >= 1 ? '' : sev >= 0.6 ? 'medium' : 'low';
      return `<div class="risk-row" role="listitem">
        <span class="label"><span aria-hidden="true">${riskIcon(r.type)}</span>${esc(r.type[0].toUpperCase() + r.type.slice(1))}</span>
        <div class="risk-track" role="img" title="${esc(formatRange(r.from, r.to))}" aria-label="${esc(`${r.type}: ${formatRange(r.from, r.to)}`)}">
          ${seg(r.from, r.to).map(([a, b]) => `<span class="${cls}" style="left:${(a / YEAR_DAYS) * 100}%;width:${((b - a + 1) / YEAR_DAYS) * 100}%"></span>`).join('')}
        </div></div>`;
    }).join('')}
  </div>
  <ul class="risk-notes">${region.risks.map(r => `<li><b>${riskIcon(r.type)} ${esc(formatRange(r.from, r.to))}:</b> ${esc(r.note)}</li>`).join('')}</ul>`;
}

function priceInfo(country, region, now) {
  const p = region.prices;
  const year = now.getFullYear();
  const factor = inflationFactor(country.continent, p.referenceYear, year, state.meta);
  return { p, year, factor, projected: factor > 1 };
}

function pricesHtml(country, region, now, currency) {
  const { p, year, factor, projected } = priceInfo(country, region, now);
  const fx = state.meta.exchangeRates;
  const options = [...new Set([...CURRENCIES, p.currency])].filter(c => fx.rates[c]);
  const cur = options.includes(currency) ? currency : p.currency;
  const val = v => formatMoney(convert(v * factor, p.currency, cur, fx), cur);
  const row = (label, b) => `<tr><th scope="row">${label}</th><td>${val(b.low)}</td><td>${val(b.shoulder)}</td><td>${val(b.high)}</td></tr>`;
  const pct = `+${((factor - 1) * 100).toFixed(1)}%`;
  return `
    <div class="section-head" style="margin-bottom:10px">
      <span class="small muted">${projected ? esc(t('price.estimated', { year, ref: p.referenceYear, pct })) : esc(t('price.reference', { ref: p.referenceYear }))}</span>
      <div class="segmented" role="group" aria-label="Currency">${options.map(c => `<button type="button" data-cur="${c}" aria-pressed="${c === cur}">${c}</button>`).join('')}</div>
    </div>
    <div class="table-scroll"><table>
      <caption>Typical costs per person${cur !== p.currency ? ` · converted from ${p.currency} at static rates of ${esc(fx.date)}` : ''}</caption>
      <thead><tr><th scope="col"><span class="visually-hidden">Cost</span></th><th scope="col">Low season</th><th scope="col">Shoulder</th><th scope="col">High season</th></tr></thead>
      <tbody>${row('Budget per day', p.budgetPerDay)}${row('Mid-range per day', p.midrangePerDay)}${row('Mid-range hotel / night', p.hotelNightMid)}</tbody>
    </table></div>
    <p class="small muted" style="margin-top:10px">${esc(p.notes)}</p>`;
}

/** Monthly mid-range cost estimate (crowd level → low/shoulder/high tier) for the crowds-vs-price chart. */
function priceSeries(country, region, now, currency) {
  const { p, factor } = priceInfo(country, region, now);
  const fx = state.meta.exchangeRates;
  const cur = fx.rates[currency] ? currency : p.currency;
  const tier = c => (c <= 2 ? 'low' : c === 3 ? 'shoulder' : 'high');
  return { label: `Mid-range ${cur}/day (est.)`, values: region.crowds.map(c => convert(p.midrangePerDay[tier(c)] * factor, p.currency, cur, state.meta.exchangeRates)) };
}

function regionBodyHtml(country, region, now) {
  const currency = store.get('currency', 'EUR');
  return `
    <section aria-labelledby="strip-h">
      <h2 id="strip-h">The year at a glance</h2>
      ${stripHtml(region, { holidays: stripHolidays(region, now), label: region.name })}
      <div style="margin-top:12px">${legendHtml()}</div>
      <p class="small muted" style="margin-top:6px">Hover, tap or use the arrow keys on the strip to see why each week is rated as it is. The marks under the strip show this year's holiday dates.</p>
    </section>
    <section aria-labelledby="best-h"><h2 id="best-h">Best time to go</h2>${periodCards(region.best, 'best')}</section>
    ${region.worst.length ? `<section aria-labelledby="worst-h"><h2 id="worst-h">When to avoid</h2>${periodCards(region.worst, 'worst')}</section>` : ''}
    ${region.shoulder.length ? `<section aria-labelledby="sh-h"><h2 id="sh-h">Shoulder periods</h2><p class="muted">Good value, mixed weather.</p>${periodCards(region.shoulder, 'shoulder')}</section>` : ''}
    <section aria-labelledby="climate-h"><h2 id="climate-h">Climate</h2>
      <p class="small muted">Long-term monthly averages (${esc(state.meta.climateNormals)}). Shaded bands show the best, shoulder and worst months.</p>
      <div id="charts"></div></section>
    <section aria-labelledby="risk-h"><h2 id="risk-h">Seasonal risks</h2>${risksHtml(region)}</section>
    <section aria-labelledby="hol-h"><h2 id="hol-h">Holidays that affect travel</h2>${holidaysHtml(region, now)}</section>
    <section aria-labelledby="price-h"><h2 id="price-h">What it costs</h2><div id="prices">${pricesHtml(country, region, now, currency)}</div></section>`;
}

/**
 * Render the country page into the panel element.
 * Returns { setRegion(id) } or null if the country isn't in the data.
 */
export async function renderCountry(panel, iso2, regionId, { highlight = false, onRegion, city = '' } = {}) {
  const idx = findCountry(iso2);
  if (!idx) {
    panel.innerHTML = `<div class="panel-inner"><div class="panel-bar"><button class="btn small" data-close type="button">← Close</button></div>
      <h1 id="panel-title">Not covered yet</h1><p class="muted">We don't have seasonal data for “${esc(iso2)}” yet.</p></div>`;
    return null;
  }
  panel.innerHTML = `<div class="panel-inner"><div class="panel-bar"><button class="btn small" data-close type="button">← Close</button></div>
    <div class="country-head"><span class="flag" aria-hidden="true">${idx.flag}</span><h1 id="panel-title">${esc(idx.name)}</h1></div>
    <div class="skeleton" style="height:60vh"></div></div>`;
  const country = await loadCountry(iso2);
  if (!panel.isConnected) return null;
  const now = new Date();
  let region = country.regions.find(r => r.id === regionId) || country.regions[0];
  const key = () => placeKey(country, region);
  const { p, year, projected } = priceInfo(country, region, now);

  panel.innerHTML = `
  <div class="panel-inner">
    <div class="panel-bar">
      <button class="btn small" data-close type="button">← Close</button>
      <span class="spacer"></span>
      <span id="fav-slot"></span>
      <button class="btn small" type="button" data-act="compare" aria-label="Compare with…">⇆<span class="lbl"> Compare with…</span></button>
      <button class="btn small" type="button" data-act="share" aria-label="Share image of the season strip">↗<span class="lbl"> Share</span></button>
      <button class="btn small" type="button" data-act="print" aria-label="Print this page">⎙</button>
    </div>
    <div class="country-head">
      <span class="flag" aria-hidden="true">${country.flag}</span>
      <div><h1 id="panel-title" tabindex="-1">${esc(country.name)}</h1>
      <div class="muted small">${esc(country.continent)} · ${country.regions.length > 1 ? `${country.regions.length} regions` : 'whole country'} · reviewed ${esc(country.lastReviewed)}</div></div>
    </div>
    ${city ? `<div class="banner city-note" role="note">📍 <span><b>Regional info.</b> We don't have city-level data for <b>${esc(city)}</b>, so this shows the seasons for <b id="city-region">${esc(region.name)}</b>, the region it's in.</span></div>` : ''}
    <p class="verdict" id="verdict"></p>
    <p>${esc(country.summary)}</p>
    ${projected ? `<div class="banner" role="note">ℹ️ <span>${esc(t('price.banner', { ref: p.referenceYear, year }))} Climate figures are long-term averages and don't need updating.</span></div>` : ''}
    ${country.regions.length > 1 ? `
    <section aria-labelledby="regions-h">
      <h2 id="regions-h" class="visually-hidden">Regions</h2>
      <div class="tabs" role="tablist" aria-label="Regions">${country.regions.map(r => `
        <button class="tab" role="tab" type="button" id="tab-${r.id}" data-region="${r.id}" aria-selected="${r.id === region.id}" aria-controls="region-body" tabindex="${r.id === region.id ? 0 : -1}">${esc(r.name)}</button>`).join('')}
      </div>
    </section>` : `<p class="small muted">${esc(country.splitReason || '')}</p>`}
    <div class="region-intro" id="region-intro"></div>
    <div id="region-body" role="${country.regions.length > 1 ? 'tabpanel' : 'region'}" aria-label="Region details"></div>
    <section aria-labelledby="links-h"><h2 id="links-h">Useful links</h2>
      <ul class="link-list">${country.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a></li>`).join('')}</ul>
      <p class="small muted" style="margin-top:14px">Seasonal guidance, not a guarantee. Check forecasts and official travel advice before you go. Data reviewed ${esc(country.lastReviewed)}.</p>
    </section>
  </div>`;

  function renderRegion(focusTab = false) {
    destroyCharts(panel);
    const v = verdict(region);
    $('#verdict', panel).innerHTML = `${country.regions.length > 1 ? `<b>${esc(region.name)}.</b> ` : ''}${v.best ? `<span class="b">Best: ${esc(v.best)}.</span>` : ''} ${v.avoid ? `<span class="w">Avoid: ${esc(v.avoid)}.</span>` : ''}`;
    $('#fav-slot', panel).innerHTML = favButton(key());
    $('#region-intro', panel).innerHTML = `<div><p class="eyebrow">${esc(country.regions.length > 1 ? 'Region' : 'Coverage')}</p><h2 style="margin-bottom:.3em">${esc(region.name)}</h2><p class="muted" style="margin:0">${esc(region.description)}</p>
      <div class="chips" style="margin-top:10px">${region.tags.map(tg => `<span class="badge">${esc(tg)}</span>`).join('')}</div></div><div id="locator"></div>`;
    $('#region-body', panel).innerHTML = regionBodyHtml(country, region, now);
    for (const tab of panel.querySelectorAll('[role=tab]')) {
      const on = tab.dataset.region === region.id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focusTab) tab.focus();
      if (on) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    attachStrips(panel, () => region);
    mountLocator($('#locator', panel), findCountry(country.iso2), region.id, id => setRegion(id));
    const currency = store.get('currency', 'EUR');
    renderRegionCharts($('#charts', panel), region, priceSeries(country, region, now, currency));
  }

  function setRegion(id, focusTab = false) {
    const r = country.regions.find(x => x.id === id);
    if (!r || r === region) return;
    region = r;
    renderRegion(focusTab);
    onRegion?.(region.id);
  }

  renderRegion();

  if (highlight) {
    const target = $('#region-intro', panel);
    setTimeout(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      target.classList.add('flash');
      $(`#tab-${region.id}`, panel)?.classList.add('flash');
    }, 250);
  }

  // Events (delegated; the panel element persists between renders)
  const ac = new AbortController();
  const on = (type, fn) => panel.addEventListener(type, fn, { signal: ac.signal });
  on('click', e => {
    const tab = e.target.closest('[role=tab]');
    if (tab) return setRegion(tab.dataset.region);
    const cur = e.target.closest('[data-cur]');
    if (cur) {
      store.set('currency', cur.dataset.cur);
      $('#prices', panel).innerHTML = pricesHtml(country, region, now, cur.dataset.cur);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'compare') {
      const list = compareList.add(key());
      location.hash = '#/compare?p=' + list.join(',');
    } else if (act === 'share') {
      shareCard(country, region).catch(() => toast('Could not create the image'));
    } else if (act === 'print') {
      window.print();
    }
  });
  on('keydown', e => {
    const tab = e.target.closest('[role=tab]');
    if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const ids = country.regions.map(r => r.id);
    const i = ids.indexOf(region.id);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    setRegion(ids[next], true);
  });
  wireFavButtons(panel, null, ac.signal);

  return {
    setRegion,
    city,
    region: () => region.id,
    destroy() { ac.abort(); destroyCharts(panel); },
  };
}

