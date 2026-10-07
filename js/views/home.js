// Home: hero search, "right now" carousel, quick finder and the month-by-month world map.
import { countries } from '../lib/data.js';
import { esc, store } from '../lib/util.js';
import { t, ACTIVITY_ICON } from '../lib/strings.js';
import { todayDoy, MONTH_SHORT, MONTH_LONG, formatMmdd, monthOfDoy } from '../core/dates.js';
import { dayClasses, windowAt, monthScores, scoreToClass, BEST, SHOULDER, CLASS_NAMES } from '../core/season.js';
import { ACTIVITIES } from '../core/score.js';
import { stripHtml, attachStrips, legendHtml } from '../ui/strip.js';
import { mountSearch } from '../ui/search.js';
import { mountWorldMap } from '../ui/map.js';
import { priceBadge, placeHref, deg } from '../ui/cards.js';

/** Regions in their best window today, longest remaining window first, topped up with shoulder regions. */
export function rightNow(limit = 10) {
  const doy = todayDoy();
  const m = monthOfDoy(doy);
  const picks = [];
  for (const c of countries()) for (const r of c.regions) {
    const cls = dayClasses(r)[doy];
    if (cls !== BEST && cls !== SHOULDER) continue;
    const at = windowAt(r, doy);
    picks.push({ c, r, cls, until: at.window?.to, daysLeft: at.daysLeft, crowd: r.crowds[m] });
  }
  picks.sort((a, b) => (b.cls - a.cls) || (b.daysLeft - a.daysLeft) || (a.crowd - b.crowd));
  return picks.slice(0, limit);
}

export function bestRegionInMonth(country, m) {
  let best = null;
  for (const r of country.regions) {
    const s = monthScores(r)[m];
    if (!best || s > best.s) best = { r, s };
  }
  return best;
}

function rightNowCard({ c, r, cls, until }) {
  const m = monthOfDoy(todayDoy());
  return `<a class="card place-card" href="${placeHref(c, r)}">
    <div class="top"><span class="flag" aria-hidden="true">${c.flag}</span>
      <div><h3>${esc(r.name)}</h3><div class="country">${esc(c.name)}</div></div></div>
    <div><span class="badge ${CLASS_NAMES[cls]}">${cls === BEST ? 'Best' : 'Good'} until ${formatMmdd(until)}</span></div>
    <div class="stats"><span>High <b>${deg(r.climate.avgHighC[m])}</b></span>${r.climate.seaTempC ? `<span>Sea <b>${deg(r.climate.seaTempC[m])}</b></span>` : ''}<span>${priceBadge(r.priceMidEur)}</span></div>
    ${stripHtml(r, { mini: true, label: `${r.name}, ${c.name}` })}
  </a>`;
}

