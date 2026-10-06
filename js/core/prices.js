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
