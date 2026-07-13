# 🛣️ SideQuest — fun stops on long drives

Enter where you're driving from and to. SideQuest maps your route and finds
viewpoints, quirky attractions, nature, history, museums, food and rest stops
along a corridor around it — each with an **estimated visit time** and an
**estimated detour** off your route. Filter by category, max detour, and how
much time you're willing to spend, then build a stop list that shows the total
added time for your trip.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
```

No API keys required.

## How it works

| Concern | Service | Notes |
| --- | --- | --- |
| Autocomplete | [Photon](https://photon.komoot.io/) (OSM) | Free search-as-you-type; chosen suggestions carry exact coordinates |
| Geocoding fallback | [Nominatim](https://nominatim.org/) | For free-typed text, ~1 req/s fair-use limit |
| Driving route | [OSRM demo server](https://project-osrm.org/) | Free demo instance, no SLA |
| Landmarks & attractions | Wikipedia GeoSearch API | Fast, includes descriptions + photos |
| Food, viewpoints, rest stops | [Overpass API](https://overpass-api.de/) (OpenStreetMap) | Often busy — treated as best-effort |
| Map tiles | OpenStreetMap tiles + Leaflet | Free fair-use |
| Per-stop navigation | Google Maps deep links | No key needed |

Pipeline: geocode both endpoints → fetch route geometry from OSRM → sample the
route into evenly spaced points (~12 km apart, capped at ~80) → query both
place sources in parallel with a 10 km disc around each sample point →
project every POI onto the route to get *distance off route* and *distance
along route* → estimate detour minutes and visit minutes → filter/sort
client-side.

**Graceful degradation:** Wikipedia results render as soon as they arrive
(typically 2–5 s); Overpass roadside stops merge in later. If either source is
down or rate-limited, the app shows what it has plus a notice — it never
blocks on the slow source. (The public Overpass servers time out on
corridor-scale queries routinely; this is why they're the secondary source,
scoped to only the categories Wikipedia is weak at.)

Wikipedia pages are categorized by keyword rules on their short descriptions
(cities/counties/highways etc. are filtered out). Visit-time estimates are a
per-kind heuristic table in `src/lib/categories.ts` (viewpoint ≈ 15 min,
museum ≈ 90 min, theme park ≈ 4 h, …).

## Pre-trip and in-car

- **Pre-trip planning:** search a route on desktop, filter, build a stop list,
  see total added time. With the Google proxy configured you also get a
  traffic-aware door-to-door total and an optimized stop order.
- **In-car (PWA):** the app is installable (Add to Home Screen). On the road:
  tap 📍 to use your current location as the origin, and enable
  **"only stops ahead of me (next 80 km)"** to filter the list/map to what's
  coming up. Mobile layout puts the map on top and the list below.

## Optional Google integration (better data, live traffic)

Three Vercel serverless functions in `api/` proxy Google APIs so the key never
reaches the browser. Without a key the app silently stays on the free stack.

- `api/places.ts` — Places API (New) *search along route*: adds high-quality,
  **rated** food/attraction/park stops (3 billable text-search calls per
  route search).
- `api/route.ts` — Routes API: traffic-aware total through your chosen stops
  plus optimized stop order (1 call per plan change, debounced).
- `api/health.ts` — tells the client whether the key is configured.

### Getting the API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a project (any name, e.g. `sidequest`).
2. Billing must be enabled (Google gives new accounts $300 free credit, plus
   a recurring monthly free tier for Maps APIs).
3. In **APIs & Services → Library**, enable **Places API (New)** and
   **Routes API**.
4. In **APIs & Services → Credentials**, create an **API key**. Under key
   restrictions, restrict it to those two APIs (no HTTP-referrer restriction
   needed — it's only used server-side).
5. Set it as the `GOOGLE_MAPS_API_KEY` environment variable in Vercel
   (Project → Settings → Environment Variables) and redeploy.

## Deploying (Vercel)

The repo is Vercel-ready: Vite front end + `api/` serverless functions.

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repo
   (`yashik1/Side-quest`). Framework preset: **Vite** (auto-detected). Deploy.
2. Add the `GOOGLE_MAPS_API_KEY` env var (optional — see above) and redeploy.

## Further production hardening

- Cache corridor queries server-side (Vercel KV / Upstash) to cut API costs.
- Self-hosted OSRM + Photon/Nominatim to drop the demo-server dependency.
- Live position tracking (`watchPosition`) and re-routing for in-car mode.
