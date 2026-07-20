// Optional commercial-grade provider (geoapify.com). When VITE_GEOAPIFY_API_KEY
// is set, Geoapify replaces every free public OSM server — tiles, autocomplete,
// geocoding, routing and roadside POIs — whose usage policies disallow or
// discourage commercial apps. Without a key the app stays on the free stack.
// Geoapify uses open data and allows commercial use with attribution; restrict
// the key to your domain in their dashboard since it ships to the browser.

import type { LatLng } from '../lib/geo';
import type { Stop } from '../types';
import { visitMinutes, type CategoryId } from '../lib/categories';
import { describeOsm, parkingFromTags, websiteFromTags } from './overpass';
import { VEHICLE_MAP, type Vehicle } from '../lib/vehicle';
import type { GeocodeResult } from './geocode';
import type { RouteOptions, RouteResult } from './route';
import type { PlacePick } from '../components/PlaceInput';

const KEY = (import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined) ?? '';
const BASE = 'https://api.geoapify.com';

export function hasGeoapify(): boolean {
  return KEY.length > 0;
}

export function geoapifyTileLayer(): { url: string; attribution: string } {
  // {r} → '@2x' on high-DPI screens (Leaflet fills it in): crisp retina tiles.
  return {
    url: `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}{r}.png?apiKey=${KEY}`,
    attribution:
      'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | ' +
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  };
}

interface GeoFeature {
  geometry: { type: string; coordinates: any };
  properties: Record<string, any>;
}

async function getJson(url: string, signal?: AbortSignal): Promise<{ features?: GeoFeature[] }> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geoapify request failed (HTTP ${res.status})`);
  return res.json();
}

export async function geoapifySuggest(text: string, signal?: AbortSignal): Promise<PlacePick[]> {
  const data = await getJson(
    `${BASE}/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&limit=6&apiKey=${KEY}`,
    signal,
  );
  const picks: PlacePick[] = [];
  for (const f of data.features ?? []) {
    const label = f.properties.formatted;
    const [lng, lat] = f.geometry?.coordinates ?? [f.properties.lon, f.properties.lat];
    if (!label || lat == null || lng == null) continue;
    picks.push({ label, lat, lng });
  }
  return picks;
}

export async function geoapifyGeocode(query: string): Promise<GeocodeResult> {
  const data = await getJson(`${BASE}/v1/geocode/search?text=${encodeURIComponent(query)}&limit=1&apiKey=${KEY}`);
  const f = data.features?.[0];
  if (!f) throw new Error(`Couldn't find "${query}" — try a more specific place name`);
  const [lng, lat] = f.geometry?.coordinates ?? [f.properties.lon, f.properties.lat];
  return { lat, lng, displayName: f.properties.formatted ?? query };
}

function parseGeoapifyRoute(f: GeoFeature): RouteResult {
  // Routing returns a MultiLineString with one line per leg — flatten them.
  const lines: Array<Array<[number, number]>> =
    f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  const coords: LatLng[] = [];
  for (const line of lines) for (const [lng, lat] of line) coords.push({ lat, lng });
  if (coords.length < 2) throw new Error('No drivable route found between those places');
  // Turn-by-turn instructions for the live drive HUD. Each step's from_index
  // points into its own leg's line, giving the maneuver's coordinate. Steps
  // also carry a toll flag where the road data knows one.
  const steps: RouteResult['steps'] = [];
  let tollSeen = Boolean(f.properties.toll);
  const legs: any[] = f.properties.legs ?? [];
  legs.forEach((leg, i) => {
    if (leg.toll) tollSeen = true;
    for (const s of leg.steps ?? []) {
      if (s.toll) tollSeen = true;
      const text = s.instruction?.text;
      const pt = lines[i]?.[s.from_index];
      if (typeof text === 'string' && text && Array.isArray(pt)) {
        steps.push({ text, lat: pt[1], lng: pt[0] });
      }
    }
  });
  return {
    coords,
    distanceKm: (f.properties.distance ?? 0) / 1000,
    durationMin: (f.properties.time ?? 0) / 60,
    steps,
    tolls: tollSeen ? true : undefined,
  };
}

// Up to two route options: the balanced route plus the "short" variant when it
// differs meaningfully. Avoid options map to Geoapify's `avoid` parameter; if
// the provider rejects them, we retry without and flag it so the UI can say so.
export async function geoapifyRoutes(
  from: LatLng,
  to: LatLng,
  vehicle: Vehicle = 'car',
  opts: RouteOptions = {},
): Promise<RouteResult[]> {
  const mode = VEHICLE_MAP[vehicle]?.geoapify ?? 'drive';
  const avoid = [opts.avoidTolls && 'tolls', opts.avoidHighways && 'highways'].filter(Boolean).join('|');
  const base = (extra: string, withAvoid: boolean) =>
    `${BASE}/v1/routing?waypoints=${from.lat},${from.lng}%7C${to.lat},${to.lng}&mode=${mode}` +
    `&details=instruction_details${withAvoid && avoid ? `&avoid=${avoid}` : ''}${extra}&apiKey=${KEY}`;

  let avoidFailed = false;
  let [main, short] = await Promise.allSettled([
    getJson(base('', true)),
    getJson(base('&route_type=short', true)),
  ]);
  if (main.status === 'rejected' && avoid) {
    // Avoid options rejected (or unroutable with them) — fall back to standard.
    avoidFailed = true;
    [main, short] = await Promise.allSettled([getJson(base('', false)), getJson(base('&route_type=short', false))]);
  }
  if (main.status === 'rejected') {
    throw main.reason instanceof Error ? main.reason : new Error('No route found between those places');
  }
  const f = main.value.features?.[0];
  if (!f) throw new Error('No route found between those places for this vehicle');
  const routes: RouteResult[] = [parseGeoapifyRoute(f)];
  if (avoidFailed) routes[0].avoidFailed = true;
  if (short.status === 'fulfilled') {
    const sf = short.value.features?.[0];
    if (sf) {
      try {
        const alt = parseGeoapifyRoute(sf);
        const dup =
          Math.abs(alt.distanceKm - routes[0].distanceKm) < 1 && Math.abs(alt.durationMin - routes[0].durationMin) < 2;
        if (!dup) routes.push(alt);
      } catch {
        // unparsable variant — main route is enough
      }
    }
  }
  return routes;
}

