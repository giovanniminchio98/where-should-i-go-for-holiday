// Year-independent date helpers.
// All seasonal data uses "MM-DD" strings. Internally we map them onto a fixed
// 365-day year ("day of year", 0 = Jan 1, 364 = Dec 31). Feb 29 is folded onto Feb 28.

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const YEAR_DAYS = 365;
const MONTH_START = DAYS_IN_MONTH.reduce((acc, d, i) => (acc.push(i ? acc[i - 1] + DAYS_IN_MONTH[i - 1] : 0), acc), []);
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MMDD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidMmdd(s) {
  if (typeof s !== 'string' || !MMDD_RE.test(s)) return false;
  const [m, d] = s.split('-').map(Number);
  return d <= (m === 2 ? 29 : DAYS_IN_MONTH[m - 1]);
}

export function mmddToDoy(s) {
  const [m, d] = s.split('-').map(Number);
  return MONTH_START[m - 1] + Math.min(d, DAYS_IN_MONTH[m - 1]) - 1;
}

export function doyToMmdd(doy) {
  doy = mod(doy, YEAR_DAYS);
  let m = 0;
  while (m < 11 && doy >= MONTH_START[m + 1]) m++;
  return `${String(m + 1).padStart(2, '0')}-${String(doy - MONTH_START[m] + 1).padStart(2, '0')}`;
}

export function monthOfDoy(doy) {
  doy = mod(doy, YEAR_DAYS);
  let m = 0;
  while (m < 11 && doy >= MONTH_START[m + 1]) m++;
  return m;
}

export function monthStartDoy(m) { return MONTH_START[m]; }

export function mod(n, m) { return ((n % m) + m) % m; }

/** True if doy falls in the [from, to] window (inclusive), handling year wrap. */
export function inWindow(doy, from, to) {
  const a = mmddToDoy(from), b = mmddToDoy(to);
  return a <= b ? doy >= a && doy <= b : doy >= a || doy <= b;
}

/** Number of days covered by a window (wrap-aware). */
export function windowLength(from, to) {
  const a = mmddToDoy(from), b = mmddToDoy(to);
  return a <= b ? b - a + 1 : YEAR_DAYS - a + b + 1;
}

/** Days remaining in a window counted from doy (inclusive), assuming doy is inside it. */
export function daysLeftInWindow(doy, from, to) {
  const b = mmddToDoy(to);
  return mod(b - doy, YEAR_DAYS) + 1;
}

/** Real Date -> day-of-year on the fixed 365-day scale. */
export function dateToDoy(date) {
  const m = date.getMonth(), d = date.getDate();
  return MONTH_START[m] + Math.min(d, DAYS_IN_MONTH[m]) - 1;
}

export function todayDoy(now = new Date()) { return dateToDoy(now); }

/** Format "05-15" as "May 15". */
export function formatMmdd(s) {
  const [m, d] = s.split('-').map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export function formatRange(from, to) {
  const [fm] = from.split('-').map(Number);
  const [tm] = to.split('-').map(Number);
  if (from === '01-01' && to === '12-31') return 'All year';
  if (fm === tm && from <= to) return `${formatMmdd(from)}–${Number(to.slice(3))}`;
  return `${formatMmdd(from)} – ${formatMmdd(to)}`;
}

export function formatDate(date, opts = { month: 'short', day: 'numeric' }) {
  return date.toLocaleDateString('en-GB', opts).replace(/(\d+) (\w+)/, '$2 $1');
}

/** Expand a list of real-date ranges into an array of day-of-year values (max 365 days). */
export function daysBetween(start, end) {
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stop = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= stop && out.length < YEAR_DAYS) {
    out.push(dateToDoy(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}
