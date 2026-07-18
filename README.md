# 🛣️ Pithop — fun stops on long drives

Enter where you're driving from and to. Pithop maps your route and finds
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
  screen. Once saved (or loaded), plan edits live-sync to the library entry;
  a fresh search starts a new, unsaved trip.
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

## Community places (optional backend)

Travellers can share unlisted spots — a swimming hole, a local viewpoint —
with **every user**: tap **📍 Add a place** on the map, drop a pin, name it,
pick a category and add a note. Shared places appear automatically on any
route passing within ~12 km, for everyone, and ride along in saved trips
(so they work offline once found). Moderation is report-based: places
reported by 3 users are hidden; submissions are rate-limited per IP.

Setup: Vercel → **Marketplace → Upstash for Redis** (free tier) → attach to
the project → redeploy. The two env vars are injected automatically
(`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; the `KV_*` names also
work). Without them the endpoint answers 503 and the app hides the feature.

### Require sign-in to add a place (optional)

To make submissions accountable, gate **adding** a place behind an account
(browsing/reporting stay open). Auth is handled by [Supabase](https://supabase.com/)
(free tier) — Google and email/password:

1. Create a Supabase project → **Authentication → Providers**: enable **Email**,
   and **Google** (create a Google OAuth client, paste its id/secret, and add
   Supabase's callback URL to the Google client's authorized redirect URIs).
2. Set these env vars in Vercel and redeploy:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (client — the project URL +
     anon/public key)
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` (server — same values; used to verify
     the signed-in user)
3. Add your deployed origin under **Authentication → URL Configuration** (Site
   URL + redirect URLs) so the Google redirect returns to your app.

Submissions are then credited to the contributor's first name + last initial
("Added by Jane D."). Without these env vars, adding stays anonymous (only the
IP rate limit applies), so dev and forks keep working.

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

## Publishing to the app stores

Pithop is an installable PWA, so both stores are reached by *wrapping* the
deployed site — no separate native codebase. The manifest ships PNG icons
(192/512 + maskable), screenshots and the store metadata fields, so
[PWABuilder](https://www.pwabuilder.com) can package it as-is.

**Google Play (Trusted Web Activity):**

1. Create a Play Console account ($25 one-time), then an app with package
   name `com.pithop.app`.
2. On [pwabuilder.com](https://www.pwabuilder.com), enter the production URL
   and download the Android package (`.aab`).
3. In Play Console → **Test and release → App integrity → App signing**, copy
   the **SHA-256 certificate fingerprint** and paste it into
   `public/.well-known/assetlinks.json` (replacing the placeholder), then
   redeploy. This is what removes the browser bar from the wrapped app.
4. Upload the `.aab`, complete the listing (privacy policy:
   `https://pithop.com/privacy.html`), and submit.

**Apple App Store:** needs the $99/yr developer program and a Mac to build
the PWABuilder iOS package. Apple may push back on thin web wrappers
(guideline 4.2); iPhone users can always install via Safari →
**Add to Home Screen** without the store.

## Privacy

No ad trackers and no cross-site tracking. Trips are stored in the browser's
local storage; an account (Google or email) is needed only to share a
community place; usage stats are cookieless aggregate counts (Vercel Web
Analytics). See `public/privacy.html` (linked in the app footer) for the full
policy, data-source attribution and affiliate disclosure.

## Further production hardening

- Cache corridor queries server-side (Vercel KV / Upstash) to cut API costs.
- Live position tracking (`watchPosition`) and re-routing for in-car mode.
