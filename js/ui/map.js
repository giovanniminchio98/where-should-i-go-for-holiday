// World choropleth (home + finder) and the small per-country locator map.
import { getGeo } from '../lib/libs.js';
import { countries, findCountryByNum } from '../lib/data.js';
import { esc, tooltip } from '../lib/util.js';

const ANTARCTICA = '010';

// Shapes in the 110m topology without an ISO id (or drawn separately from the
// country whose data covers them) → the iso2 of the country page to open.
const SHAPE_ALIAS = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO', 'New Caledonia': 'FR' };

// Map views remembered per page (zoomKey), so coming back to the finder keeps the zoom.
const savedViews = new Map();

/**
 * Pan and zoom for an SVG map: + / − / reset buttons, pinch, double-click or double-tap,
 * Ctrl/⌘ + wheel (and trackpad pinch), and drag to pan once zoomed in. A plain wheel or a
 * one-finger swipe on the unzoomed map still scrolls the page.
 */
function attachZoom(svg, ctl, W, H, key) {
  const layer = svg.querySelector('.zoom-layer');
  const MAX = 12;
  let v = { k: 1, x: 0, y: 0, ...(key && savedViews.get(key)) };
  let moved = 0;

  const clamp = () => {
    v.k = Math.min(MAX, Math.max(1, v.k));
    v.x = Math.min(0, Math.max(W - W * v.k, v.x));
    v.y = Math.min(0, Math.max(H - H * v.k, v.y));
  };
  const apply = () => {
    clamp();
    layer.setAttribute('transform', `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.k.toFixed(4)})`);
    svg.style.setProperty('--zk', v.k);
    for (const c of layer.querySelectorAll('circle.dot')) c.setAttribute('r', (5 / Math.sqrt(v.k)).toFixed(2));
    svg.classList.toggle('zoomed', v.k > 1.01);
    ctl.querySelector('[data-zoom=reset]').hidden = v.k <= 1.01;
    ctl.querySelector('[data-zoom=out]').disabled = v.k <= 1.01;
    ctl.querySelector('[data-zoom=in]').disabled = v.k >= MAX - 0.01;
    if (key) savedViews.set(key, { ...v });
  };
  // Client coordinates → SVG user units.
  const toSvg = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return [((cx - r.left) / r.width) * W, ((cy - r.top) / r.height) * H];
  };
  const zoomAt = (px, py, f) => {
    const k = Math.min(MAX, Math.max(1, v.k * f));
    v.x = px - ((px - v.x) * k) / v.k;
    v.y = py - ((py - v.y) * k) / v.k;
    v.k = k;
    apply();
  };
  let anim;
  const animateTo = target => {
    cancelAnimationFrame(anim);
    const from = { ...v }, t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / 220), e = 1 - (1 - t) ** 3;
      v = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      apply();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const zoomCentre = f => {
    const k = Math.min(MAX, Math.max(1, v.k * f));
    const px = W / 2, py = H / 2;
    const t = { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    const save = v; v = { ...t }; clamp(); const c = { ...v }; v = save;
    animateTo(c);
  };

  ctl.addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    if (b.dataset.zoom === 'in') zoomCentre(2);
    else if (b.dataset.zoom === 'out') zoomCentre(0.5);
    else animateTo({ k: 1, x: 0, y: 0 });
  });

  svg.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;          // plain wheel scrolls the page
    e.preventDefault();
    const [px, py] = toSvg(e.clientX, e.clientY);
    zoomAt(px, py, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
  }, { passive: false });

  svg.addEventListener('dblclick', e => {
    e.preventDefault();
    const [px, py] = toSvg(e.clientX, e.clientY);
    const k = Math.min(MAX, v.k * 2.5);
    const save = v; v = { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }; clamp(); const t = { ...v }; v = save;
    animateTo(t);
  });

  // Pointer drag (pan) and two-finger pinch.
  const pts = new Map();
  let last = null, pinch = null, start = null, lastTap = 0;
  svg.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      moved = 0;
      start = [e.clientX, e.clientY];
      last = toSvg(e.clientX, e.clientY);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: v.k };
      moved = 99;
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const [mx, my] = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      zoomAt(mx, my, (pinch.k * (d / pinch.d)) / v.k);
      return;
    }
    if (pts.size !== 1 || !last) return;
    moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]));
    if (v.k <= 1.01 || moved < 4) return;           // unzoomed: let the page scroll
    if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    v.x += p[0] - last[0];
    v.y += p[1] - last[1];
    last = p;
    apply();
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const [p] = [...pts.values()]; last = toSvg(p[0], p[1]); start = p; }
    if (!pts.size) last = null;
    // Double-tap to zoom on touch screens (dblclick isn't reliable there).
    if (e.type === 'pointerup' && e.pointerType === 'touch' && moved < 4) {
      const now = performance.now();
      if (now - lastTap < 300) {
        const [px, py] = toSvg(e.clientX, e.clientY);
        zoomAt(px, py, 2);
        moved = 99;
        lastTap = 0;
      } else lastTap = now;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  apply();
  return { dragged: () => moved >= 6 };
}

