// Climate charts (Chart.js) with best/shoulder/worst background bands and
// data-table fallbacks that render even if Chart.js fails to load.
import { getChart } from '../lib/libs.js';
import { monthClasses, CLASS_NAMES } from '../core/season.js';
import { MONTH_SHORT } from '../core/dates.js';
import { cssVar, esc } from '../lib/util.js';

const live = new Set();
export function destroyCharts(root) {
  for (const c of [...live]) if (!root || root.contains(c.canvas)) { c.destroy(); live.delete(c); }
}

const bandPlugin = {
  id: 'seasonBands',
  beforeDatasetsDraw(chart, _args, opts) {
    const classes = opts?.classes;
    if (!classes) return;
    const { ctx, chartArea: a, scales: { x } } = chart;
    const colors = { best: cssVar('--best'), shoulder: cssVar('--shoulder'), worst: cssVar('--worst') };
    const step = (x.getPixelForValue(1) - x.getPixelForValue(0)) || a.width / 12;
    ctx.save();
    ctx.globalAlpha = 0.13;
    classes.forEach((cls, i) => {
      const name = CLASS_NAMES[cls];
      if (!colors[name]) return;
      ctx.fillStyle = colors[name];
      const cx = x.getPixelForValue(i);
      ctx.fillRect(Math.max(a.left, cx - step / 2), a.top, step, a.bottom - a.top);
    });
    ctx.restore();
  },
};

function baseOptions(Chart, extra = {}) {
  const text = cssVar('--muted'), grid = cssVar('--chart-grid');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = text;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { backgroundColor: cssVar('--text'), titleColor: cssVar('--bg'), bodyColor: cssVar('--bg'), padding: 10, cornerRadius: 8 },
      ...extra.plugins,
    },
    scales: {
      x: { offset: true, grid: { display: false }, ticks: { color: text } },
      ...Object.fromEntries(Object.entries(extra.scales || {}).map(([k, v]) => [k, { grid: { color: grid }, ticks: { color: text }, ...v }])),
    },
  };
}

