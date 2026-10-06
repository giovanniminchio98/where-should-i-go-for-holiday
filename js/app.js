// App entry: data bootstrap, hash router, country panel, theme and service worker.
import { init, state } from './lib/data.js';
import { $, parseHash, idle } from './lib/util.js';
import { mountSearch } from './ui/search.js';
import { renderCountry } from './views/country.js';
import * as home from './views/home.js';
import * as finder from './views/finder.js';
import * as compare from './views/compare.js';
import * as saved from './views/saved.js';
import * as plan from './views/plan.js';
import * as about from './views/about.js';

const VIEWS = { '': home, finder, compare, saved, plan, about };
const TITLES = { '': 'WhenToGo — the best time to visit every country', finder: 'Where should I go? · WhenToGo', compare: 'Compare · WhenToGo', saved: 'Saved · WhenToGo', plan: 'Plan a year · WhenToGo', about: 'About the data · WhenToGo' };

const main = $('#main');
const panel = $('#panel');
const scrim = $('#scrim');
let baseHash = null;      // last non-country route, shown under the panel
let baseRoute = null;     // { name, params } of that route
let baseCleanup = null;
let countryApi = null;
let openKey = null;
let returnFocus = null;
let panelToken = 0;

function renderBase(name, params, hash) {
  if (baseHash === hash) return;
  baseCleanup?.();
  baseCleanup = null;
  baseHash = hash;
  baseRoute = { name, params };
  const view = VIEWS[name] || home;
  document.title = TITLES[name] ?? TITLES[''];
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const r = view.render(main, params);
  Promise.resolve(r).then(fn => { if (typeof fn === 'function') baseCleanup = fn; });
}

const isMobile = () => matchMedia('(max-width: 719px)').matches;

async function openPanel(iso, regionId, params) {
  const key = `${iso}/${regionId || ''}`;
  if (countryApi && openKey?.split('/')[0] === iso) {
    // Same country: just switch region without re-rendering everything.
    if (regionId && countryApi.region() !== regionId) countryApi.setRegion(regionId);
    openKey = key;
    return;
  }
  countryApi?.destroy();
  openKey = key;
  if (panel.hidden) returnFocus = document.activeElement;
  panel.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('panel-is-open');
  document.body.classList.toggle('panel-open-mobile', isMobile());
  requestAnimationFrame(() => { panel.classList.add('open'); scrim.classList.add('show'); });
  panel.scrollTop = 0;
  const token = ++panelToken;
  const api = await renderCountry(panel, iso, regionId, {
    highlight: params.get('hl') === '1',
    onRegion: id => history.replaceState(null, '', `#/country/${iso}/${id}`),
  });
  if (token !== panelToken) { api?.destroy(); return; }
  countryApi = api;
  document.title = `${$('#panel-title', panel)?.textContent || iso} — when to go · WhenToGo`;
  $('#panel-title', panel)?.focus({ preventScroll: true });
}

function closePanel() {
  if (panel.hidden) return;
  panelToken++;
  countryApi?.destroy();
  countryApi = null;
  openKey = null;
  panel.classList.remove('open');
  scrim.classList.remove('show');
  document.body.classList.remove('panel-open-mobile', 'panel-is-open');
  setTimeout(() => {
    if (!panel.classList.contains('open')) { panel.hidden = true; scrim.hidden = true; panel.innerHTML = ''; }
  }, 380);
  returnFocus?.focus?.({ preventScroll: true });
}

function route() {
  const { parts, params } = parseHash();
  if (parts[0] === 'country' && parts[1]) {
    if (baseHash === null) renderBase('', new URLSearchParams(), '#/');
    openPanel(parts[1].toUpperCase(), parts[2], params);
    return;
  }
  closePanel();
  const name = VIEWS[parts[0]] ? parts[0] : '';
  renderBase(name, params, location.hash || '#/');
  if (name !== '' || !location.hash) window.scrollTo({ top: 0 });
}

function requestClose() {
  location.hash = baseHash || '#/';
}

function setupTheme() {
  const btn = $('#theme-toggle');
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('wtg:theme', next); } catch { /* storage unavailable */ }
    // Re-render so canvas charts and the share card pick up the new colours.
    if (baseRoute) {
      const { name, params } = baseRoute, h = baseHash;
      baseHash = null;
      renderBase(name, params, h);
    }
    if (countryApi) {
      const [iso, reg] = openKey.split('/');
      countryApi.destroy();
      countryApi = null;
      openKey = null;
      openPanel(iso, reg, new URLSearchParams());
    }
  });
}

async function start() {
  try {
    await init();
  } catch (e) {
    main.innerHTML = `<div class="container loading-shell"><h2>Couldn't load the data</h2><p class="muted">${String(e.message)}</p><p><button class="btn" onclick="location.reload()">Retry</button></p></div>`;
    return;
  }
  $('#data-version').textContent = `Data v${state.meta.dataVersion} · updated ${state.meta.lastUpdated}`;
  mountSearch($('#header-search'));
  setupTheme();
  panel.addEventListener('click', e => { if (e.target.closest('[data-close]')) requestClose(); });
  scrim.addEventListener('click', requestClose);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden && !e.target.closest('.search')) requestClose();
  });
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    idle(() => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

start();
