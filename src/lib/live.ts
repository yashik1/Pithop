// Live-drive helpers: next-stop selection, distance/ETA, and "ahead of me"
// filtering. Pure functions so they stay easy to test and reuse from the
// live HUD and the results list.

import type { Stop } from '../types';
import { haversineKm, projectOntoRoute, type LatLng } from './geo';
import { pithopScore, DEFAULT_PREFS, type TripPrefs, type ScoreContext } from './score';

export interface NextStopInfo {
  stop: Stop;
  distKm: number;
  /** Estimated minutes at current average speed (or 50 km/h fallback). */
  etaMin: number;
  /** Distance along the route from the traveller's projection. */
  alongDeltaKm: number;
}

/**
 * Filter stops that are still ahead of the traveller on the route.
 * `myAlongKm` is the projection of the current position onto the route.
 * `horizonKm` caps how far ahead we care about (default 80 km).
 */
export function stopsAhead(
  stops: Stop[],
  myAlongKm: number,
  horizonKm = 80,
): Stop[] {
  return stops.filter(
    (s) => s.alongKm >= myAlongKm - 0.5 && s.alongKm <= myAlongKm + horizonKm,
  );
}

/**
 * Pick the best next stop for the live HUD: highest Pithop score among stops
 * that are ahead, within the horizon, and not already visited.
 */
export function bestNextStop(
  stops: Stop[],
  myAlongKm: number,
  prefs: TripPrefs = DEFAULT_PREFS,
  opts: {
    horizonKm?: number;
    visitedIds?: ReadonlySet<string>;
    pos?: LatLng;
    speedKmh?: number;
    ctx?: ScoreContext;
  } = {},
): NextStopInfo | null {
  const horizon = opts.horizonKm ?? 80;
  const visited = opts.visitedIds ?? new Set<string>();
  const candidates = stopsAhead(stops, myAlongKm, horizon).filter((s) => !visited.has(s.id));
  if (!candidates.length) return null;

  let best: Stop | null = null;
  let bestScore = -1;
  for (const s of candidates) {
    const scored = pithopScore(s, prefs, opts.ctx);
    // Prefer closer high-score stops slightly so the HUD doesn't jump to a
    // gem 70 km away when a good one is 8 km ahead.
    const proximity = 1 - Math.min(1, (s.alongKm - myAlongKm) / horizon) * 0.25;
    const adjusted = scored.score * proximity;
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = s;
    }
  }
  if (!best) return null;

  const distKm = opts.pos
    ? haversineKm(opts.pos, best)
    : Math.max(0, best.alongKm - myAlongKm) + best.offRouteKm;
  const speed = opts.speedKmh && opts.speedKmh > 5 ? opts.speedKmh : 50;
  const etaMin = Math.round((distKm / speed) * 60);

  return {
    stop: best,
    distKm: Math.round(distKm * 10) / 10,
    etaMin,
    alongDeltaKm: Math.round((best.alongKm - myAlongKm) * 10) / 10,
  };
}

/**
 * Project a live GPS position onto the active route and return along-route
 * progress plus whether the traveller appears off-route.
 */
export function projectLivePosition(
  pos: LatLng,
  route: LatLng[],
  cumKm: number[],
  offRouteThresholdKm = 1.2,
): { alongKm: number; offRouteKm: number; offRoute: boolean } {
  if (!route.length || cumKm.length !== route.length) {
    return { alongKm: 0, offRouteKm: 0, offRoute: false };
  }
  const { alongKm, offRouteKm } = projectOntoRoute(pos, route, cumKm);
  return {
    alongKm,
    offRouteKm,
    offRoute: offRouteKm > offRouteThresholdKm,
  };
}
