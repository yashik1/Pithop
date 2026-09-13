// Attaching tile layers to a Leaflet map, with automatic failover. The list of
// providers itself lives in tileProviders.ts, which has no Leaflet dependency.

import L from 'leaflet';
import type { TileProvider } from './tileProviders';

export { tileProviders, type TileProvider } from './tileProviders';

// How long a provider gets to land its first tile before we give up on it.
// Covers the case where requests hang or are black-holed rather than refused,
// which produces no tileerror at all and would otherwise leave a blank map.
const FIRST_TILE_TIMEOUT_MS = 6000;

// Add the provider at `i`, watching its tiles. If it's broadly failing (several
// tile errors with almost nothing loading — i.e. blocked/down, not the odd
// edge-tile 404), swap it for the next provider. Incidental 404s never trigger
// a switch because those come alongside many successful loads.
export function addTilesWithFailover(map: L.Map, providers: TileProvider[], i = 0): void {
  if (i >= providers.length) return;
  const p = providers[i];
  const layer = L.tileLayer(p.url, {
    attribution: p.attribution,
    subdomains: p.subdomains ?? 'abc',
    maxZoom: p.maxZoom ?? 19,
    // keepBuffer: hold a wider ring of tiles so pans/zoom-outs reuse them;
    // updateWhenIdle:false starts fetching while the map is still moving —
    // both shrink the "blurry tiles" window after a zoom.
    keepBuffer: 4,
    updateWhenIdle: false,
  });
  let errors = 0;
  let ok = 0;
  let switched = false;

  const moveOn = () => {
    if (switched || i + 1 >= providers.length) return;
    switched = true;
    window.clearTimeout(timer);
    map.removeLayer(layer);
    addTilesWithFailover(map, providers, i + 1);
  };

  // Nothing at all after the grace period: treat silence as failure too.
  const timer = window.setTimeout(() => {
    if (ok === 0) moveOn();
  }, FIRST_TILE_TIMEOUT_MS);

  layer.on('tileload', () => {
    ok += 1;
    // The provider works; stop watching the clock.
    if (ok === 1) window.clearTimeout(timer);
  });
  layer.on('tileerror', () => {
    if (switched) return;
    errors += 1;
    // A few errors with not a single tile loaded == the provider is blocked or
    // down (a working provider always lands some tiles before this many fail).
    // Incidental edge-tile 404s can't trip this because they come with loads.
    if (errors >= 3 && ok === 0) moveOn();
  });
  layer.addTo(map);
}
