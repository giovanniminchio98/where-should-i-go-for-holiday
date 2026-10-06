// "Plan a year": one great destination per month, optionally favouring places closer to home.
import { countries, loadCountries } from '../lib/data.js';
import { esc, store } from '../lib/util.js';
import { t, ACTIVITY_ICON } from '../lib/strings.js';
import { MONTH_LONG, monthStartDoy, DAYS_IN_MONTH, todayDoy, monthOfDoy, inWindow } from '../core/dates.js';
import { ACTIVITIES, scoreRegion } from '../core/score.js';
import { stripHtml, attachStrips } from '../ui/strip.js';
import { placeHref, priceBadge, deg } from '../ui/cards.js';

function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * For each month, score every region on that whole month (same formula as the finder),
 * add a proximity bonus if requested (up to +15 points within ~1,500 km, fading to 0 at 12,000 km),
 * then greedily pick the top region while never repeating a country.
 */
export function planYear({ home, nearby, activities }) {
  const homeC = countries().find(c => c.iso2 === home);
  const homePt = homeC && {
    lat: homeC.regions.reduce((s, r) => s + r.lat, 0) / homeC.regions.length,
    lon: homeC.regions.reduce((s, r) => s + r.lon, 0) / homeC.regions.length,
  };
  const used = new Set(home ? [home] : []);
  const startMonth = monthOfDoy(todayDoy());
  const plan = [];
  for (let k = 0; k < 12; k++) {
    const m = (startMonth + k) % 12;
    const days = Array.from({ length: DAYS_IN_MONTH[m] }, (_, i) => monthStartDoy(m) + i);
    const ranked = [];
    for (const c of countries()) for (const r of c.regions) {
      const s = scoreRegion(r, days, { activities });
      if (!s) continue;
      let score = s.score;
      if (nearby && homePt) score += 15 * Math.max(0, Math.min(1, (12000 - km(homePt, r)) / 10500));
      ranked.push({ c, r, s, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    const pick = ranked.find(x => !used.has(x.c.iso2)) || ranked[0];
    if (pick) used.add(pick.c.iso2);
    plan.push({ m, pick, days });
  }
  return plan;
}

export function render(main) {
  const saved = store.get('plan', { home: '', nearby: false, activities: [] });
  main.innerHTML = `
  <div class="container">
    <header class="page-head">
      <p class="eyebrow">Plan a year</p>
      <h1>Twelve months, twelve great trips</h1>
      <p class="muted" style="max-width:62ch">One destination per month, each in its best season, without repeating a country.</p>
    </header>
    <form class="card" id="plan-form" style="display:grid;gap:16px;margin-bottom:24px">
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:end">
        <div class="field" style="min-width:220px"><label for="p-home">Home country</label>
          <select class="input" id="p-home"><option value="">— Not set —</option>${countries().map(c => `<option value="${c.iso2}">${c.flag} ${esc(c.name)}</option>`).join('')}</select></div>
        <label class="toggle"><input type="checkbox" id="p-near"> Prefer places closer to home</label>
      </div>
      <div class="field"><span class="field-label" id="p-act-l">Optional: focus on</span>
        <div class="chips" role="group" aria-labelledby="p-act-l">${ACTIVITIES.map(a => `<button type="button" class="chip" data-act="${a}" aria-pressed="${saved.activities.includes(a)}">${ACTIVITY_ICON[a]} ${esc(t('act.' + a))}</button>`).join('')}</div></div>
    </form>
    <h2 class="visually-hidden">Your year</h2><div class="plan-grid" id="plan-grid"></div>
  </div>`;
  const form = main.querySelector('#plan-form');
  form.querySelector('#p-home').value = saved.home;
  form.querySelector('#p-near').checked = saved.nearby;
  const grid = main.querySelector('#plan-grid');

  async function update() {
    const opts = {
      home: form.querySelector('#p-home').value,
      nearby: form.querySelector('#p-near').checked,
      activities: [...form.querySelectorAll('[data-act][aria-pressed="true"]')].map(b => b.dataset.act),
    };
    store.set('plan', opts);
    const plan = planYear(opts);
    const full = await loadCountries(plan.filter(p => p.pick).map(p => p.pick.c.iso2));
    if (!grid.isConnected) return;
    grid.innerHTML = plan.map(({ m, pick, days }) => {
      if (!pick) return `<article class="card plan-card"><div class="month">${MONTH_LONG[m]}</div><p class="muted">No region matches these activities this month.</p></article>`;
      const fr = full.get(pick.c.iso2).regions.find(r => r.id === pick.r.id);
      const best = fr.best
        .map(w => ({ w, n: days.filter(d => inWindow(d, w.from, w.to)).length }))
        .filter(x => x.n).sort((a, b) => b.n - a.n)[0]?.w;
      return `<article class="card plan-card place-card" data-key="${pick.c.iso2}.${pick.r.id}">
        <div class="month">${MONTH_LONG[m]}</div>
        <div class="top"><span class="flag" aria-hidden="true">${pick.c.flag}</span><div><h3><a href="${placeHref(pick.c, pick.r)}">${esc(pick.r.name)}</a></h3><div class="country">${esc(pick.c.name)}</div></div></div>
        <div class="stats"><span>Highs <b>${deg(pick.s.avgHigh)}</b></span>${pick.s.avgSea != null ? `<span>Sea <b>${deg(pick.s.avgSea)}</b></span>` : ''}<span>${priceBadge(pick.r.priceMidEur)}</span></div>
        ${best ? `<p class="small" style="margin:0">${esc(best.why)}</p>` : ''}
        ${stripHtml(fr, { mini: true, range: days, today: false, label: pick.r.name })}
      </article>`;
    }).join('');
    attachStrips(grid, el => {
      const [iso, id] = el.closest('[data-key]').dataset.key.split('.');
      return full.get(iso)?.regions.find(r => r.id === id);
    });
  }

  form.addEventListener('change', update);
  form.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
    update();
  });
  update();
}
