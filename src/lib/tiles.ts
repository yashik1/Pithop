// Map tile providers with automatic failover. A single tile source can be
// rate-limited, down, or blocked on some networks/regions; when the active one
// is broadly failing we fall through to the next keyless provider so the map
// keeps rendering everywhere. Geoapify (if a key is set) stays the primary.

import L from 'leaflet';
import { geoapifyTileLayer, hasGeoapify } from '../api/geoapify';

export interface TileProvider {
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTR = OSM_ATTR + ', &copy; <a href="https://carto.com/attributions">CARTO</a>';

const OSM_STD: TileProvider = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTR,
  maxZoom: 19,
};
// Robust CDN, no API key, commercial use OK with attribution.
const CARTO_VOYAGER: TileProvider = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution: CARTO_ATTR,
  subdomains: 'abcd',
  maxZoom: 20,
};
// German OSM community mirror — same look as OSM standard, separate infra.
const OSM_DE: TileProvider = {
  url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
  attribution: OSM_ATTR,
  maxZoom: 18,
};

// Ordered by preference; each later one is only used if the previous is down.
// Carto Voyager is the base map for its soft, clean look — no key needed and it
// spares Geoapify tile credits — with Geoapify (when keyed) and OSM as backups.
export function tileProviders(): TileProvider[] {
  if (hasGeoapify()) {
    const g = geoapifyTileLayer();
    return [CARTO_VOYAGER, { url: g.url, attribution: g.attribution, maxZoom: 20 }, OSM_STD];
  }
  return [CARTO_VOYAGER, OSM_STD, OSM_DE];
}

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
  layer.on('tileload', () => {
    ok += 1;
  });
  layer.on('tileerror', () => {
    if (switched) return;
    errors += 1;
    // A few errors with not a single tile loaded == the provider is blocked or
    // down (a working provider always lands some tiles before this many fail).
    // Incidental edge-tile 404s can't trip this because they come with loads.
    if (errors >= 3 && ok === 0 && i + 1 < providers.length) {
      switched = true;
      map.removeLayer(layer);
      addTilesWithFailover(map, providers, i + 1);
    }
  });
  layer.addTo(map);
}
