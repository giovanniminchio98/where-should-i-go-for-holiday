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
