// Proxy for Google Places API (New) "search along route" — keeps the API key
// server-side. Three text searches along the route ≈ 3 billable calls/search.

const DEFAULT_QUERIES = [
  'tourist attractions and roadside attractions',
  'highly rated restaurants and cafes',
  'parks and scenic viewpoints',
];

const FIELD_MASK =
  'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.primaryType,places.googleMapsUri';

// Standard Google polyline5 encoding.
function encodeDiff(v: number): string {
  let x = v < 0 ? ~(v << 1) : v << 1;
  let s = '';
  while (x >= 0x20) {
    s += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
    x >>= 5;
  }
  return s + String.fromCharCode(x + 63);
}

function encodePolyline(points: Array<[number, number]>): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeDiff(iLat - lastLat) + encodeDiff(iLng - lastLng);
    lastLat = iLat;
    lastLng = iLng;
  }
  return out;
}

async function searchAlong(textQuery: string, encodedPolyline: string, key: string): Promise<any[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 20,
      searchAlongRouteParameters: { polyline: { encodedPolyline } },
    }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.places ?? [];
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
  const polyline = req.body?.polyline;
  if (!Array.isArray(polyline) || polyline.length < 2 || polyline.length > 200) {
    res.status(400).json({ error: 'polyline must be an array of 2–200 [lat,lng] pairs' });
    return;
  }
  try {
    const encoded = encodePolyline(polyline);
    const results = await Promise.all(DEFAULT_QUERIES.map((q) => searchAlong(q, encoded, key)));
    const byId = new Map<string, any>();
    for (const list of results) {
      for (const place of list) byId.set(place.id, place);
    }
    res.status(200).json({ places: [...byId.values()] });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
