// Currency conversion and inflation projection using the static tables in data/meta.json.

export function convert(amount, from, to, fx) {
  if (from === to) return amount;
  const r = fx.rates;
  if (!r[from] || !r[to]) return null;
  return (amount / r[from]) * r[to];
}

/** Compounded inflation factor from the price block's reference year to `year`. */
export function inflationFactor(continent, referenceYear, year, meta) {
  const years = year - referenceYear;
  if (years <= 0) return 1;
  const rate = meta.inflation.rates[continent] ?? 0.03;
  return Math.pow(1 + rate, years);
}

export function formatMoney(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '–';
  const v = amount >= 100 ? Math.round(amount / 5) * 5 : Math.round(amount);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v} ${currency}`;
  }
}

/** Mid-range shoulder-season daily cost in EUR at reference prices (used for price badges and scoring). */
export function midEurPerDay(prices, fx) {
  if (!prices?.midrangePerDay) return null;
  const v = convert(prices.midrangePerDay.shoulder, prices.currency, 'EUR', fx);
  return v == null ? null : Math.round(v);
}

/** Price tier of a month from its crowd level (1–5), as on the country page's price chart. */
export const tierForCrowd = c => (c <= 2 ? 'low' : c === 3 ? 'shoulder' : 'high');

/**
 * Rough per-person cost of a stay, excluding flights.
 *   days   day-of-year values of the trip (one per day)
 *   level  '' | 'mid' | 'budget' | 'luxury'
 * Daily figures in the data are all-in per person (accommodation share, food, local
 * transport, activities); hotelNightMid is a double room. Mid-range: each day costs the
 * daily figure minus half a room, each night adds half a room (sharing a double), all at
 * that day's season tier. Budget uses budgetPerDay; luxury is about twice mid-range.
 * Returns amounts in `currency`, projected to `year`, or null if prices are missing.
 */
export function tripEstimate(region, continent, days, { level = '', year, currency, meta, monthOf }) {
  const p = region.prices;
  if (!p?.midrangePerDay || !days.length) return null;
  const factor = inflationFactor(continent, p.referenceYear, year, meta);
  const tier = d => tierForCrowd(region.crowds?.[monthOf(d)] ?? 3);
  const nights = Math.max(0, days.length - 1);
  let stay = 0, daily = 0;
  if (level === 'budget') {
    for (const d of days) daily += p.budgetPerDay[tier(d)];
  } else {
    const k = level === 'luxury' ? 2 : 1;
    days.forEach((d, i) => {
      const t = tier(d), share = p.hotelNightMid[t] / 2;
      daily += k * Math.max(p.midrangePerDay[t] - share, 0.35 * p.midrangePerDay[t]);
      if (i < nights) stay += k * share;
    });
  }
  const cv = v => convert(v * factor, p.currency, currency, meta.exchangeRates);
  const out = { days: days.length, nights, currency, projected: factor > 1, stay: level === 'budget' ? null : cv(stay), daily: cv(daily) };
  out.total = (out.stay || 0) + out.daily;
  return out;
}