export function render(main) {
  document.body.classList.add('is-home');
  const nowMonth = monthOfDoy(todayDoy());
  const nextMonth = (nowMonth + 1) % 12;
  const picks = rightNow();
  const continents = [...new Set(countries().map(c => c.continent))].sort();
  const regionCount = countries().reduce((s, c) => s + c.regions.length, 0);
  // Share of regions in "best" season, per month, for the hero colour bar.
  const heroBar = MONTH_SHORT.map((_, m) => {
    const scores = countries().flatMap(c => c.regions.map(r => monthScores(r)[m]));
    return scoreToClass(scores.reduce((a, b) => a + b, 0) / scores.length + 0.15);
  });

  main.innerHTML = `
  <div class="container">
    <section class="hero">
      <p class="eyebrow">Seasonal travel timing · ${countries().length} countries · ${regionCount} regions</p>
      <h1>${t('home.title')}</h1>
      <p class="lede">${t('home.lede')}</p>
      <div id="hero-search"></div>
      <div class="hero-strip" aria-hidden="true">${heroBar.map((c, i) => `<span class="cls-${c}" style="animation-delay:${i * 50}ms"></span>`).join('')}</div>
    </section>

    <section class="section" aria-labelledby="rn-title">
      <div class="section-head">
        <div><p class="eyebrow">${esc(MONTH_LONG[nowMonth])} · today</p><h2 id="rn-title">${t('home.rightNow')}</h2></div>
        <div class="carousel-nav">
          <button class="icon-btn" type="button" data-scroll="-1" aria-label="Scroll left">‹</button>
          <button class="icon-btn" type="button" data-scroll="1" aria-label="Scroll right">›</button>
        </div>
      </div>
      <div class="carousel"><div class="carousel-track" id="rn-track" tabindex="0" aria-label="${t('home.rightNowSub')}">
        ${picks.map(rightNowCard).join('') || '<p class="muted">No region is in its best window today.</p>'}
      </div></div>
    </section>

    <section class="section" aria-labelledby="qf-title">
      <div class="section-head"><div><p class="eyebrow">Quick finder</p><h2 id="qf-title">${t('home.whereIn')}</h2></div></div>
      <form class="card quick-finder" id="quick-finder">
        <div class="row"><span class="field-label" id="qf-m">Month</span>
          <div class="month-chips" role="group" aria-labelledby="qf-m">${MONTH_SHORT.map((m, i) => `<button type="button" class="chip" data-month="${i + 1}" aria-pressed="${i === nextMonth}">${m}</button>`).join('')}</div></div>
        <div class="row"><span class="field-label" id="qf-a">I want…</span>
          <div class="chips" role="group" aria-labelledby="qf-a">${ACTIVITIES.map(a => `<button type="button" class="chip" data-act="${a}" aria-pressed="false">${ACTIVITY_ICON[a]} ${esc(t('act.' + a))}</button>`).join('')}</div></div>
        <div class="row" style="grid-template-columns:minmax(0,260px) auto;align-items:end;gap:12px">
          <div class="field"><label for="qf-c">Where</label>
            <select class="input" id="qf-c"><option value="">Anywhere</option>${continents.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
          <button class="btn primary" type="submit">Show me places →</button>
        </div>
      </form>
    </section>

    <section class="section" aria-labelledby="map-title">
      <div class="section-head"><div><p class="eyebrow">Interactive map</p><h2 id="map-title">${t('home.map')}</h2></div><p>${t('home.mapSub')}</p></div>
      <div class="card map-card">
        <div class="map-controls">
          <button class="icon-btn" type="button" id="map-play" aria-label="Play through the year">▶</button>
          <span class="month-label" id="map-month" aria-live="polite">${MONTH_LONG[nowMonth]}</span>
          <input type="range" min="1" max="12" step="1" value="${nowMonth + 1}" id="map-slider" aria-label="Month">
        </div>
        <div id="world-map"></div>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:8px">
          ${legendHtml()}
          <span class="small muted">Grey: not yet covered (${countries().length} countries so far)</span>
        </div>
      </div>
    </section>
  </div>`;

  mountSearch(main.querySelector('#hero-search'), { large: true });
  attachStrips(main, el => {
    const a = el.closest('a[href]');
    const [, , iso, id] = a.getAttribute('href').split('/');
    return countries().find(c => c.iso2 === iso)?.regions.find(r => r.id === id);
  });

  const track = main.querySelector('#rn-track');
  main.querySelectorAll('[data-scroll]').forEach(b => b.addEventListener('click', () =>
    track.scrollBy({ left: Number(b.dataset.scroll) * track.clientWidth * 0.85, behavior: 'smooth' })));

  // Quick finder
  const qf = main.querySelector('#quick-finder');
  qf.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.month) qf.querySelectorAll('[data-month]').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    else chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
  });
  const lastContinent = store.get('qfContinent', '');
  if (continents.includes(lastContinent)) qf.querySelector('#qf-c').value = lastContinent;
  qf.addEventListener('submit', e => {
    e.preventDefault();
    const month = qf.querySelector('[data-month][aria-pressed="true"]')?.dataset.month || nextMonth + 1;
    const acts = [...qf.querySelectorAll('[data-act][aria-pressed="true"]')].map(c => c.dataset.act);
    const cont = qf.querySelector('#qf-c').value;
    store.set('qfContinent', cont);
    const p = new URLSearchParams({ month });
    if (acts.length) p.set('a', acts.join(','));
    if (cont) p.set('c', cont);
    location.hash = '#/finder?' + p;
  });

  // World map with month slider
  const slider = main.querySelector('#map-slider');
  const label = main.querySelector('#map-month');
  const month = () => Number(slider.value) - 1;
  let mapApi;
  mountWorldMap(main.querySelector('#world-map'), {
    zoomKey: 'home',
    classFor: c => scoreToClass(bestRegionInMonth(c, month()).s),
    labelFor: c => {
      const b = bestRegionInMonth(c, month());
      const cls = scoreToClass(b.s);
      return `<strong>${c.flag} ${esc(c.name)} · ${MONTH_SHORT[month()]}</strong>${t('cls.' + cls)}${c.regions.length > 1 ? ` — best: ${esc(b.r.name)}` : ''}`;
    },
    onSelect: iso => { location.hash = `#/country/${iso}/${bestRegionInMonth(countries().find(c => c.iso2 === iso), month()).r.id}`; },
  }).then(api => { mapApi = api; });
  slider.addEventListener('input', () => { label.textContent = MONTH_LONG[month()]; mapApi?.refresh(); });

  let timer = null;
  const play = main.querySelector('#map-play');
  const stop = () => { clearInterval(timer); timer = null; play.textContent = '▶'; play.setAttribute('aria-label', 'Play through the year'); };
  play.addEventListener('click', () => {
    if (timer) return stop();
    play.textContent = '❚❚';
    play.setAttribute('aria-label', 'Pause');
    timer = setInterval(() => {
      if (!slider.isConnected) return stop();
      slider.value = (Number(slider.value) % 12) + 1;
      slider.dispatchEvent(new Event('input'));
    }, 1100);
  });

  return () => { stop(); document.body.classList.remove('is-home'); };
}

