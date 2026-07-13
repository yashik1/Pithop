// Client for the optional Google-backed serverless proxy (see /api). When the
// app runs without the proxy (local dev, or no key configured on Vercel),
// every call here fails fast and the app stays on the free data stack.

import type { LatLng } from '../lib/geo';
import type { Stop } from '../types';
import { visitMinutes, type CategoryId } from '../lib/categories';

let backendAvailable: boolean | null = null;

export async function hasGoogleBackend(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const res = await fetch('/api/health');
    backendAvailable = res.ok && (await res.json()).google === true;
  } catch {
    backendAvailable = false;
  }
  return backendAvailable;
}

const TYPE_TO_CATEGORY: Array<{ types: string[]; category: CategoryId; kind: string }> = [
  { types: ['observation_deck'], category: 'views', kind: 'viewpoint' },
  { types: ['gas_station'], category: 'rest', kind: 'fuel' },
  { types: ['rest_stop'], category: 'rest', kind: 'rest_area' },
  { types: ['truck_stop'], category: 'rest', kind: 'truck_stop' },
  { types: ['electric_vehicle_charging_station'], category: 'rest', kind: 'charging_station' },
  { types: ['public_bathroom'], category: 'rest', kind: 'toilets' },
  {
    types: ['restaurant', 'cafe', 'coffee_shop', 'bakery', 'ice_cream_shop', 'fast_food_restaurant', 'bar'],
    category: 'food',
    kind: 'restaurant',
  },
  {
    types: ['museum', 'art_gallery', 'cultural_center', 'performing_arts_theater'],
    category: 'museums',
    kind: 'museum',
  },
  {
    types: ['park', 'national_park', 'state_park', 'botanical_garden', 'garden', 'hiking_area', 'beach'],
    category: 'nature',
    kind: 'park',
  },
  {
    types: ['historical_landmark', 'historical_place', 'monument', 'church', 'place_of_worship'],
    category: 'history',
    kind: 'historic_site',
  },
];

function categorizeGoogle(primaryType: string | undefined): { category: CategoryId; kind: string } {
  if (primaryType) {
    for (const rule of TYPE_TO_CATEGORY) {
      if (rule.types.includes(primaryType)) return { category: rule.category, kind: rule.kind };
    }
    // Keyword fallbacks for the long tail of Google place types
    // (e.g. american_restaurant, city_park, scenic_spot, convenience_store).
    if (/gas|fuel|charging|rest_stop|truck|convenience/.test(primaryType)) {
      return { category: 'rest', kind: 'fuel' };
    }
    if (/restaurant|food|diner|dessert|ice_cream|sandwich|pizza|steak|barbecue|buffet/.test(primaryType)) {
      return { category: 'food', kind: 'restaurant' };
    }
    if (/scenic|viewpoint|observation/.test(primaryType)) return { category: 'views', kind: 'viewpoint' };
    if (/(^|_)parks?($|_)|garden|natural|beach|campground|wildlife/.test(primaryType)) {
      return { category: 'nature', kind: 'park' };
    }
    if (/museum|gallery|theater|theatre|cultural/.test(primaryType)) {
      return { category: 'museums', kind: 'museum' };
    }
    if (/historical|monument|landmark|church|temple|mosque|shrine|bridge|castle/.test(primaryType)) {
      return { category: 'history', kind: 'historic_site' };
    }
  }
  return { category: 'fun', kind: 'attraction' };
}

export async function fetchGooglePlaces(routeCoords: LatLng[]): Promise<Stop[]> {
  const res = await fetch('/api/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polyline: routeCoords.map((p) => [p.lat, p.lng]) }),
  });
  if (!res.ok) throw new Error(`Places proxy failed (HTTP ${res.status})`);
  const data = await res.json();
  const stops: Stop[] = [];
  for (const place of data.places ?? []) {
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    const name = place.displayName?.text;
    if (lat == null || lng == null || !name) continue;
    const cat = categorizeGoogle(place.primaryType);
    stops.push({
      id: `google/${place.id}`,
      name,
      lat,
      lng,
      category: cat.category,
      kind: cat.kind,
      visitMin: visitMinutes(cat.kind),
      source: 'google',
      description: place.editorialSummary?.text,
      rating: place.rating,
      ratingCount: place.userRatingCount,
      gmapsUri: place.googleMapsUri,
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    });
  }
  return stops;
}

export interface GoogleRouteResult {
  durationMin: number;
  distanceKm: number;
  order: number[] | null;
}

export async function fetchGoogleRoute(
  origin: LatLng,
  destination: LatLng,
  intermediates: LatLng[],
): Promise<GoogleRouteResult> {
  const res = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, intermediates }),
  });
  if (!res.ok) throw new Error(`Route proxy failed (HTTP ${res.status})`);
  return (await res.json()) as GoogleRouteResult;
}
