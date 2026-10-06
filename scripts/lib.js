// Shared helpers for the dev-only Node scripts.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadMeta() {
  return readJson(join(DATA, 'meta.json'));
}

/** All continent files that exist, as [{ name, file, path, json }]. */
export function loadContinents(meta = loadMeta()) {
  return meta.continents
    .map(c => ({ ...c, path: join(DATA, `${c.file}.json`) }))
    .filter(c => existsSync(c.path))
    .map(c => ({ ...c, json: readJson(c.path) }));
}

// Compact JSON formatter matching the hand-written style of the data files:
// arrays of primitives and small flat objects stay on one line.
export function fmt(v, indent = '') {
  const inner = indent + '  ';
  const flat = x => x === null || typeof x !== 'object';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every(flat)) return '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
    const flatObj = y => y && typeof y === 'object' && !Array.isArray(y) && Object.values(y).every(flat);
    const oneLine = v.every(x => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(y => flat(y) || flatObj(y) || (Array.isArray(y) && y.every(flat))));
    if (oneLine && v.every(x => Object.values(x).every(flat))) {
      const s = '[ ' + v.map(inlineObj).join(', ') + ' ]';
      if (s.length < 110) return s;
    }
    if (oneLine) return '[\n' + v.map(x => inner + inlineObj(x)).join(',\n') + '\n' + indent + ']';
    return '[\n' + v.map(x => inner + fmt(x, inner)).join(',\n') + '\n' + indent + ']';
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    if (!entries.length) return '{}';
    if (entries.every(([, x]) => flat(x)) && JSON.stringify(v).length < 90) return inlineObj(v);
    return '{\n' + entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner)}`).join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(v);
}
function inlineObj(o) {
  const val = x => Array.isArray(x) ? '[' + x.map(y => JSON.stringify(y)).join(', ') + ']'
    : x && typeof x === 'object' ? inlineObj(x) : JSON.stringify(x);
  return '{ ' + Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}: ${val(x)}`).join(', ') + ' }';
}
