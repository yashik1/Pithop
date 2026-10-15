// Export & share helpers for Pithop trips.
//
// Multi-stop Google / Apple Maps deep links and a compact share-hash format
// that can be pasted or opened on another device. Everything is pure and
// works offline once the trip is in memory.

import type { Stop } from '../types';
import type { LatLng } from './geo';

const MAX_SHARE_STOPS = 40;

/** Google Maps multi-stop directions URL (origin → vias → destination). */
export function googleMapsMultiStopUrl(
  origin: LatLng,
  destination: LatLng,
  vias: LatLng[] = [],
): string {
  // Google accepts up to ~10 waypoints in the free deep-link form.
  const waypoints = vias.slice(0, 8).map((v) => `${v.lat},${v.lng}`).join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Apple Maps multi-stop directions URL. */
export function appleMapsMultiStopUrl(
  origin: LatLng,
  destination: LatLng,
  vias: LatLng[] = [],
): string {
  // Apple uses daddr / saddr and intermediate +to: segments.
  const parts = [
    `saddr=${origin.lat},${origin.lng}`,
    ...vias.slice(0, 8).map((v) => `daddr=${v.lat},${v.lng}`),
    `daddr=${destination.lat},${destination.lng}`,
  ];
  return `https://maps.apple.com/?${parts.join('&')}&dirflg=d`;
}

/**
 * Build a shareable #trip=… hash payload. Kept compact so the URL stays
 * under ~2 KB for common trips. Older clients that only understand f/t/p
 * still work; newer ones can also read w (via texts) and prefs.
 */
export function buildSharePayload(opts: {
  fromText: string;
  toText: string;
  viaTexts?: string[];
  plan: Stop[];
}): string {
  const payload = {
    f: opts.fromText.slice(0, 120),
    t: opts.toText.slice(0, 120),
    w: (opts.viaTexts ?? []).slice(0, 8).map((v) => v.slice(0, 80)),
    p: opts.plan.slice(0, MAX_SHARE_STOPS).map((s) => ({
      n: s.name.slice(0, 80),
      a: Math.round(s.lat * 1e5) / 1e5,
      o: Math.round(s.lng * 1e5) / 1e5,
      c: s.category,
      k: s.kind,
      v: s.visitMin,
      d: s.description?.slice(0, 160),
      pk: s.parking,
    })),
  };
  // btoa of URI-encoded JSON is the format parseShareHash already expects.
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

export function shareTripUrl(opts: {
  fromText: string;
  toText: string;
  viaTexts?: string[];
  plan: Stop[];
  base?: string;
}): string {
  const hash = buildSharePayload(opts);
  const base = opts.base ?? (typeof location !== 'undefined' ? location.origin + location.pathname : 'https://pithop.com/');
  return `${base}#trip=${hash}`;
}

/** Ordered planned stops as LatLngs for map export (sorted by alongKm). */
export function planAsVias(plan: Stop[]): LatLng[] {
  return [...plan].sort((a, b) => a.alongKm - b.alongKm).map((s) => ({ lat: s.lat, lng: s.lng }));
}
