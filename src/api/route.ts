import type { LatLng } from '../lib/geo';
import type { Vehicle } from '../lib/vehicle';

export interface RouteResult {
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
}

export async function fetchRoute(from: LatLng, to: LatLng, vehicle: Vehicle = 'car'): Promise<RouteResult> {
  const { hasGeoapify, geoapifyRoute } = await import('./geoapify');
  if (hasGeoapify()) return geoapifyRoute(from, to, vehicle);
  // The free OSRM demo only serves the car profile; non-car needs Geoapify.
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No drivable route found between those places');
  }
  const route = data.routes[0];
  return {
    coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}
