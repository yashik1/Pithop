// The map's tile sources. Deliberately free of any Leaflet import: this is a
// list of URLs and attributions, and keeping it that way means it can be read
// and tested without a DOM.

// Map tile providers with automatic failover. A single tile source can be
// rate-limited, down, or blocked on some networks/regions; when the active one
// is broadly failing we fall through to the next keyless provider so the map
// keeps rendering everywhere. Geoapify (if a key is set) stays the primary.


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
// Carto Voyager is the base map for its soft, clean look, with the two OSM
// mirrors behind it on separate infrastructure.
//
// Every provider here is KEYLESS, deliberately. Geoapify tiles used to sit in
// this chain when a key was configured, and that was the one way the map could
// break visibly: a key that is missing, mistyped, out of quota or restricted to
// the wrong domain makes Geoapify serve a picture that says an API key is
// needed. An image is not an error — Leaflet reports it as a successful tile
// load — so the failover below could never rescue it, and the traveller just
// saw "API key" written across the map. Keyless tiles also cost nothing and
// spare the Geoapify credits for routing and places, which is where a key
// actually earns its keep and where failures surface as catchable exceptions.
export function tileProviders(): TileProvider[] {
  return [CARTO_VOYAGER, OSM_STD, OSM_DE];
}

