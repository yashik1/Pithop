import type { LatLng } from '../lib/geo';
import type { Stop } from '../types';
import { visitMinutes, type CategoryId } from '../lib/categories';

// Only the categories Wikipedia is weak at: everyday food, unnamed scenic
// viewpoints, and highway rest areas. Small point-radius (disc) lookups are the
// only query shape the public Overpass servers handle reliably.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const FOOD_KINDS = ['restaurant', 'cafe', 'fast_food', 'ice_cream'];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildQuery(samples: LatLng[]): string {
  let body = '';
  for (const p of samples) {
    const pt = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    body += `node["tourism"="viewpoint"](around:8000,${pt});`;
    body += `node["amenity"~"^(restaurant|cafe|fast_food|ice_cream)$"]["name"](around:3000,${pt});`;
    body += `node["highway"~"^(rest_area|services)$"](around:8000,${pt});`;
    body += `way["highway"~"^(rest_area|services)$"](around:8000,${pt});`;
    body += `node["amenity"~"^(fuel|toilets)$"](around:3000,${pt});`;
    body += `way["amenity"="fuel"](around:3000,${pt});`;
  }
  return `[out:json][timeout:30];(${body});out center qt 1200;`;
}

async function runQuery(endpoint: string, query: string): Promise<OverpassElement[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let data: { elements?: OverpassElement[]; remark?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Overpass returned a non-JSON error page');
    }
    // Server-side timeouts come back as HTTP 200 + a "remark" and no elements.
    if (data.remark && /error|timed out/i.test(data.remark) && !(data.elements ?? []).length) {
      throw new Error(data.remark);
    }
    return data.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// Turn raw OSM tags into a short human-readable "what's here" line, e.g.
// "Mexican, barbecue · Outdoor seating · Open Mo-Su 07:00-22:00" for a
// restaurant or "Restrooms · Picnic tables" for a rest area.
// Also used by the Geoapify provider — its results carry the same OSM tags.
export function describeOsm(tags: Record<string, string>, kind: string): string | undefined {
  const parts: string[] = [];
  if (tags.description) parts.push(tags.description.slice(0, 140));
  if (FOOD_KINDS.includes(kind) && tags.cuisine) {
    const cuisines = tags.cuisine
      .split(';')
      .slice(0, 3)
      .map((c) => c.trim().replace(/_/g, ' '))
      .filter(Boolean)
      .map((c) => c.charAt(0).toUpperCase() + c.slice(1));
    if (cuisines.length) parts.push(cuisines.join(', '));
  }
  const features: string[] = [];
  if (kind !== 'toilets' && tags.toilets === 'yes') features.push('Restrooms');
  if (tags.picnic_table === 'yes' || tags.leisure === 'picnic_table') features.push('Picnic tables');
  if (tags.drinking_water === 'yes') features.push('Drinking water');
  if (tags.shower === 'yes') features.push('Showers');
  if (tags.shop === 'convenience') features.push('Convenience store');
  if (tags.outdoor_seating === 'yes') features.push('Outdoor seating');
  if (tags.drive_through === 'yes') features.push('Drive-through');
  if (features.length) parts.push(features.join(' · '));
  if (tags.opening_hours) {
    parts.push(tags.opening_hours === '24/7' ? 'Open 24/7' : `Open ${tags.opening_hours.slice(0, 40)}`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

function categorizeOsm(tags: Record<string, string>): { category: CategoryId; kind: string; name: string } | null {
  if (tags.tourism === 'viewpoint') {
    return { category: 'views', kind: 'viewpoint', name: tags.name ?? 'Scenic viewpoint' };
  }
  if (tags.amenity && FOOD_KINDS.includes(tags.amenity) && tags.name) {
    return { category: 'food', kind: tags.amenity, name: tags.name };
  }
  if (tags.highway === 'rest_area' || tags.highway === 'services') {
    return {
      category: 'rest',
      kind: tags.highway,
      name: tags.name ?? (tags.highway === 'services' ? 'Service area' : 'Rest area'),
    };
  }
  if (tags.amenity === 'fuel') {
    return { category: 'rest', kind: 'fuel', name: tags.name ?? tags.brand ?? 'Fuel station' };
  }
  if (tags.amenity === 'toilets') {
    return { category: 'rest', kind: 'toilets', name: tags.name ?? 'Public restrooms' };
  }
  return null;
}

export async function fetchRoadsideStops(samples: LatLng[]): Promise<Stop[]> {
  const query = buildQuery(samples);
  let lastErr: Error = new Error('Overpass unavailable');
  let elements: OverpassElement[] | null = null;
  for (const endpoint of ENDPOINTS) {
    try {
      elements = await runQuery(endpoint, query);
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (elements === null) throw lastErr;

  const seen = new Set<string>();
  const stops: Stop[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const cat = categorizeOsm(tags);
    if (!cat) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    // The same place is often mapped as both a node and a way — dedupe by name + ~100 m cell.
    const key = `${cat.name}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stops.push({
      id: `osm/${el.type}/${el.id}`,
      name: cat.name,
      lat,
      lng,
      category: cat.category,
      kind: cat.kind,
      visitMin: visitMinutes(cat.kind),
      source: 'osm',
      description: describeOsm(tags, cat.kind),
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    });
  }
  return stops;
}
