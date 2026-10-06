// UI strings (i18n-ready). English first; add other locales as sibling objects.

const en = {
  'cls.best': 'Best',
  'cls.shoulder': 'Shoulder',
  'cls.worst': 'Avoid',
  'cls.na': 'Mixed / no strong signal',
  'cls.nodata': 'No data yet',
  'act.sun': 'Sun',
  'act.beach': 'Beach',
  'act.mountain': 'Mountain & hiking',
  'act.snow': 'Snow & ski',
  'act.city': 'City & culture',
  'act.nature': 'Nature & wildlife',
  'act.diving': 'Diving & snorkelling',
  'act.roadtrip': 'Road trip',
  'home.title': 'Know exactly <em>when</em> to go.',
  'home.lede': 'The best and worst weeks to visit every country and region, with the reasons: monsoons, hurricanes, heat, crowds, prices and the holidays that fill hotels.',
  'home.search': 'Search a country, region or city…',
  'home.rightNow': 'Right now is great for…',
  'home.rightNowSub': 'Places in their best window today',
  'home.whereIn': 'Where to go in…',
  'home.map': 'The world, month by month',
  'home.mapSub': 'Each country takes the colour of its best-suited region',
  'finder.title': 'Where should I go?',
  'finder.lede': 'Pick your dates and what you want to do. Every region is scored on season, activity fit, risks and crowds.',
  'search.recent': 'Recent searches',
  'search.none': 'No matches. Try a city, region or country name.',
  'price.banner': 'Price data is from {ref}; figures for {year} are projections.',
  'price.estimated': 'Estimated for {year} (based on {ref} data {pct})',
  'price.reference': 'Prices at {ref} levels',
};

let dict = en;
export function t(key, vars) {
  let s = dict[key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}

export const ACTIVITY_ICON = {
  sun: '☀️', beach: '🏖️', mountain: '🥾', snow: '⛷️', city: '🏛️', nature: '🦜', diving: '🤿', roadtrip: '🚗',
};

export function riskIcon(type) {
  const t = type.toLowerCase();
  if (/hurricane|typhoon|cyclone/.test(t)) return '🌀';
  if (/monsoon|heavy rain/.test(t)) return '🌧️';
  if (/fire/.test(t)) return '🔥';
  if (/heat/.test(t)) return '🌡️';
  if (/flood|sea|surf/.test(t)) return '🌊';
  if (/fog|pollution|smoke|haze/.test(t)) return '🌫️';
  if (/blizzard|cold|snap/.test(t)) return '❄️';
  if (/avalanche/.test(t)) return '🏔️';
  if (/thunder|lightning/.test(t)) return '⛈️';
  if (/tornado/.test(t)) return '🌪️';
  if (/landslide/.test(t)) return '⛰️';
  if (/road/.test(t)) return '🚧';
  if (/shark/.test(t)) return '🦈';
  return '⚠️';
}
