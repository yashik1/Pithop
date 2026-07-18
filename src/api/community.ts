// Client for the community-places backend (api/community.ts): traveller-
// submitted stops shared with every user. If the backend isn't deployed or
// its database isn't configured, hasCommunity() resolves false and the app
// hides the feature entirely.

import type { LatLng } from '../lib/geo';
import type { Stop } from '../types';
import { visitMinutes, type CategoryId } from '../lib/categories';
import { getAccessToken } from '../lib/auth';

let available: boolean | null = null;

export async function hasCommunity(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const res = await fetch('/api/community');
    // Static hosts answer unknown paths with the SPA's index.html, so require
    // the real JSON handshake, not just a 200.
    available = res.ok && (await res.json()).ok === true;
  } catch {
    available = false;
  }
  return available;
}

interface CommunityRecord {
  id: string;
  name: string;
  note?: string;
  category: CategoryId;
  visitMin?: number;
  parking?: 'free' | 'paid' | 'none';
  by?: string;
  lat: number;
  lng: number;
}

function toStop(r: CommunityRecord): Stop {
  return {
    id: `community/${r.id}`,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    category: r.category,
    kind: 'community',
    visitMin: r.visitMin ?? visitMinutes('community'),
    source: 'community',
    description: r.note || undefined,
    parking: r.parking,
    by: r.by,
    offRouteKm: 0,
    alongKm: 0,
    detourMin: 0,
  };
}

export async function fetchCommunityStops(samples: LatLng[]): Promise<Stop[]> {
  if (!(await hasCommunity())) return [];
  const points = samples
    .slice(0, 60)
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join('|');
  const res = await fetch(`/api/community?points=${encodeURIComponent(points)}`);
  if (!res.ok) throw new Error(`Community lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return ((data.stops ?? []) as CommunityRecord[]).map(toStop);
}

export interface CommunitySubmission {
  name: string;
  note: string;
  category: CategoryId;
  visitMin: number;
  parking: 'free' | 'paid' | 'none' | '';
  lat: number;
  lng: number;
}

export async function submitCommunityStop(sub: CommunitySubmission): Promise<Stop> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/community', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'submit', ...sub }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Sharing failed (HTTP ${res.status})`);
  return toStop(data.stop as CommunityRecord);
}

export async function reportCommunityStop(stopId: string): Promise<void> {
  const id = stopId.replace(/^community\//, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Reporting requires a signed-in account when auth is configured (it's
  // moderation power) — attach the token like submissions do.
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('/api/community', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'report', id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Report failed (HTTP ${res.status})`);
}
