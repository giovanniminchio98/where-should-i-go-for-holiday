// World choropleth (home + finder) and the small per-country locator map.
import { getGeo } from '../lib/libs.js';
import { countries, findCountryByNum } from '../lib/data.js';
import { esc, tooltip } from '../lib/util.js';

const ANTARCTICA = '010';

// Shapes in the 110m topology without an ISO id (or drawn separately from the
// country whose data covers them) → the iso2 of the country page to open.
const SHAPE_ALIAS = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO', 'New Caledonia': 'FR' };

/**
 * Mount the world map.
 * opts.classFor(country)  → 'best' | 'shoulder' | 'worst' | 'na'
 * opts.labelFor(country)  → HTML for the tooltip
 * opts.onSelect(iso2)
 * Returns { refresh() } to recolour after the inputs change.
 */
export async function mountWorldMap(container, opts) {
  container.innerHTML = '<div class="world-map skeleton" aria-hidden="true"></div>';
  let geo;
  try {
    geo = await getGeo();
  } catch {
    container.innerHTML = '<p class="muted small">The map could not be loaded (offline?). Search and the finder still work.</p>';
    return { refresh() {} };
  }
  const { d3, features } = geo;
  const W = 960, H = 470;
  const land = features.filter(f => f.id !== ANTARCTICA);
  const projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'FeatureCollection', features: land });
  const path = d3.geoPath(projection);
  const countryFor = f => (f.id && findCountryByNum(f.id))
    || countries().find(k => k.iso2 === SHAPE_ALIAS[f.properties.name]) || null;
  const drawn = new Set();

  const shapes = land.map(f => {
    const c = countryFor(f);
    if (c) drawn.add(c.iso2);
    return `<path class="country${c ? ' has-data' : ''}" d="${path(f)}" data-num="${f.id || ''}"${c
      ? ` data-iso="${c.iso2}" tabindex="0" role="link" aria-label="${esc(c.name)}"`
      : ` aria-hidden="true"`}><title>${esc(c?.name || f.properties.name)}</title></path>`;
  }).join('');

  // Countries too small for the 110m topology (e.g. Maldives) are drawn as dots.
  const dots = countries().filter(c => !drawn.has(c.iso2)).map(c => {
    const r = c.regions[0];
    const p = projection([r.lon, r.lat]);
    return p ? `<circle class="dot has-data" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" data-iso="${c.iso2}" tabindex="0" role="link" aria-label="${esc(c.name)}"><title>${esc(c.name)}</title></circle>` : '';
  }).join('');

  container.innerHTML = `<svg class="world-map" viewBox="0 0 ${W} ${H}" role="group" aria-label="World map coloured by how good each country is in the selected period">
    <path class="graticule" d="${path(d3.geoGraticule10())}" aria-hidden="true"></path>
    ${shapes}${dots}</svg>`;
  const svg = container.querySelector('svg');

  const target = e => e.target.closest('[data-iso]');
  svg.addEventListener('pointermove', e => {
    const el = target(e);
    if (!el) return tooltip.hide();
    const c = countries().find(k => k.iso2 === el.dataset.iso);
    tooltip.show(opts.labelFor(c), e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => tooltip.hide());
  svg.addEventListener('click', e => { const el = target(e); if (el) { tooltip.hide(); opts.onSelect(el.dataset.iso); } });
  svg.addEventListener('keydown', e => {
    const el = target(e);
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); opts.onSelect(el.dataset.iso); }
  });
  svg.addEventListener('focusin', e => {
    const el = target(e);
    if (!el) return;
    const c = countries().find(k => k.iso2 === el.dataset.iso);
    const r = el.getBoundingClientRect();
    tooltip.show(opts.labelFor(c), r.left + r.width / 2, r.top);
  });
  svg.addEventListener('focusout', () => tooltip.hide());

  function refresh() {
    for (const el of svg.querySelectorAll('[data-iso]')) {
      const c = countries().find(k => k.iso2 === el.dataset.iso);
      const cls = opts.classFor(c);
      el.setAttribute('class', `${el.tagName === 'circle' ? 'dot' : 'country'} has-data fill-${cls}`);
    }
  }
  refresh();
  return { refresh };
}

