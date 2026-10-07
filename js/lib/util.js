// Small DOM and browser helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

/** Safe localStorage wrapper: storage can be unavailable (private mode, blocked site data). */
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('wtg:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('wtg:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const scripts = new Map();
/** Load a classic script once (with optional SRI). Resolves when executed. */
export function loadScript(src, integrity) {
  if (scripts.has(src)) return scripts.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = resolve;
    s.onerror = () => { scripts.delete(src); reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  });
  scripts.set(src, p);
  return p;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function idle(fn) {
  return 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/** Read a CSS custom property (for charts and canvas drawing). */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(query) };
}

/** Floating tooltip shared by the strip, map and charts. */
export const tooltip = {
  show(html, x, y) {
    const el = document.getElementById('tooltip');
    el.innerHTML = html;
    el.hidden = false;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
    const top = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  },
  hide() { document.getElementById('tooltip').hidden = true; },
};

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Rewrite the current route's URL without a navigation (e.g. finder filters). */
export function replaceHash(hash) {
  history.replaceState(null, '', hash);
  window.dispatchEvent(new Event('wtg:hash-replaced'));
}
