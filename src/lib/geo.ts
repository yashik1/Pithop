export type LatLng = { lat: number; lng: number };

const EARTH_R = 6371;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export function cumulativeKm(route: LatLng[]): number[] {
  const out = new Array<number>(route.length);
  out[0] = 0;
  for (let i = 1; i < route.length; i++) {
    out[i] = out[i - 1] + haversineKm(route[i - 1], route[i]);
  }
  return out;
}

export interface RouteProjection {
  offRouteKm: number;
  alongKm: number;
}

// Equirectangular projection around the point's latitude — accurate enough for
// corridor distances of a few tens of km and far cheaper than per-segment haversine.
export function projectOntoRoute(point: LatLng, route: LatLng[], cumKm: number[]): RouteProjection {
  const kmPerLat = 110.574;
  const kmPerLng = 111.32 * Math.cos(toRad(point.lat));
  const px = point.lng * kmPerLng;
  const py = point.lat * kmPerLat;
  let bestD = Infinity;
  let bestAlong = 0;
  let ax = route[0].lng * kmPerLng;
  let ay = route[0].lat * kmPerLat;
  for (let i = 0; i < route.length - 1; i++) {
    const bx = route[i + 1].lng * kmPerLng;
    const by = route[i + 1].lat * kmPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < bestD) {
      bestD = d;
      bestAlong = cumKm[i] + t * (cumKm[i + 1] - cumKm[i]);
    }
    ax = bx;
    ay = by;
  }
  return { offRouteKm: bestD, alongKm: bestAlong };
}

// Evenly spaced sample points along the route, always including the endpoints.
export function sampleAlong(route: LatLng[], spacingKm: number): LatLng[] {
  const cum = cumulativeKm(route);
  const out: LatLng[] = [];
  let next = 0;
  for (let i = 0; i < route.length; i++) {
    if (cum[i] >= next) {
      out.push(route[i]);
      next = cum[i] + spacingKm;
    }
  }
  const last = route[route.length - 1];
  const tail = out[out.length - 1];
  if (tail.lat !== last.lat || tail.lng !== last.lng) out.push(last);
  return out;
}

// Ramer–Douglas–Peucker, iterative to avoid deep recursion on long routes.
function rdp(points: LatLng[], epsilonDeg: number): LatLng[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = points[s];
    const b = points[e];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      let t = lenSq === 0 ? 0 : ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(p.lng - (a.lng + t * dx), p.lat - (a.lat + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilonDeg && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function simplify(route: LatLng[], maxPoints: number): LatLng[] {
  let pts = route;
  let eps = 0.002;
  while (pts.length > maxPoints) {
    pts = rdp(route, eps);
    eps *= 2;
  }
  return pts;
}