/**
 * Mount the world map.
 * opts.classFor(country)  → 'best' | 'shoulder' | 'worst' | 'na'
 * opts.labelFor(country)  → HTML for the tooltip
 * opts.onSelect(iso2)
 * opts.zoomKey            remembers the pan/zoom under this key while the app is open
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

  container.innerHTML = `<div class="map-zoom-wrap">
    <svg class="world-map" viewBox="0 0 ${W} ${H}" role="group" aria-label="World map coloured by how good each country is in the selected period">
      <g class="zoom-layer"><path class="graticule" d="${path(d3.geoGraticule10())}" aria-hidden="true"></path>
      ${shapes}${dots}</g></svg>
    <div class="map-zoom-ctl" role="group" aria-label="Map zoom">
      <button type="button" class="icon-btn" data-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="icon-btn" data-zoom="out" aria-label="Zoom out">−</button>
      <button type="button" class="icon-btn" data-zoom="reset" aria-label="Show the whole world" hidden>⤢</button>
    </div>
  </div>
  <p class="map-hint"><span class="touch-only">Pinch or tap + to zoom, then drag to move around.</span><span class="mouse-only">Zoom with + / −, double-click or Ctrl + scroll, then drag to move around.</span></p>`;
  const svg = container.querySelector('svg');
  const zoom = attachZoom(svg, container.querySelector('.map-zoom-ctl'), W, H, opts.zoomKey);

  const target = e => e.target.closest('[data-iso]');
  svg.addEventListener('pointermove', e => {
    const el = target(e);
    if (!el) return tooltip.hide();
    const c = countries().find(k => k.iso2 === el.dataset.iso);
    tooltip.show(opts.labelFor(c), e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => tooltip.hide());
  svg.addEventListener('click', e => {
    if (zoom.dragged()) return;
    const el = target(e);
    if (el) { tooltip.hide(); opts.onSelect(el.dataset.iso); }
  });
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
  const label = ap ? `<text class="on" x="${lx.toFixed(1)}" y="${(ap[1] > 24 ? ap[1] - 11 : ap[1] + 20).toFixed(1)}" text-anchor="${anchor}">${esc(active.name.replace(/\s*\(.*\)\s*/, ' ').trim())}</text>` : '';
  container.innerHTML = `<svg class="locator" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of ${esc(country.name)} highlighting ${esc(active?.name || '')}">
    ${feature ? `<path d="${path(feature)}"></path>` : ''}${dots}${label}</svg>`;
  // Squeeze a label that would still overflow the frame (long region names).
  const text = container.querySelector('text');
  const room = anchor === 'middle' ? 2 * Math.min(lx, W - lx) : anchor === 'start' ? W - lx : lx;
  if (text && text.getComputedTextLength() > room - 4) {
    text.setAttribute('textLength', room - 4);
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
  container.querySelector('svg').addEventListener('click', e => {
    const id = e.target.closest('circle')?.dataset.region;
    if (id) onPick(id);
  });
}
