// Vehicle profile for routing. With a Geoapify key each maps to a real routing
// mode (trucks avoid low bridges/weight limits, bikes use cycle paths, times
// differ). The free OSRM demo only routes cars, so non-car options require
// Geoapify — the UI disables them otherwise.

export type Vehicle = 'car' | 'truck' | 'motorcycle' | 'bike';

export const VEHICLES: Array<{
  id: Vehicle;
  icon: string;
  geoapify: string; // Geoapify routing `mode`
  offRouteKmh: number; // speed used to estimate detour minutes off the route
}> = [
  { id: 'car', icon: '🚗', geoapify: 'drive', offRouteKmh: 40 },
  { id: 'truck', icon: '🚚', geoapify: 'truck', offRouteKmh: 32 },
  { id: 'motorcycle', icon: '🏍️', geoapify: 'motorcycle', offRouteKmh: 45 },
  { id: 'bike', icon: '🚲', geoapify: 'bicycle', offRouteKmh: 14 },
];

export const VEHICLE_MAP: Record<Vehicle, (typeof VEHICLES)[number]> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
) as Record<Vehicle, (typeof VEHICLES)[number]>;

const KEY = 'sq-vehicle';

export function getVehicle(): Vehicle {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in VEHICLE_MAP) return v as Vehicle;
  } catch {
    // fall through
  }
  return 'car';
}

export function setVehicle(v: Vehicle): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // storage blocked — won't persist
  }
}
