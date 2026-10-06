// The 52-week season strip: the app's signature visual.
import { weekClasses, windowAt, CLASS_NAMES } from '../core/season.js';
import { doyToMmdd, formatMmdd, MONTH_SHORT, YEAR_DAYS, todayDoy } from '../core/dates.js';
import { esc, tooltip } from '../lib/util.js';
import { t } from '../lib/strings.js';

let uid = 0;

/** Contiguous [start, end] doy segments of a (possibly wrapping) day list. */
function segments(days) {
  if (!days?.length) return [];
  const out = [];
  let s = days[0], p = days[0];
  for (let i = 1; i < days.length; i++) {
    if (days[i] === p + 1) { p = days[i]; continue; }
    out.push([s, p]);
    s = p = days[i];
  }
  out.push([s, p]);
  return out;
}

const pct = d => (d / YEAR_DAYS) * 100;

/**
 * HTML for a strip.
 * opts.mini        compact version for cards
 * opts.range       array of doy to outline (finder selection)
 * opts.holidays    [{ name, start, end }] doy spans drawn under the strip
 * opts.label       accessible label prefix
 */
export function stripHtml(region, opts = {}) {
  const id = 'strip-' + ++uid;
  const weeks = weekClasses(region);
  const today = todayDoy();
  const counts = { best: 0, shoulder: 0, worst: 0 };
  for (const w of weeks) if (CLASS_NAMES[w.cls] in counts) counts[CLASS_NAMES[w.cls]]++;
  const summary = `${opts.label || region.name}: ${counts.best} best weeks, ${counts.shoulder} shoulder weeks, ${counts.worst} weeks to avoid.`;
  return `
  <div class="strip${opts.mini ? ' mini' : ''}" id="${id}" data-region-name="${esc(region.name)}">
    <div class="strip-weeks" ${opts.mini ? `role="img" aria-label="${esc(summary)}"` : `tabindex="0" role="group" aria-label="${esc(summary)} Use the left and right arrow keys to read each week." aria-describedby="${id}-live"`}>
      ${weeks.map(w => `<span class="strip-week cls-${CLASS_NAMES[w.cls]}" data-w="${w.index}" style="animation-delay:${opts.mini ? 0 : w.index * 8}ms"></span>`).join('')}
    </div>
    ${opts.today === false ? '' : `<div class="strip-today" style="left:calc(${pct(today)}% - 1px)" data-label="Today" aria-hidden="true"></div>`}
    ${segments(opts.range).map(([a, b]) => `<div class="strip-range" style="left:${pct(a)}%;width:${pct(b - a + 1)}%" aria-hidden="true"></div>`).join('')}
    ${opts.holidays?.length ? `<div class="strip-holidays" aria-hidden="true">${opts.holidays.map(h => {
      const segs = h.start <= h.end ? [[h.start, h.end]] : [[h.start, YEAR_DAYS - 1], [0, h.end]];
      return segs.map(([a, b]) => `<span title="${esc(h.name)}" style="left:${pct(a)}%;width:${pct(b - a + 1)}%"></span>`).join('');
    }).join('')}</div>` : ''}
    <div class="strip-months" aria-hidden="true">${MONTH_SHORT.map(m => `<span>${opts.mini ? m[0] : m}</span>`).join('')}</div>
    ${opts.mini ? '' : `<div class="visually-hidden" id="${id}-live" aria-live="polite"></div>`}
  </div>`;
}

function weekText(region, w) {
  const weeks = weekClasses(region);
  const wk = weeks[w];
  const { window } = windowAt(region, Math.min(wk.start + 3, wk.end));
  const cls = CLASS_NAMES[wk.cls];
  const dates = `${formatMmdd(doyToMmdd(wk.start))} – ${formatMmdd(doyToMmdd(wk.end))}`;
  return { cls, dates, why: window?.why || '' };
}

/** Wire tooltips and keyboard navigation for strips inside root. regionFor(el) returns the region data. */
export function attachStrips(root, regionFor) {
  for (const strip of root.querySelectorAll('.strip')) {
    if (strip.dataset.wired) continue;
    strip.dataset.wired = '1';
    const region = regionFor(strip);
    if (!region) continue;
    const weeksEl = strip.querySelector('.strip-weeks');
    const live = strip.querySelector('[aria-live]');
    let active = -1;

    const show = (w, anchor) => {
      const { cls, dates, why } = weekText(region, w);
      const r = anchor.getBoundingClientRect();
      tooltip.show(`<strong>${esc(dates)} · ${esc(t('cls.' + cls))}</strong>${why ? esc(why) : ''}`, r.left + r.width / 2, r.top);
    };
    const setActive = w => {
      weeksEl.querySelector('.active')?.classList.remove('active');
      active = Math.max(0, Math.min(51, w));
      const cell = weeksEl.children[active];
      cell.classList.add('active');
      show(active, cell);
      if (live) {
        const { cls, dates, why } = weekText(region, active);
        live.textContent = `${dates}: ${t('cls.' + cls)}. ${why}`;
      }
    };

    weeksEl.addEventListener('pointerover', e => {
      const cell = e.target.closest('.strip-week');
      if (cell) show(Number(cell.dataset.w), cell);
    });
    weeksEl.addEventListener('pointerleave', () => { if (document.activeElement !== weeksEl) tooltip.hide(); });
    weeksEl.addEventListener('click', e => {
      const cell = e.target.closest('.strip-week');
      if (cell) { e.stopPropagation(); show(Number(cell.dataset.w), cell); }
    });
    if (!strip.classList.contains('mini')) {
      weeksEl.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setActive(active < 0 ? Math.floor(todayDoy() / 7) : active + (e.key === 'ArrowRight' ? 1 : -1));
        } else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(51); }
        else if (e.key === 'Escape') { tooltip.hide(); }
      });
      weeksEl.addEventListener('focus', () => setActive(active < 0 ? Math.min(51, Math.floor(todayDoy() / 7)) : active));
      weeksEl.addEventListener('blur', () => { weeksEl.querySelector('.active')?.classList.remove('active'); tooltip.hide(); });
    }
  }
}

document.addEventListener('click', () => tooltip.hide());
document.addEventListener('scroll', () => tooltip.hide(), { passive: true, capture: true });

export function legendHtml() {
  return `<div class="legend" aria-hidden="true">
    <span><i class="sw cls-best"></i>${t('cls.best')}</span>
    <span><i class="sw cls-shoulder"></i>${t('cls.shoulder')}</span>
    <span><i class="sw cls-worst"></i>${t('cls.worst')}</span>
    <span><i class="sw cls-na"></i>${t('cls.na')}</span>
  </div>`;
}
