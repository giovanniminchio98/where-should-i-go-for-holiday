# WhenToGo data schema

All app content lives in JSON files in this folder. `scripts/validate.js` enforces every rule
below, and CI runs it on every push.

| File | Purpose |
|---|---|
| `meta.json` | Data version, exchange rates, inflation assumptions, continent → file mapping, sources |
| `<continent>.json` | Full country records (`europe.json`, `asia.json`, `africa.json`, `north-america.json`, `south-america.json`, `oceania.json`) |
| `index.json` | **Generated** by `node scripts/build-index.js`. Never edit it by hand. It holds names, aliases, cities and a compact copy of each region's windows and key climate series, which is enough for search, the map and the finder. |

## Conventions

- **Dates** are year-independent `"MM-DD"` strings. A window `{ "from": "12-01", "to": "02-28" }`
  wraps the year end. Both ends are inclusive. `02-29` is treated as `02-28`.
- **Monthly series** are arrays of 12 numbers, January first.
- **Climate** values are long-term averages (1991–2020 normals) for the region's
  representative point (`lat`/`lon`).
- Never ship placeholder text ("TBD", "TODO", "lorem ipsum"…); the validator rejects it.

## Continent file

```json
{ "continent": "Europe", "countries": [ Country, … ] }
```

## Country

| Field | Type | Rules |
|---|---|---|
| `iso2` | string | ISO 3166-1 alpha-2, unique across all files |
| `isoNum` | string | ISO 3166-1 numeric, 3 digits (`"076"`), used to colour the world map |
| `name` | string | English short name |
| `aliases` | string[] | Local and alternative names, searchable |
| `continent` | string | Must match the file's continent |
| `flag` | string | Emoji flag |
| `summary` | string | One paragraph (≥ 80 chars) on the seasonal logic of the country |
| `splitByRegion` | boolean | `true` → 2+ regions. `false` → exactly one region **and** a `splitReason` |
| `splitReason` | string | Required when `splitByRegion` is false: why the country is climatically uniform |
| `regions` | Region[] | See below; ids unique within the country |
| `cities` | `{ name, aliases[], region }[]` | `region` must be one of the country's region ids |
| `links` | `{ label, url }[]` | ≥ 2, https only (tourism board, travel advice, climate source, entry info) |
| `dataYear` | integer | Year the data was written for |
| `lastReviewed` | string | `YYYY-MM` |

## Region

| Field | Type | Rules |
|---|---|---|
| `id` | string | Lowercase slug (`north`, `pacific-northwest`) |
| `name` | string | Display name |
| `description` | string | Which provinces, states or places it covers |
| `lat`, `lon` | number | Representative point (used by `fetch-climate.js` and the locator map) |
| `seaLat`, `seaLon` | number? | Optional offshore point for sea-temperature fetching |
| `tags` | string[] | Free-form (`beach`, `snow`, `city`…) |
| `best` | Window[] | ≥ 1. Each has `from`, `to`, `why` (≥ 20 chars) and optional `goodFor` (activity keys) |
| `worst` | Window[] | `from`, `to`, `why`. Must not overlap `best` |
| `shoulder` | Window[] | `from`, `to`, `why` |
| `activityWindows` | object | Keys from `sun`, `beach`, `mountain`, `snow`, `city`, `nature`, `diving`, `roadtrip`; values are non-empty `{ from, to }[]`. Omit an activity the region doesn't offer |
| `climate.avgHighC` | number[12] | −40…50 |
| `climate.avgLowC` | number[12] | ≤ avgHighC for the same month |
| `climate.rainMm` | number[12] | Monthly total, 0…2500 |
| `climate.rainDays` | number[12] | Days with ≥ 1 mm, 0…31 |
| `climate.sunHours` | number[12] | Monthly total, 0…450 |
| `climate.seaTempC` | number[12] \| null | `null` for inland regions |
| `climate.humidity` | number[12] \| null | Mean relative humidity % |
| `crowds` | integer[12] | 1 (empty) … 5 (packed) |
| `risks` | `{ type, from, to, note }[]` | `type` is free text, e.g. `hurricane`, `monsoon`, `typhoon`, `extreme heat`, `wildfire`, `flooding`, `air pollution`, `road closures`. Severity for scoring comes from keywords (see `js/core/score.js`) |
| `recurringHolidays` | Holiday[] | See below |
| `prices` | Prices | See below |

At least ~200 of the 365 days should be classified as best, shoulder or worst (the validator
warns otherwise). Unclassified days show as "mixed".

### Holiday

```json
{ "name": "Carnival", "approx": "Feb/March, moves each year", "effect": "Rio sells out…",
  "moving": { "anchor": "easter", "offsetDays": -51, "durationDays": 6 } }
```

- `approx` (always) is a human description shown when no exact dates can be computed.
- `dates: { from, to }` (optional) gives fixed yearly dates in `MM-DD`.
- `moving` (optional) gives dates computed for the current year:
  `anchor` ∈ `easter`, `chineseNewYear`, `ramadanStart`, `eidAlFitr`, `eidAlAdha`, `diwali`,
  `thanksgivingUS`, `memorialDayUS`, `laborDayUS`, `presidentsDayUS`.
  Lunar anchors use the lookup table in `js/core/holidays.js` (2026–2035); extend it before 2036.

### Prices

```json
{
  "currency": "EUR", "referenceYear": 2026,
  "budgetPerDay":   { "low": 60,  "shoulder": 75,  "high": 100 },
  "midrangePerDay": { "low": 120, "shoulder": 150, "high": 210 },
  "hotelNightMid":  { "low": 80,  "shoulder": 100, "high": 160 },
  "notes": "Coastal hotels in August often double."
}
```

- `currency` must exist in `meta.json → exchangeRates.rates`.
- Each block needs `low ≤ shoulder ≤ high`.
- When the device year is later than `referenceYear`, the app multiplies by
  `(1 + inflation[continent]) ^ years` and labels the figures as estimates.
