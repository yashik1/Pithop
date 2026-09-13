// Cross-device trip storage for signed-in travellers.
//
// This is a sync layer, not a replacement for local storage. localStorage stays
// the source of truth the app reads from — it is what makes the app work
// offline and on a plane — and this module mirrors it to Postgres so the same
// trips show up on another device.
//
// Every function here is a no-op that resolves empty when auth is not
// configured or nobody is signed in, so anonymous use is completely unchanged.

import { getClient, hasAuth } from './auth';
import type { TripData } from './tripStore';

export interface RemoteTrip extends TripData {
  /** Server id. Absent on trips that have only ever lived on this device. */
  remoteId: string;
  savedAt: number;
}

// A trip carries its whole discovered stop list so it can be reopened offline.
// That is fine in localStorage but wasteful to push to a database on every
// edit, so the upload is trimmed: planned stops always survive, and the rest
// are kept up to a cap. Reopening re-discovers the remainder anyway.
const MAX_SYNCED_STOPS = 150;

function trimForUpload(t: TripData): TripData {
  if (t.stops.length <= MAX_SYNCED_STOPS) return t;
  const planned = new Set(t.planIds);
  const keep = t.stops.filter((s) => planned.has(s.id));
  for (const s of t.stops) {
    if (keep.length >= MAX_SYNCED_STOPS) break;
    if (!planned.has(s.id)) keep.push(s);
  }
  return { ...t, stops: keep };
}

async function userId(): Promise<string | null> {
  if (!hasAuth()) return null;
  const supabase = await getClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Every trip this traveller has saved, newest first. Empty when signed out. */
export async function listRemoteTrips(): Promise<RemoteTrip[]> {
  const uid = await userId();
  if (!uid) return [];
  const supabase = await getClient();
  // No user_id filter needed — row level security already restricts this to the
  // caller's own rows. Filtering here too would only be decoration.
  const { data, error } = await supabase
    .from('trips')
    .select('id, route_label, from_text, to_text, data, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.flatMap((row: any) => {
    const d = row.data ?? {};
    if (!d.route?.coords?.length) return [];
    return [{
      ...d,
      routeLabel: row.route_label || d.routeLabel || '',
      fromText: row.from_text || d.fromText || '',
      toText: row.to_text || d.toText || '',
      remoteId: row.id,
      savedAt: new Date(row.updated_at).getTime(),
    } as RemoteTrip];
  });
}

/**
 * Create or update a trip server-side. Returns its id, or null when signed out
 * or the write failed — callers treat that as "local only" and carry on.
 */
export async function upsertRemoteTrip(trip: TripData, remoteId?: string): Promise<string | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await getClient();
  const row = {
    user_id: uid,
    route_label: trip.routeLabel,
    from_text: trip.fromText,
    to_text: trip.toText,
    data: trimForUpload(trip) as unknown as Record<string, unknown>,
  };
  const q = remoteId
    ? supabase.from('trips').update(row).eq('id', remoteId).select('id').maybeSingle()
    : supabase.from('trips').insert(row).select('id').maybeSingle();
  const { data, error } = await q;
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function deleteRemoteTrip(remoteId: string): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const supabase = await getClient();
  await supabase.from('trips').delete().eq('id', remoteId);
}

/**
 * Whether trip sync is usable right now: auth configured AND signed in. The UI
 * uses this to decide between showing "synced" and staying quiet about it.
 */
export async function canSync(): Promise<boolean> {
  return (await userId()) !== null;
}
