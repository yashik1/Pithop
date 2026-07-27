import type { LatLng } from '../lib/geo';
import type { Vehicle } from '../lib/vehicle';

// One turn-by-turn instruction, anchored to where the maneuver happens so the
// live drive HUD can find the next one ahead of the driver.
export interface RouteStep {
  text: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
  steps?: RouteStep[];
  // True when the provider's data flags toll roads on this route; undefined
  // when the provider reports nothing either way (absence is not "toll-free").
  tolls?: boolean;
  // True when this route was explicitly computed to avoid toll roads.
  noTolls?: boolean;
  // Set when avoid options were requested but the provider rejected them and
  // the standard route is shown instead.
  avoidFailed?: boolean;
}

export interface RouteOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

// OSRM returns structured maneuvers (type/modifier/road name), not sentences —
// render them as short English instructions. Returns null for maneuvers that
// don't need a callout (e.g. the initial "depart").
function osrmStepText(step: any): string | null {
  const m = step.maneuver ?? {};
  const name = String(step.name || step.ref || '').trim();
  const onto = name ? ` onto ${name}` : '';
  const dir = String(m.modifier ?? '');
  switch (m.type) {
    case 'depart':
      return null;
    case 'arrive':
      return 'You have arrived at your destination';
    case 'roundabout':
    case 'rotary':
      return `At the roundabout, take exit ${m.exit ?? 1}${onto}`;
    case 'merge':
      return `Merge ${dir || 'ahead'}${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'fork':
      return dir ? `Keep ${dir}${onto}` : null;
    case 'end of road':
      return `At the end of the road, turn ${dir || 'ahead'}${onto}`;
    case 'continue':
    case 'new name':
      if (dir && dir !== 'straight') return `Continue ${dir}${onto}`;
      return name ? `Continue on ${name}` : null;
    default:
      if (dir === 'uturn') return 'Make a U-turn';
      if (!dir || dir === 'straight') return name ? `Continue on ${name}` : null;
      return `Turn ${dir}${onto}`;
  }
}

function parseOsrmRoute(route: any): RouteResult {
  const steps: RouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      const text = osrmStepText(s);
      const loc = s.maneuver?.location;
      if (text && Array.isArray(loc)) steps.push({ text, lat: loc[1], lng: loc[0] });
    }
  }
  return {
    coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    steps,
  };
}

// Fetch up to 3 route options, best first. Geoapify (keyed) supports avoid
// options and route variants; the free OSRM demo serves native alternatives
// for cars but cannot avoid tolls/highways (fixed profile).
//
// `points` is the ordered waypoint list — [origin, …vias, destination] — so a
// trip with intermediate stops is one route through them all, not several
// separate routes. Alternatives are only requested for a plain A→B trip:
// with vias the corridor is already pinned down by the user's own stops, and
// OSRM returns a single route for multi-waypoint requests anyway.
export async function fetchRoutes(
  points: LatLng[],
  vehicle: Vehicle = 'car',
  opts: RouteOptions = {},
): Promise<RouteResult[]> {
  if (points.length < 2) throw new Error('A route needs a start and an end');
  const { hasGeoapify, geoapifyRoutes } = await import('./geoapify');
  if (hasGeoapify()) return geoapifyRoutes(points, vehicle, opts);
  const path = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url =
    `https://router.project-osrm.org/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&steps=true&alternatives=${points.length === 2}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(
      points.length > 2
        ? 'No drivable route found through all of your stops — try moving or removing one'
        : 'No drivable route found between those places',
    );
  }
  return (data.routes as any[]).slice(0, 3).map(parseOsrmRoute);
}
