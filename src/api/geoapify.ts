// Optional commercial-grade provider (geoapify.com). When VITE_GEOAPIFY_API_KEY
// is set, Geoapify replaces the free public OSM servers — tiles, autocomplete,
// geocoding, routing, roadside POIs and lodging — whose usage policies disallow
// or discourage commercial apps. Without a key the app stays on the free stack.
//
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

// Trimmed on purpose: a key pasted into a dashboard often arrives with a
// trailing newline or space, which would otherwise pass the length check below
// and then fail every request with a confusing 401.
const KEY = ((import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined) ?? '').replace(/\s+/g, '');
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

// Up to three route options: the balanced route, the "short" variant, and —
// whenever tolls aren't already being avoided globally — a dedicated TOLL-FREE
// variant, so the no-tolls choice is always visible without flipping toggles.
// Duplicates (a variant identical to an earlier route) are dropped. If the
// provider rejects the user's avoid options, we retry without and flag it.
export async function geoapifyRoutes(
  points: LatLng[],
  vehicle: Vehicle = 'car',
  opts: RouteOptions = {},
): Promise<RouteResult[]> {
  const mode = VEHICLE_MAP[vehicle]?.geoapify ?? 'drive';
  const userAvoid = [opts.avoidTolls && 'tolls', opts.avoidHighways && 'highways'].filter(Boolean).join('|');
  // Geoapify takes the whole ordered waypoint list in one request, so a trip
  // with intermediate stops comes back as one route with one leg per hop.
  const waypoints = points.map((p) => `${p.lat},${p.lng}`).join('%7C');
  const url = (extra: string, avoidStr: string) =>
    `${BASE}/v1/routing?waypoints=${waypoints}&mode=${mode}` +
    `&details=instruction_details${avoidStr ? `&avoid=${avoidStr}` : ''}${extra}&apiKey=${KEY}`;
  const noTollsAvoid = userAvoid ? (userAvoid.includes('tolls') ? userAvoid : `${userAvoid}|tolls`) : 'tolls';

  const fetchSet = (avoidStr: string) =>
    Promise.allSettled([
      getJson(url('', avoidStr)),
      getJson(url('&route_type=short', avoidStr)),
      // The toll-free option: skipped only when tolls are avoided anyway.
      ...(opts.avoidTolls ? [] : [getJson(url('', noTollsAvoid))]),
    ]);

  let avoidFailed = false;
  let [main, short, noTolls] = await fetchSet(userAvoid);
  if (main.status === 'rejected' && userAvoid) {
    // Avoid options rejected (or unroutable with them) — fall back to standard.
    avoidFailed = true;
    [main, short, noTolls] = await fetchSet('');
  }
  if (main.status === 'rejected') {
    if (main.reason instanceof Error) throw main.reason;
    throw new Error(
      points.length > 2
        ? 'No route found through all of your stops — try moving or removing one'
        : 'No route found between those places',
    );
  }
  const f = main.value.features?.[0];
  if (!f) {
    throw new Error(
      points.length > 2
        ? 'No route found through all of your stops for this vehicle'
        : 'No route found between those places for this vehicle',
    );
  }
  const routes: RouteResult[] = [parseGeoapifyRoute(f)];
  if (avoidFailed) routes[0].avoidFailed = true;

  const isDup = (alt: RouteResult) =>
    routes.some((r) => Math.abs(alt.distanceKm - r.distanceKm) < 1 && Math.abs(alt.durationMin - r.durationMin) < 2);
  if (short?.status === 'fulfilled') {
    const sf = short.value.features?.[0];
    if (sf) {
      try {
        const alt = parseGeoapifyRoute(sf);
        if (!isDup(alt)) routes.push(alt);
      } catch {
        // unparsable variant — main route is enough
      }
    }
  }
  if (noTolls?.status === 'fulfilled') {
    const nf = noTolls.value.features?.[0];
    if (nf) {
      try {
        const alt = parseGeoapifyRoute(nf);
        alt.noTolls = true;
        alt.tolls = undefined; // computed with avoid=tolls — don't also flag tolls
        if (!isDup(alt)) routes.push(alt);
      } catch {
        // unparsable variant
      }
    }
  }
  return routes;
}