function table(caption, rows) {
  return `<details class="data-table"><summary>Show data table</summary><div class="table-scroll"><table>
    <caption>${esc(caption)}</caption>
    <thead><tr><th scope="col">Series</th>${MONTH_SHORT.map(m => `<th scope="col">${m}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, vals]) => `<tr><th scope="row">${esc(label)}</th>${vals.map(v => `<td>${v ?? '–'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

/**
 * Render all region charts into container.
 * priceSeries: optional { label, values[12] } for the crowds-vs-price chart.
 */
export async function renderRegionCharts(container, region, priceSeries) {
  const c = region.climate;
  const hasSea = Array.isArray(c.seaTempC);
  const hasPrice = !!priceSeries;
  container.innerHTML = `
    <div class="chart-grid">
      <div class="chart-box wide">
        <h3>Temperature & rainfall</h3>
        <div class="chart-wrap"><canvas aria-label="Average high and low temperature with monthly rainfall" role="img"></canvas></div>
        ${table('Monthly climate averages', [['Avg high °C', c.avgHighC], ['Avg low °C', c.avgLowC], ['Rain mm', c.rainMm], ['Rain days', c.rainDays], ['Humidity %', c.humidity || Array(12).fill(null)]])}
      </div>
      <div class="chart-box">
        <h3>Sunshine hours per month</h3>
        <div class="chart-wrap"><canvas aria-label="Monthly sunshine hours" role="img"></canvas></div>
        ${table('Sunshine', [['Sun hours', c.sunHours]])}
      </div>
      ${hasSea ? `<div class="chart-box">
        <h3>Sea temperature</h3>
        <div class="chart-wrap"><canvas aria-label="Monthly sea surface temperature" role="img"></canvas></div>
        ${table('Sea surface temperature', [['Sea °C', c.seaTempC]])}
      </div>` : ''}
      <div class="chart-box${hasSea ? ' wide' : ''}">
        <h3>Crowds vs price</h3>
        <div class="chart-wrap"><canvas aria-label="Crowd level and estimated daily cost by month" role="img"></canvas></div>
        ${table('Crowds (1–5) and estimated mid-range cost per day', [['Crowds 1–5', region.crowds], ...(hasPrice ? [[priceSeries.label, priceSeries.values.map(v => Math.round(v))]] : [])])}
      </div>
    </div>`;

  let Chart;
  try { Chart = await getChart(); } catch { return; }
  if (!container.isConnected) return;
  const canvases = container.querySelectorAll('canvas');
  const bands = { seasonBands: { classes: monthClasses(region) } };
  const col = { best: cssVar('--best'), worst: cssVar('--worst'), shoulder: cssVar('--shoulder'), link: cssVar('--link'), text: cssVar('--text'), muted: cssVar('--muted') };
  const make = (canvas, cfg) => live.add(new Chart(canvas, { plugins: [bandPlugin], ...cfg }));
  let i = 0;

  make(canvases[i++], {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [
        { type: 'line', label: 'High °C', data: c.avgHighC, borderColor: col.worst, backgroundColor: col.worst, tension: 0.35, yAxisID: 't', pointRadius: 2.5 },
        { type: 'line', label: 'Low °C', data: c.avgLowC, borderColor: col.link, backgroundColor: col.link, tension: 0.35, yAxisID: 't', pointRadius: 2.5 },
        { type: 'bar', label: 'Rain mm', data: c.rainMm, backgroundColor: col.link + '55', borderRadius: 4, yAxisID: 'r' },
      ],
    },
    options: baseOptions(Chart, {
      plugins: bands,
      scales: { t: { position: 'left', title: { display: true, text: '°C' } }, r: { position: 'right', grid: { display: false }, title: { display: true, text: 'mm' }, beginAtZero: true } },
    }),
  });
  make(canvases[i++], {
    type: 'bar',
    data: { labels: MONTH_SHORT, datasets: [{ label: 'Sun hours', data: c.sunHours, backgroundColor: col.shoulder, borderRadius: 4 }] },
    options: baseOptions(Chart, { plugins: { ...bands, legend: { display: false } }, scales: { y: { beginAtZero: true } } }),
  });
  if (hasSea) make(canvases[i++], {
    type: 'line',
    data: { labels: MONTH_SHORT, datasets: [{ label: 'Sea °C', data: c.seaTempC, borderColor: col.link, backgroundColor: col.link + '33', fill: true, tension: 0.35, pointRadius: 2.5 }] },
    options: baseOptions(Chart, { plugins: { ...bands, legend: { display: false } }, scales: { y: { suggestedMin: Math.min(...c.seaTempC) - 2, suggestedMax: Math.max(...c.seaTempC) + 1 } } }),
  });
  make(canvases[i++], {
    type: 'line',
    data: {
      labels: MONTH_SHORT,
      datasets: [
        { label: 'Crowds (1–5)', data: region.crowds, borderColor: col.text, backgroundColor: col.text, stepped: 'middle', yAxisID: 'c', pointRadius: 0 },
        ...(hasPrice ? [{ label: priceSeries.label, data: priceSeries.values, borderColor: col.best, backgroundColor: col.best + '33', fill: true, tension: 0.3, yAxisID: 'p', pointRadius: 2 }] : []),
      ],
    },
    options: baseOptions(Chart, {
      plugins: bands,
      scales: { c: { position: 'left', min: 0, max: 5, ticks: { stepSize: 1 } }, ...(hasPrice ? { p: { position: 'right', grid: { display: false }, beginAtZero: true } } : {}) },
    }),
  });
}

/** Compact temperature + rain chart for the compare view. */
export async function renderMiniClimate(canvas, region) {
  let Chart;
  try { Chart = await getChart(); } catch { return; }
  if (!canvas.isConnected) return;
  const c = region.climate;
  live.add(new Chart(canvas, {
    type: 'bar',
    plugins: [bandPlugin],
    data: {
      labels: MONTH_SHORT.map(m => m[0]),
      datasets: [
        { type: 'line', label: 'High °C', data: c.avgHighC, borderColor: cssVar('--worst'), backgroundColor: cssVar('--worst'), tension: 0.35, yAxisID: 't', pointRadius: 0 },
        { type: 'line', label: 'Low °C', data: c.avgLowC, borderColor: cssVar('--link'), backgroundColor: cssVar('--link'), tension: 0.35, yAxisID: 't', pointRadius: 0 },
        { type: 'bar', label: 'Rain mm', data: c.rainMm, backgroundColor: cssVar('--link') + '55', borderRadius: 3, yAxisID: 'r' },
      ],
    },
    options: baseOptions(Chart, {
      plugins: { seasonBands: { classes: monthClasses(region) }, legend: { display: false } },
      scales: { t: { position: 'left', suggestedMin: -10, suggestedMax: 40 }, r: { position: 'right', grid: { display: false }, beginAtZero: true, suggestedMax: 400, display: false } },
    }),
  }));
}
