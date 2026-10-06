// Moving holidays, computed for any year from 2026 to 2035.
// Lunar and lunisolar dates use a lookup table (dates can differ by ±1 day
// depending on moon sighting and country). Easter and the US federal holidays
// are computed with simple rules.

const LUNAR = {
  // Chinese / Lunar New Year (first day)
  chineseNewYear: {
    2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
    2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08',
  },
  // First day of Ramadan (approximate; it runs ~30 days)
  ramadanStart: {
    2026: '02-18', 2027: '02-08', 2028: '01-28', 2029: '01-16', 2030: '01-06',
    2031: '12-15', 2032: '12-04', 2033: '11-23', 2034: '11-12', 2035: '11-01',
  },
  // Eid al-Fitr (end of Ramadan)
  eidAlFitr: {
    2026: '03-20', 2027: '03-10', 2028: '02-27', 2029: '02-14', 2030: '02-05',
    2031: '01-25', 2032: '01-14', 2033: '01-02', 2034: '12-12', 2035: '12-01',
  },
  // Eid al-Adha
  eidAlAdha: {
    2026: '05-27', 2027: '05-16', 2028: '05-05', 2029: '04-24', 2030: '04-13',
    2031: '04-02', 2032: '03-22', 2033: '03-11', 2034: '03-01', 2035: '02-18',
  },
  // Diwali (main day, Lakshmi Puja)
  diwali: {
    2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26',
    2031: '11-14', 2032: '11-02', 2033: '10-22', 2034: '11-10', 2035: '10-30',
  },
};

export const ANCHORS = ['easter', 'chineseNewYear', 'ramadanStart', 'eidAlFitr', 'eidAlAdha', 'diwali',
  'thanksgivingUS', 'memorialDayUS', 'laborDayUS', 'presidentsDayUS'];

export const TABLE_YEARS = [2026, 2035];

/** Western (Gregorian) Easter Sunday — Anonymous Gregorian algorithm. */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** nth weekday of a month (n = -1 for last). weekday: 0 = Sunday. */
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/** Anchor date for a year, or null if outside the lookup table. */
export function anchorDate(anchor, year) {
  switch (anchor) {
    case 'easter': return easter(year);
    case 'thanksgivingUS': return nthWeekday(year, 10, 4, 4);
    case 'memorialDayUS': return nthWeekday(year, 4, 1, -1);
    case 'laborDayUS': return nthWeekday(year, 8, 1, 1);
    case 'presidentsDayUS': return nthWeekday(year, 1, 1, 3);
    default: {
      const s = LUNAR[anchor]?.[year];
      if (!s) return null;
      const [m, d] = s.split('-').map(Number);
      return new Date(year, m - 1, d);
    }
  }
}

/**
 * Concrete dates of a recurring holiday for a given year.
 * Returns { start: Date, end: Date } or null if only an approximate description exists.
 */
export function holidayDates(h, year) {
  if (h.moving) {
    const base = anchorDate(h.moving.anchor, year);
    if (!base) return null;
    const start = new Date(base);
    start.setDate(start.getDate() + (h.moving.offsetDays || 0));
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, h.moving.durationDays || 1) - 1);
    return { start, end };
  }
  if (h.dates) {
    const [fm, fd] = h.dates.from.split('-').map(Number);
    const [tm, td] = h.dates.to.split('-').map(Number);
    const start = new Date(year, fm - 1, fd);
    const end = new Date(h.dates.to < h.dates.from ? year + 1 : year, tm - 1, td);
    return { start, end };
  }
  return null;
}
