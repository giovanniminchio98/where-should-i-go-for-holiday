# WhenToGo

**The best (and worst) time to visit every country, by exact weeks and with the reasons.**

WhenToGo is a fully static web app. For each country and climate region it shows:

- **best**, **shoulder** and **worst** periods as exact date ranges, with why
- a 52-week **season strip** with a "today" marker and this year's holiday dates
- climate charts (temperature, rain, sunshine, sea temperature, crowds vs price)
- seasonal **risks** (monsoon, hurricane, typhoon, heat, wildfire…)
- **recurring holidays** that affect crowds and prices, with this year's dates
- rough **prices** per season, with a currency toggle and inflation projection

It also has a **"Where should I go?" finder** (dates + activities + continents → ranked regions),
a month-by-month **world map**, **compare** mode, a **saved** shortlist, **plan a year**,
shareable PNG season cards, print styles, light/dark themes and offline support.

Search covers every country, its regions and curated cities. If you type a town that isn't
curated, an offline world gazetteer (about 47,000 places from GeoNames) finds it and shows the
nearest region of its country, clearly marked **regional info**.

Everything is based on **recurring seasonal patterns**, not one-off events, so the app stays
useful year after year.

## Status

**181 countries and territories, 311 regions**: all of Europe, Asia and Africa, South
America, the Caribbean and the USA. Canada, Mexico, Central America, Greenland and Oceania
are being added next. Run `node scripts/validate.js` for the current coverage report.

## Run locally

No build step. Any static server works:

```sh
npx serve .
# open http://localhost:3000
```

