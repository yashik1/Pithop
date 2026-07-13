export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocode(query: string): Promise<GeocodeResult> {
  // "lat, lng" input (e.g. from the use-my-location button) skips geocoding.
  const coords = query.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lng = parseFloat(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, displayName: `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})` };
    }
  }
  const { hasGeoapify, geoapifyGeocode } = await import('./geoapify');
  if (hasGeoapify()) return geoapifyGeocode(query);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`);
  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json();
  if (!data.length) throw new Error(`Couldn't find "${query}" — try a more specific place name`);
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}
