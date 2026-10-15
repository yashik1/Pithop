// Offline corridor packs — cache a trip's route + stops so the app stays
// usable with no signal. Uses Cache Storage for tiles/images and localStorage
// for the structured trip data (the existing tripStore already persists the
// current trip; this module adds an explicit "download this corridor" flag
// and a simple tile URL list for the service worker).

import type { RouteResult } from '../api/route';
import type { Stop } from '../types';
import { sampleAlong, type LatLng } from './geo';

const PACK_META_KEY = 'pithop-offline-packs-v1';

export interface OfflinePackMeta {
  id: string;
  routeLabel: string;
  savedAt: number;
  stopCount: number;
  /** Approximate bounding box for tile pre-caching. */
  bounds: { south: number; west: number; north: number; east: number };
}

function loadMeta(): OfflinePackMeta[] {
  try {
    const raw = localStorage.getItem(PACK_META_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveMeta(list: OfflinePackMeta[]): void {
  try {
    localStorage.setItem(PACK_META_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    // Storage full — packs still work via the current-trip slot.
  }
}

/** Compute a simple bounding box expanded by ~corridor width. */
export function routeBounds(coords: LatLng[], padDeg = 0.08): OfflinePackMeta['bounds'] {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const c of coords) {
    if (c.lat < south) south = c.lat;
    if (c.lat > north) north = c.lat;
    if (c.lng < west) west = c.lng;
    if (c.lng > east) east = c.lng;
  }
  return {
    south: south - padDeg,
    west: west - padDeg,
    north: north + padDeg,
    east: east + padDeg,
  };
}

/**
 * Register a corridor as offline-ready. The actual trip payload is already
 * kept by tripStore.saveCurrentTrip; this only records metadata so the UI
 * can show "Available offline".
 */
export function markCorridorOffline(opts: {
  id: string;
  routeLabel: string;
  route: RouteResult;
  stops: Stop[];
}): OfflinePackMeta {
  const meta: OfflinePackMeta = {
    id: opts.id,
    routeLabel: opts.routeLabel,
    savedAt: Date.now(),
    stopCount: opts.stops.length,
    bounds: routeBounds(opts.route.coords),
  };
  const list = loadMeta().filter((p) => p.id !== meta.id);
  list.unshift(meta);
  saveMeta(list);
  return meta;
}

export function listOfflinePacks(): OfflinePackMeta[] {
  return loadMeta();
}

export function isCorridorOffline(id: string): boolean {
  return loadMeta().some((p) => p.id === id);
}

export function clearOfflinePack(id: string): void {
  saveMeta(loadMeta().filter((p) => p.id !== id));
}

/**
 * Sample points along the route that a service worker (or the client) can
 * use to warm map tiles. Spacing ~5 km keeps the request count reasonable.
 */
export function tileWarmPoints(route: LatLng[], spacingKm = 5): LatLng[] {
  return sampleAlong(route, spacingKm);
}