(Opening `index.html` directly from disk won't work, because browsers block `fetch()` on `file://` URLs.)

## Deploy to GitHub Pages

**Option A: GitHub Actions (recommended).** The workflow in `.github/workflows/pages.yml`
validates the data and runs the tests on every push and PR, then deploys `main` to Pages.

1. Push to `main`.
2. In the repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The site appears at `https://<user>.github.io/<repo>/`.

**Option B: deploy from a branch.** Choose **Source: Deploy from a branch**, then `main` / `/ (root)`.
The `.nojekyll` file makes Pages serve the files as they are.

All paths are relative, so the app works from a sub-path like `/where-should-i-go-for-holiday/`.

## Project layout

```
index.html               app shell
css/styles.css           design system (tokens, light/dark), components
css/print.css            print-friendly country page
js/app.js                bootstrap + hash router (#/country/IT/north, #/finder?…)
js/core/                 pure logic shared with the Node scripts
  dates.js               MM-DD ↔ day-of-year, year-wrapping windows
  season.js              best/shoulder/worst classification, week strip, verdicts
  score.js               finder scoring (formula documented at the top of the file)
  holidays.js            Easter + lookup tables for lunar holidays 2026–2035
  prices.js              currency conversion, inflation projection
js/lib/                  data loading, CDN loader (pinned + SRI), strings (i18n), utils
js/ui/                   season strip, world/locator maps, charts, search, share card
js/views/                home, country panel, finder, compare, saved, plan, about
data/                    JSON data (see data/SCHEMA.md)
scripts/                 dev-only Node tools (no dependencies)
sw.js, manifest.webmanifest, icons/   offline support + installable PWA
```

Third-party libraries load lazily from jsDelivr, with exact versions and subresource integrity:
Chart.js 4.4.1, Fuse.js 7.0.0, d3-geo 3.1.1 (+ d3-array 3.2.4), topojson-client 3.1.0 and
world-atlas 2.0.2 (110m).

## Data workflow

```sh
node scripts/build-index.js     # regenerate data/index.json after editing any data file
node scripts/validate.js        # schema + semantic checks + coverage report
node scripts/test.js            # unit tests (dates, seasons, holidays, finder)
npm run check                   # all three
```

### Adding a country

1. Add the country object to the right `data/<continent>.json`, following `data/SCHEMA.md`.
   Split it into regions wherever the seasons differ meaningfully (opposite monsoons, mountains
   vs coast, hemispheres…). If it's climatically uniform, use one region and explain why in
   `splitReason`.
   Or write it in the compact authoring shorthand documented at the top of
   `scripts/add-countries.js` and merge it with `node scripts/add-countries.js my-countries.json`,
   which expands it to the full schema and keeps each continent file sorted and formatted.
2. Give each region a representative `lat`/`lon` and optionally refresh its climate with
   `node scripts/fetch-climate.js --only=XX --write` (see below).
3. Run `npm run check`.

### Yearly update checklist

Climate normals don't need yearly updates. Prices and events do:

1. **Prices**: review the `prices` blocks, then bump `referenceYear` (until then, the app
   projects old prices forward with the inflation rates in `meta.json` and shows a banner).
2. **Exchange rates**: update `meta.json → exchangeRates` (`rates` and `date`).
3. **Inflation assumptions**: adjust `meta.json → inflation.rates` if needed.
4. **Holiday table**: `js/core/holidays.js` covers lunar dates for 2026–2035. Extend it before 2036.
5. Update `lastReviewed` on the countries you checked, bump `meta.json → dataVersion` and
   `lastUpdated`, and bump `VERSION` in `sw.js` so offline caches refresh.
6. `npm run check`, then push.

### Unlisted towns (world gazetteer)

`data/cities.tsv` lists about 47k places with 5,000+ people, plus capitals, from
[GeoNames](https://www.geonames.org) (CC BY 4.0). It is fetched only when a search reaches 3+
characters. Each place is matched to the nearest region of its country, using the region
reference points and the curated cities as anchors, so adding more curated cities makes the
matching more accurate. To regenerate it:

```sh
npm i --no-save all-the-cities@3.1.0
node scripts/build-cities.js            # --min-pop=5000 by default
```

### Refreshing climate from Open-Meteo

`scripts/fetch-climate.js` recomputes monthly highs, lows, rain, rain days, sunshine and
humidity from the free [Open-Meteo historical API](https://open-meteo.com/en/docs/historical-weather-api)
(ERA5, 1991–2020 by default), plus sea temperature from the Marine API, for each region's
coordinates. No API key is needed.

```sh
node scripts/fetch-climate.js --only=IT            # dry run: prints old vs new values
node scripts/fetch-climate.js --only=IT.north --write
node scripts/build-index.js && node scripts/validate.js
```

Reanalysis cells are about 25 km wide, so check the diff for coastal and mountain regions before writing.

## How the finder scores places

For each region and the chosen days *D*:

| Component | Definition |
|---|---|
| season fit | mean day value over *D*: best 1 · shoulder 0.6 · mixed 0.35 · worst 0 |
| activity fit | mean over chosen activities of the share of *D* inside that activity's window. Regions under 0.2 are excluded |
| risk load | mean over *D* of the worst active risk severity: hurricane/typhoon/cyclone/monsoon 1 · flood/heat/fire/smoke/cold/landslide 0.6 · other 0.3 |
| weather fit | mean of rain fit, temperature comfort for the chosen activities and (beach/diving) sea temperature, from the monthly climate averages |
| crowd fit | (5 − mean crowd level) / 4 |

```
score = 0.45·season + 0.4·activity + 0.15·weather − 0.15·risk
no activity chosen → 0.85·season + 0.15·weather − 0.15·risk
avoid crowds → 0.8·score + 0.2·crowdFit
budget       → + 0.08·cheapness
```

The score is shown out of 100. "Flexible ±2 weeks" also tries the dates shifted by ±7 and ±14
days, keeps the best score, and suggests the shift. The full formula is in `js/core/score.js`.

The map colours each country by its best region for the selected month (average day value
≥ 0.75 best, ≥ 0.45 shoulder, otherwise avoid).

## Accessibility & privacy

- Season colours always come with patterns and text labels. The strip is keyboard-navigable
  and announces each week. Region tabs follow the ARIA tabs pattern. Every chart has a data-table
  fallback, and the search is an ARIA combobox.
- No backend, no accounts, no tracking. Saved places, recent searches and settings live in
  `localStorage` (and the app still works if storage is blocked).

## Disclaimer

WhenToGo is seasonal **guidance, not a guarantee**. Weather varies year to year. Always check
forecasts and official travel advice before booking.

## License

[MIT](LICENSE)