const activeRegion = (country, id) => country.regions.find(r => r.id === id) || country.regions[0];

/** The largest polygon of a country (e.g. metropolitan France without French Guiana). */
function mainland(d3, f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const parts = f.geometry.coordinates.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } }));
  return parts.reduce((a, b) => (d3.geoArea(b) > d3.geoArea(a) ? b : a));
}

/** Is [lon, lat] inside geoBounds b (which may wrap across 180°), widened by m degrees? */
function inBounds([lon, lat], [[w, s], [e, n]], m) {
  if (lat < s - m || lat > n + m) return false;
  const span = (e - w + 360) % 360 || 360;
  return (lon - (w - m) + 720) % 360 <= span + 2 * m;
}

/** Small map of one country with a dot per region; clicking a dot calls onPick(regionId). */
export async function mountLocator(container, country, activeId, onPick) {
  let geo;
  try { geo = await getGeo(); } catch { container.remove(); return; }
  const { d3, byId, features } = geo;
  const W = 220, H = 180;
  const feature = byId.get(country.isoNum) || features.find(f => !f.id && f.properties.name === country.name);
  // Frame the country shape plus any region points near it (Galápagos), but zoom to the
  // active region alone when it lies far outside the shape (France's overseas regions).
  // Small islands have no 110m shape: frame a ~150 km circle around a lone point
  // (a zero-size extent would give NaN coordinates).
  const coords = country.regions.map(r => [r.lon, r.lat]);
  const a = activeRegion(country, activeId);
  const here = [a.lon, a.lat];
  const main = feature && mainland(d3, feature);
  const box = main && d3.geoBounds(main);
  const near = box ? coords.filter(c => inBounds(c, box, 12)) : coords;
  let target;
  if (country.iso2 === 'US' && feature) target = feature;
  else if (box && !inBounds(here, box, 12)) target = d3.geoCircle().center(here).radius(2.5)();
  else if (main) target = { type: 'FeatureCollection', features: [main, { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: near } }] };
  else if (new Set(coords.map(String)).size > 1) target = { type: 'MultiPoint', coordinates: coords };
  else target = d3.geoCircle().center(here).radius(1.4)();
  // Centre Mercator on the country so shapes crossing 180° (Fiji, Kiribati) stay whole.
  const projection = country.iso2 === 'US' ? d3.geoAlbersUsa() : d3.geoMercator().rotate([-d3.geoCentroid(target)[0], 0]);
  projection.fitExtent([[12, 12], [W - 12, H - 12]], target);
  const path = d3.geoPath(projection);
  const dots = country.regions.map(r => {
    const p = projection([r.lon, r.lat]);
    if (!p || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return '';
    const on = r.id === activeId;
    return `<circle class="${on ? 'on' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${on ? 7 : 5}" data-region="${r.id}"><title>${esc(r.name)}</title></circle>`;
  }).join('');
  const active = country.regions.find(r => r.id === activeId);
  const ap = active && projection([active.lon, active.lat]);
  // Anchor the label away from the nearer edge so long names aren't clipped.
  const anchor = ap && (ap[0] < W / 3 ? 'start' : ap[0] > (2 * W) / 3 ? 'end' : 'middle');
  const lx = ap && (anchor === 'start' ? Math.max(4, ap[0] - 10) : anchor === 'end' ? Math.min(W - 4, ap[0] + 10) : ap[0]);
  const label = ap ? `<text class="on" x="${lx.toFixed(1)}" y="${(ap[1] > 24 ? ap[1] - 11 : ap[1] + 20).toFixed(1)}" text-anchor="${anchor}">${esc(active.name)}</text>` : '';
  container.innerHTML = `<svg class="locator" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of ${esc(country.name)} highlighting ${esc(active?.name || '')}">
    ${feature ? `<path d="${path(feature)}"></path>` : ''}${dots}${label}</svg>`;
  container.querySelector('svg').addEventListener('click', e => {
    const id = e.target.closest('circle')?.dataset.region;
    if (id) onPick(id);
  });
}
