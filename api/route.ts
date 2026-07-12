// Proxy for Google Routes API computeRoutes — traffic-aware total time through
// the user's chosen stops, with waypoint-order optimization.

function loc(p: { lat: number; lng: number }) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY not configured' });
    return;
  }
  const { origin, destination, intermediates } = req.body ?? {};
  if (!origin || !destination) {
    res.status(400).json({ error: 'origin and destination required' });
    return;
  }
  const stops: Array<{ lat: number; lng: number }> = Array.isArray(intermediates) ? intermediates : [];
  if (stops.length > 25) {
    res.status(400).json({ error: 'max 25 intermediate stops' });
    return;
  }
  try {
    const googleRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify({
        origin: loc(origin),
        destination: loc(destination),
        intermediates: stops.map(loc),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        ...(stops.length > 1 ? { optimizeWaypointOrder: true } : {}),
      }),
    });
    if (!googleRes.ok) {
      throw new Error(`Routes API ${googleRes.status}: ${(await googleRes.text()).slice(0, 300)}`);
    }
    const data = await googleRes.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route returned');
    res.status(200).json({
      durationMin: parseInt(route.duration, 10) / 60,
      distanceKm: (route.distanceMeters ?? 0) / 1000,
      order: route.optimizedIntermediateWaypointIndex ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