// Somewhere to sleep at the end of a driving day. Queried separately from the
// roadside search because it is only wanted at a handful of points (one per
// overnight) rather than along the whole corridor, and because lodging is the
// one category where a made-up answer would actually strand somebody — so this
// returns real places or nothing at all.
export async function fetchGeoapifyLodging(near: LatLng, radiusM = 20000, limit = 8): Promise<Stop[]> {
  const data = await getJson(
    `${BASE}/v2/places?categories=accommodation.hotel,accommodation.motel,accommodation.guest_house` +
      `&filter=circle:${near.lng.toFixed(4)},${near.lat.toFixed(4)},${radiusM}` +
      `&bias=proximity:${near.lng.toFixed(4)},${near.lat.toFixed(4)}&limit=${limit}&apiKey=${KEY}`,
  );
  const out: Stop[] = [];
  for (const f of data.features ?? []) {
    const props = f.properties;
    const lat = props.lat ?? f.geometry?.coordinates?.[1];
    const lng = props.lon ?? f.geometry?.coordinates?.[0];
    const name = props.name != null ? String(props.name) : undefined;
    // An unnamed hotel is not something a traveller can go and find.
    if (!name || lat == null || lng == null) continue;
    const raw: Record<string, string> = props.datasource?.raw ?? {};
    out.push({
      id: `lodging/${props.place_id ?? `${lat},${lng}`}`,
      name,
      lat,
      lng,
      category: 'rest',
      kind: 'hotel',
      visitMin: 0,
      source: 'geoapify',
      website: (props.website ? websiteFromTags({ website: String(props.website) }) : undefined) ?? websiteFromTags(raw),
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    });
  }
  return out;
}

// Roadside POIs (replaces Overpass). These are Geoapify's documented category
// slugs — invalid ones make the whole request 400, so the list is limited to
// high-confidence categories. The request is tried category-by-category
// (Promise.allSettled), so if one slug is ever rejected the others still
// return, and coverage degrades gracefully instead of failing wholesale.
// One invalid slug 400s the whole request, so the category list is tried in
// tiers, widest first: the full set, then the long-proven core, then bare
// 'catering'. That lets the wider set (EV charging, sights, parks, nature)
// be attempted without risking total loss of coverage if a slug is retired.
const ROADSIDE_TIERS = [
  'catering.restaurant,catering.cafe,catering.fast_food,catering.ice_cream,' +
    'service.vehicle.fuel,service.vehicle.charging_station,' +
    'tourism.attraction,tourism.sights,leisure.park,natural',
  'catering.restaurant,catering.cafe,catering.fast_food,catering.ice_cream,service.vehicle.fuel,tourism.attraction',
  'catering',
];

function categorizeGeoapify(cats: string[]): { category: CategoryId; kind: string } | null {
  const has = (c: string) => cats.some((x) => x === c || x.startsWith(c + '.'));
  if (has('service.vehicle.fuel')) return { category: 'rest', kind: 'fuel' };
  if (has('service.vehicle.charging_station')) return { category: 'rest', kind: 'charging_station' };
  if (cats.some((x) => x.includes('viewpoint'))) return { category: 'views', kind: 'viewpoint' };
  if (has('catering.fast_food')) return { category: 'food', kind: 'fast_food' };
  if (has('catering.ice_cream')) return { category: 'food', kind: 'ice_cream' };
  if (has('catering.cafe')) return { category: 'food', kind: 'cafe' };
  if (has('catering')) return { category: 'food', kind: 'restaurant' };
  // Water and protected land read as nature; the rest of `natural` (peaks,
  // caves, dunes) is scenic, so it lands under viewpoints.
  if (has('natural.water') || has('natural.forest') || has('leisure.park.nature_reserve')) {
    return { category: 'nature', kind: 'nature_reserve' };
  }
  if (has('leisure.park')) return { category: 'nature', kind: 'park' };
  if (has('natural')) return { category: 'views', kind: 'viewpoint' };
  if (has('tourism.sights')) return { category: 'history', kind: 'historic_site' };
  if (has('tourism')) return { category: 'fun', kind: 'attraction' };
  return null;
}

export async function fetchGeoapifyRoadside(samples: LatLng[]): Promise<Stop[]> {
  // Every 2nd sample with a wider radius halves the credit cost per search.
  // The radius covers the whole search corridor, and the per-circle `limit` is
  // well above what one disc usually holds — both cost nothing extra, since
  // the request count (which is what Geoapify bills) is unchanged.
  const circles = samples.filter((_, i) => i % 2 === 0);
  const radiusM = 16000;

  const fetchCircle = (p: LatLng, categories: string) =>
    getJson(
      `${BASE}/v2/places?categories=${categories}` +
        `&filter=circle:${p.lng.toFixed(4)},${p.lat.toFixed(4)},${radiusM}&limit=200&apiKey=${KEY}`,
    );

  // Probe the first circle to settle on a category list before fanning out:
  // walk the tiers widest-first and keep the first one the API accepts, so a
  // retired slug costs variety rather than all coverage.
  let categories = ROADSIDE_TIERS[ROADSIDE_TIERS.length - 1];
  for (const tier of ROADSIDE_TIERS) {
    try {
      await fetchCircle(circles[0], tier);
      categories = tier;
      break;
    } catch {
      // try the next, narrower tier
    }
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
