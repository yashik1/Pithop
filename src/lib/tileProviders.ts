// The map's tile sources, in failover order. Deliberately free of any Leaflet
// import: this is a list of URLs and attributions, and keeping it that way means
// it can be read and tested without a DOM.

import { geoapifyTileLayer, hasGeoapify } from '../api/geoapify';

export interface TileProvider {
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom?: number;
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// OpenStreetMap's own servers. Keyless and reliable, but their tile usage policy
// discourages heavy commercial use, so they are the fallback rather than the
// default whenever a paid provider is configured.
const OSM_STD: TileProvider = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: OSM_ATTR,
  maxZoom: 19,
};

// German OSM community mirror — same look, separate infrastructure, so it
// survives an outage or a regional block affecting the main servers.
const OSM_DE: TileProvider = {
  url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
  attribution: OSM_ATTR,
  maxZoom: 18,
};

// ---------------------------------------------------------------------------
// Carto Voyager was the default here and has been REMOVED. Do not add it back
// without a Carto account and key.
//
// Carto's keyless raster basemaps now require one, and rather than refusing the
// request they serve a tile with "API KEY REQUIRED carto.com/basemaps/apikey"
// printed across it. That arrives as HTTP 200 holding a valid image, so Leaflet
// reports a successful tile load and the failover in tiles.ts cannot see
// anything wrong — the map simply renders the watermark over the whole route.
//
// This is the trap worth remembering when choosing any tile provider: a source
// that degrades into a *picture of an error* is far worse than one that returns
// a status code, because no amount of client-side failover logic can detect it.
// ---------------------------------------------------------------------------

// Ordered by preference; each later one is used only if the previous is down.
// Geoapify leads when a key is configured: it is the paid, licensed provider
// whose terms actually permit commercial use, and a bad key there fails with a
// status code rather than a watermark. Without a key the map runs on the
// keyless OSM servers, which is fine at small scale.
export function tileProviders(): TileProvider[] {
  const osm = [OSM_STD, OSM_DE];
  if (!hasGeoapify()) return osm;
  const g = geoapifyTileLayer();
  return [{ url: g.url, attribution: g.attribution, maxZoom: 20 }, ...osm];
}