// Roadside POIs (replaces Overpass). These are Geoapify's documented category
// slugs — invalid ones make the whole request 400, so the list is limited to
// high-confidence categories. The request is tried category-by-category
// (Promise.allSettled), so if one slug is ever rejected the others still
// return, and coverage degrades gracefully instead of failing wholesale.
// Kept to slugs we're confident are valid — one invalid slug 400s the whole
// request. If even this is rejected, the fetch falls back to bare 'catering'.
const ROADSIDE_CATEGORIES = 'catering.restaurant,catering.cafe,catering.fast_food,catering.ice_cream,service.vehicle.fuel,tourism.attraction';
const ROADSIDE_FALLBACK = 'catering';

function categorizeGeoapify(cats: string[]): { category: CategoryId; kind: string } | null {
  const has = (c: string) => cats.some((x) => x === c || x.startsWith(c + '.'));
  if (has('service.vehicle.fuel')) return { category: 'rest', kind: 'fuel' };
  if (has('service.vehicle.charging_station')) return { category: 'rest', kind: 'charging_station' };
  if (cats.some((x) => x.includes('viewpoint'))) return { category: 'views', kind: 'viewpoint' };
  if (has('catering.fast_food')) return { category: 'food', kind: 'fast_food' };
  if (has('catering.ice_cream')) return { category: 'food', kind: 'ice_cream' };
  if (has('catering.cafe')) return { category: 'food', kind: 'cafe' };
  if (has('catering')) return { category: 'food', kind: 'restaurant' };
  if (has('tourism')) return { category: 'fun', kind: 'attraction' };
  return null;
}

export async function fetchGeoapifyRoadside(samples: LatLng[]): Promise<Stop[]> {
  // Every 2nd sample with a wider radius halves the credit cost per search.
  const circles = samples.filter((_, i) => i % 2 === 0);
  const radiusM = 13000;

  const fetchCircle = (p: LatLng, categories: string) =>
    getJson(
      `${BASE}/v2/places?categories=${categories}` +
        `&filter=circle:${p.lng.toFixed(4)},${p.lat.toFixed(4)},${radiusM}&limit=100&apiKey=${KEY}`,
    );

  // Probe the first circle; if the category list is rejected (e.g. a slug is
  // no longer valid), fall back to bare 'catering' before fanning out so at
  // least food still appears.
  let categories = ROADSIDE_CATEGORIES;
  try {
    await fetchCircle(circles[0], categories);
  } catch {
    categories = ROADSIDE_FALLBACK;
  }

  const results = await Promise.allSettled(circles.map((p) => fetchCircle(p, categories)));
  const byId = new Map<string, Stop>();
  let anyOk = false;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    anyOk = true;
    for (const f of r.value.features ?? []) {
      const props = f.properties;
      const id = `gfy/${props.place_id ?? `${props.lat},${props.lon}`}`;
      if (byId.has(id)) continue;
      const cat = categorizeGeoapify(props.categories ?? []);
      if (!cat) continue;
      const lat = props.lat ?? f.geometry?.coordinates?.[1];
      const lng = props.lon ?? f.geometry?.coordinates?.[0];
      if (lat == null || lng == null) continue;
      // Unnamed food places aren't useful stops; rest stops get default names.
      // Coerce to string — rare POIs carry numeric names, which must not crash
      // downstream string handling.
      let name: string | undefined = props.name != null ? String(props.name) : undefined;
      if (!name) {
        if (cat.kind === 'rest_area') name = 'Rest area';
        else if (cat.kind === 'fuel') name = props.brand != null ? String(props.brand) : 'Fuel station';
        else if (cat.kind === 'viewpoint') name = 'Scenic viewpoint';
      }
      if (!name) continue;
      // datasource.raw carries the original OSM tags (cuisine, opening_hours…).
      const raw: Record<string, string> = props.datasource?.raw ?? {};
      byId.set(id, {
        id,
        name,
        lat,
        lng,
        category: cat.category,
        kind: cat.kind,
        visitMin: visitMinutes(cat.kind),
        source: 'geoapify',
        description: describeOsm(raw, cat.kind),
        // Geoapify surfaces a top-level website; fall back to the raw OSM tags.
        website:
          (props.website ? websiteFromTags({ website: String(props.website) }) : undefined) ?? websiteFromTags(raw),
        hours:
          raw.opening_hours != null
            ? String(raw.opening_hours)
            : props.opening_hours != null
              ? String(props.opening_hours)
              : undefined,
        parking: parkingFromTags(raw),
        offRouteKm: 0,
        alongKm: 0,
        detourMin: 0,
      });
    }
  }
  if (!anyOk) throw new Error('Geoapify places lookup failed');
  return [...byId.values()];
}
