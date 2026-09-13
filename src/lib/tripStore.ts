// Trip persistence — all in localStorage, so trips survive restarts and work
// fully offline, with no account. Two slots:
//  - the auto-saved "current trip" (restored on startup)
//  - the user's saved-trip library (explicit 💾 Save, load/delete from the
//    start screen)

import type { RouteResult } from '../api/route';
import type { Stop } from '../types';

export interface TripData {
  fromText: string;
  toText: string;
  // Intermediate stops the route passes through: the search-form text, plus the
  // coordinates they resolved to. Both optional — trips saved before multi-stop
  // routes existed have neither, and must keep loading.
  viaTexts?: string[];
  routeVias?: Array<{ lat: number; lng: number }>;
  routeLabel: string;
  route: RouteResult;
  stops: Stop[];
  planIds: string[];
  /** Day-by-day settings and edits. Optional: trips saved before the itinerary
   *  existed have none, and simply fall back to the defaults. */
  itinerary?: {
    /** Epoch ms — Date does not survive JSON. */
    departAt: number;
    maxDriveMin: number;
    maxDays: number | null;
    dayBreaks: string[];
    visitOverride: Record<string, number>;
  };
}

export interface StoredTrip extends TripData {
  id: string;
  savedAt: number;
  /** Server id once this trip has been mirrored to Postgres. Absent while it
   *  has only ever existed on this device, or when nobody is signed in. */
  remoteId?: string;
}

// Legacy key names kept on purpose after the rebrand to Pithop — renaming
// them would silently wipe existing users' saved trips.
const CURRENT_KEY = 'sidequest-trip-v1';
const LIBRARY_KEY = 'sidequest-trips-v1';
export const TRIP_LIMIT = 15;

function isTrip(t: TripData | null | undefined): boolean {
  return Boolean(t && t.route?.coords?.length && Array.isArray(t.stops) && t.stops.length);
}

export function loadCurrentTrip(): TripData | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TripData;
    return isTrip(t) ? t : null;
  } catch {
    return null;
  }
}

export function saveCurrentTrip(trip: TripData): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(trip));
  } catch {
    // Storage full or blocked — the app still works, just without offline restore.
  }
}

export function clearCurrentTrip(): void {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Nothing stored anyway if storage is blocked.
  }
}

export function listSavedTrips(): StoredTrip[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as StoredTrip[];
    return Array.isArray(list) ? list.filter(isTrip).sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

function writeLibrary(list: StoredTrip[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Upserts by route label, so re-saving "Austin → Dallas" updates that entry
// (fresh plan included) instead of duplicating it. Returns a user-readable
// error on failure, null on success.
export function saveTripToLibrary(trip: TripData): string | null {
  const list = listSavedTrips();
  const existing = list.findIndex((t) => t.routeLabel === trip.routeLabel);
  if (existing >= 0) {
    list[existing] = { ...list[existing], ...trip, savedAt: Date.now() };
  } else {
    if (list.length >= TRIP_LIMIT) {
      return `You already have ${TRIP_LIMIT} saved trips — delete one to make room.`;
    }
    list.unshift({ ...trip, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now() });
  }
  return writeLibrary(list) ? null : 'Saving failed — device storage looks full.';
}

// Live-sync: refresh an existing entry in place (no-op if it was deleted).
export function updateSavedTrip(id: string, trip: TripData): void {
  const list = listSavedTrips();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...trip, savedAt: Date.now() };
  writeLibrary(list);
}

export function deleteSavedTrip(id: string): StoredTrip[] {
  const list = listSavedTrips().filter((t) => t.id !== id);
  writeLibrary(list);
  return list;
}


// ---------------------------------------------------------------------------
// Cross-device sync
//
// localStorage stays the source of truth the app reads from — that is what
// keeps a trip openable on a plane. These helpers fold the server's copy into
// it after sign-in, and hand back what should be pushed the other way.
// ---------------------------------------------------------------------------

/**
 * Merge trips pulled from the server into the local library. Trips are matched
 * on route label, which is what the local library already upserts by, and the
 * newer of the two wins. Returns the merged library.
 */
export function mergeRemoteTrips(remote: Array<StoredTrip | (TripData & { remoteId: string; savedAt: number })>): StoredTrip[] {
  const local = listSavedTrips();
  const byLabel = new Map<string, StoredTrip>();
  for (const t of local) byLabel.set(t.routeLabel, t);

  for (const r of remote) {
    if (!isTrip(r)) continue;
    const existing = byLabel.get(r.routeLabel);
    if (!existing) {
      byLabel.set(r.routeLabel, {
        ...(r as TripData),
        id: `${r.savedAt}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: r.savedAt,
        remoteId: r.remoteId,
      });
    } else if (r.savedAt > existing.savedAt) {
      // Server copy is newer: take its content but keep the local id so any
      // open trip pointing at it stays pointing at it.
      byLabel.set(r.routeLabel, { ...existing, ...(r as TripData), savedAt: r.savedAt, remoteId: r.remoteId });
    } else {
      // Local copy is newer or equal — just remember where it lives remotely.
      byLabel.set(r.routeLabel, { ...existing, remoteId: r.remoteId ?? existing.remoteId });
    }
  }

  const merged = [...byLabel.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, TRIP_LIMIT);
  writeLibrary(merged);
  return merged;
}

/** Record the server id for a locally saved trip, after a successful push. */
export function setRemoteId(id: string, remoteId: string): void {
  const list = listSavedTrips();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], remoteId };
  writeLibrary(list);
}
