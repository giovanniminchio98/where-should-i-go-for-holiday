// About the data: sources, methodology, scoring and disclaimer.
import { countries, state } from '../lib/data.js';
import { esc } from '../lib/util.js';

export function render(main) {
  const m = state.meta;
  const byCont = {};
  for (const c of countries()) (byCont[c.continent] ||= []).push(c);
  main.innerHTML = `
  <div class="container prose">
    <header class="page-head"><p class="eyebrow">About the data</p><h1>How WhenToGo works</h1></header>
    <p><b>WhenToGo is guidance, not a guarantee.</b> It describes recurring seasonal patterns (climate averages, monsoons, hurricane seasons, crowds and regular holidays), not the weather in any particular year. Always check a current forecast and official travel advice before you book.</p>

    <h2>Climate</h2>
    <p>Monthly temperatures, rainfall, rain days, sunshine, humidity and sea temperatures are long-term averages (${esc(m.climateNormals)}) for a representative point in each region. The values were compiled from published climate normals and can be refreshed automatically from the free Open-Meteo historical archive with <code>scripts/fetch-climate.js</code>. Mountain areas, coasts and big regions vary internally, so treat the figures as typical rather than exact.</p>

    <h2>Seasons</h2>
    <p>Each region has <b>best</b>, <b>shoulder</b> and <b>worst</b> periods written as year-independent dates (for example May 15 – Jun 30), each with the reason. They combine weather, sea conditions, natural hazards, crowds, prices and closures. Weeks that fall in none of them are shown as mixed. Holidays that move each year (Easter, Carnival, Chinese New Year, Ramadan, Eid, Diwali and the US federal holidays) are calculated for the current year from a lookup table covering 2026–2035.</p>

    <h2>Prices</h2>
    <p>Daily budgets and hotel rates are typical per-person figures for low, shoulder and high season, recorded at the price level of a stated reference year. In later years the app projects them forward using an annual inflation rate per continent, and labels the result as an estimate. Currency conversion uses static rates dated ${esc(m.exchangeRates.date)}. The finder's trip estimates add up these figures day by day for your dates, each at its season's price (per person, sharing a double room at mid-range level), and leave out flights:</p>
    <div class="card table-scroll"><table><caption>Exchange rates (1 ${esc(m.exchangeRates.base)} =)</caption><tbody>
      ${Object.entries(m.exchangeRates.rates).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="card table-scroll" style="margin-top:12px"><table><caption>Inflation assumptions (per year)</caption><tbody>
      ${Object.entries(m.inflation.rates).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${(v * 100).toFixed(1)}%</td></tr>`).join('')}
    </tbody></table></div>

    <h2>How the finder scores places</h2>
    <p>For your chosen days, each region gets:</p>
    <ul>
      <li><b>Season fit</b>: the average day value, where best = 1, shoulder = 0.6, mixed = 0.35 and worst = 0.</li>
      <li><b>Activity fit</b>: the share of your days that fall inside the region's window for each chosen activity, averaged across activities. Regions below 20% are left out.</li>
      <li><b>Weather fit</b>: how well the month's averages suit your activities: little rain, comfortable highs (around 30 °C for beach, sun and diving; 20–26 °C otherwise) and, for beach and diving, a sea of 21–28 °C or warmer.</li>
      <li><b>Risk load</b>: the share of days with an active hazard, weighted by severity (hurricane, typhoon, cyclone or monsoon 1; flood, heat, fire, smoke, cold or landslide 0.6; others 0.3).</li>
    </ul>
    <pre>score = 0.45 × season + 0.4 × activity + 0.15 × weather − 0.15 × risk
no activity:   score = 0.85 × season + 0.15 × weather − 0.15 × risk
avoid crowds:  score = 0.8 × score + 0.2 × (5 − crowds) / 4
budget:        + 0.08 × cheapness</pre>
    <p>The score is shown out of 100. With “flexible ±2 weeks”, your dates are also tried shifted by ±7 and ±14 days, and the app tells you if a shift scores better.</p>

    <h2>Coverage</h2>
    <p>Data version ${esc(m.dataVersion)}, last updated ${esc(m.lastUpdated)}.</p>
    <div class="card table-scroll"><table><thead><tr><th scope="col">Continent</th><th scope="col">Countries</th><th scope="col">Regions</th></tr></thead><tbody>
      ${Object.entries(byCont).map(([k, list]) => `<tr><th scope="row">${esc(k)}</th><td>${list.length}</td><td>${list.reduce((s, c) => s + c.regions.length, 0)}</td></tr>`).join('')}
    </tbody></table></div>

    <h2>Sources</h2>
    <ul>${m.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
    <p>Each country page also links to its official tourism board, government travel advice and entry requirements.</p>

    <h2>Privacy</h2>
    <p>There are no accounts, trackers or server calls: the app is static files. Your saved places, recent searches and settings stay in your browser's local storage.</p>
  </div>`;
}
