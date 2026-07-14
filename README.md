# 🛣️ SideQuest — fun stops on long drives

Enter where you're driving from and to. SideQuest maps your route and finds
viewpoints, quirky attractions, nature, history, museums, food and rest stops
along a corridor around it — each with an **estimated visit time** and an
**estimated detour** off your route. Filter by category, max detour, and how
much time you're willing to spend, then build a stop list that shows the total
added time for your trip.

Tap any stop to expand it: you get a photo, a short intro pulled from the
Wikipedia article, and a **"what you can do here"** hint (e.g. parks → walk a
trail or picnic; viewpoints → quick photo stop) plus Wikipedia / Google Maps
links. Roadside stops show extra detail from their OpenStreetMap tags —
cuisine and opening hours for food, restrooms/picnic tables for rest areas.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
```

No API keys required.

## How it works

The app runs in one of two modes, switched by a single env var:

- **Hobby mode (no key):** free public OSM services. Fine for personal use;
  their usage policies disallow or discourage commercial apps.
- **Commercial mode (`VITE_GEOAPIFY_API_KEY` set):** [Geoapify](https://www.geoapify.com/)
  replaces every public server. Open-data based, commercial use allowed with
  attribution, generous free tier (~3,000 credits/day).

| Concern | Hobby mode (no key) | With Geoapify key |
| --- | --- | --- |
| Autocomplete | [Photon](https://photon.komoot.io/) (OSM) | Geoapify Autocomplete |
| Geocoding fallback | [Nominatim](https://nominatim.org/) (~1 req/s) | Geoapify Geocoding |
| Driving route | [OSRM demo server](https://project-osrm.org/) (no SLA) | Geoapify Routing |
| Landmarks & attractions | Wikipedia GeoSearch API | Wikipedia (always — CC BY-SA, attributed) |
| Food, viewpoints, rest stops | [Overpass API](https://overpass-api.de/) (often busy) | Geoapify Places |
| Map tiles | OpenStreetMap tiles + Leaflet | Geoapify tiles + Leaflet |
| Per-stop navigation | Google Maps deep links (plain URLs, no API — allowed) | same |

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
  see total added time.
- **In-car (PWA):** the app is installable (Add to Home Screen). On the road:
  tap 📍 to use your current location as the origin, and enable
  **"only stops ahead of me (next 80 km)"** to filter the list/map to what's
  coming up. Mobile layout puts the map on top and the list below.
- **Saved trips:** 💾 on the route summary stores a trip (route, stops and
  plan) in an on-device library — reopen or delete them from the start
  screen. Re-saving the same route updates its entry.
- **Works offline:** the last searched trip (route, stops and your chosen
  plan) is saved on the device, and map tiles/photos you've viewed are cached.
  Lose signal in the middle of nowhere and reopen the app — your trip, plan
  and "stops ahead of me" (GPS needs no internet) all still work.

## Going commercial: the Geoapify key

The free public OSM servers ([tile usage policy](https://operations.osmfoundation.org/policies/tiles/),
[Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/))
warn commercial apps that access can be cut off at any time, and the earlier
Google Places/Routes integration was removed because Google's terms prohibit
displaying its data on a non-Google (Leaflet) map. Geoapify solves both:
open-data, commercial use allowed, one key for everything.

1. Create a free account at [geoapify.com](https://www.geoapify.com/) and make
   a project → API key.
2. In the Geoapify dashboard, restrict the key to your domain(s) — it ships to
   the browser, domain restriction is what keeps it yours.
3. Set it as `VITE_GEOAPIFY_API_KEY` in Vercel (Project → Settings →
   Environment Variables) and redeploy. No key = hobby mode, automatically.

## Affiliate links (optional)

Monetization is env-driven and off by default — each button appears only when
its partner ID is configured, and a disclosure line shows in the footer
whenever any partner is active:

| Env var | Partner | Where it shows |
| --- | --- | --- |
| `VITE_VIATOR_PID` | [Viator partner program](https://partner.viator.com/) (`pid`, e.g. `P00123456`) | "🎟️ Book tickets" on attraction/museum/zoo/theme-park stops |
| `VITE_GYG_PARTNER_ID` | [GetYourGuide partners](https://partner.getyourguide.com/) — used if no Viator pid | same |
| `VITE_BOOKING_AID` | [Booking.com affiliate program](https://www.booking.com/affiliate-program/v2/index.html) (`aid` number) | "🏨 Hotels in {destination}" on the route summary |
| `VITE_UPSIDE_REF_URL` | [Upside](https://www.getupside.com/) personal referral link (`https://upside.app.link/…`) | "⛽ Gas cash back" on rest stops |

All affiliate anchors carry `rel="sponsored"`, and `public/privacy.html`
contains the full disclosure.

## Deploying (Vercel)

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repo
   (`yashik1/Side-quest`). Framework preset: **Vite** (auto-detected). Deploy.
2. Add the `VITE_GEOAPIFY_API_KEY` env var (optional — see above) and redeploy.

## Privacy

No accounts, no trackers, no analytics. Trips are stored in the browser's
local storage only. See `public/privacy.html` (linked in the app footer) for
the full policy, data-source attribution and affiliate disclosure.

## Further production hardening

- Cache corridor queries server-side (Vercel KV / Upstash) to cut API costs.
- Live position tracking (`watchPosition`) and re-routing for in-car mode.
