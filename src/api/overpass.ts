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
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    });
  }
  return stops;
}
