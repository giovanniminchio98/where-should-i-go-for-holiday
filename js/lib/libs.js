// Third-party libraries, loaded lazily from jsDelivr with pinned versions and SRI.
import { loadScript } from './util.js';

const CDN = 'https://cdn.jsdelivr.net/npm/';
export const LIBS = {
  chart: { src: CDN + 'chart.js@4.4.1/dist/chart.umd.js', integrity: 'sha384-dug+JxfBvklEQdJ4AYuBBAIScUz0bVN73xpy273gcAwHjb3qI0fXmuYNaNfdyYJG' },
  fuse: { src: CDN + 'fuse.js@7.0.0/dist/fuse.min.js', integrity: 'sha384-PCSoOZTpbkikBEtd/+uV3WNdc676i9KUf01KOA8CnJotvlx8rRrETbDuwdjqTYvt' },
  d3array: { src: CDN + 'd3-array@3.2.4/dist/d3-array.min.js', integrity: 'sha384-VpKMdU+TlpggHFip46tJ/xkFUs8NFBwLqUMo3+3uiu411lU6eUQYsHVU+JFpA5ja' },
  d3geo: { src: CDN + 'd3-geo@3.1.1/dist/d3-geo.min.js', integrity: 'sha384-VNiKRUXp0MmglFfqDwkfuk+Y78C3WTJShdKSaFwOacLR3UmamxHIJLBTD3BadIXD' },
  topojson: { src: CDN + 'topojson-client@3.1.0/dist/topojson-client.min.js', integrity: 'sha384-Ukv1p/xTma6P4/2bY5KzWBw+ydSpXmhCMtyciIQVDJ1RmOxtCYNMF1uXT9T63H67' },
  world: CDN + 'world-atlas@2.0.2/countries-110m.json',
};

const load = key => loadScript(LIBS[key].src, LIBS[key].integrity);

export async function getChart() {
  await load('chart');
  return window.Chart;
}

export async function getFuse() {
  await load('fuse');
  return window.Fuse;
}

let geoPromise;
/** d3-geo + topojson + the world topology (shared by the world map and locator maps). */
export function getGeo() {
  if (!geoPromise) {
    geoPromise = (async () => {
      const [, , world] = await Promise.all([
        load('d3array').then(() => load('d3geo')),
        load('topojson'),
        fetch(LIBS.world).then(r => { if (!r.ok) throw new Error('world map ' + r.status); return r.json(); }),
      ]);
      const features = window.topojson.feature(world, world.objects.countries).features;
      const byId = new Map(features.filter(f => f.id).map(f => [f.id, f]));
      return { d3: window.d3, topojson: window.topojson, world, features, byId };
    })();
    geoPromise.catch(() => { geoPromise = null; });
  }
  return geoPromise;
}
