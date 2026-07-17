import { useEffect, useMemo, useRef, useState } from 'react';
import { geocode } from './api/geocode';
import { fetchRoute, type RouteResult } from './api/route';
import { fetchRoadsideStops } from './api/overpass';
import { fetchWikiExtract, fetchWikiStops } from './api/wikipedia';
import { fetchGeoapifyRoadside, hasGeoapify } from './api/geoapify';
import {
  fetchCommunityStops,
  hasCommunity,
  reportCommunityStop,
  submitCommunityStop,
} from './api/community';
import type { Stop } from './types';
import { CATEGORIES, CATEGORY_MAP, thingsToDo, type CategoryId } from './lib/categories';
import { anyAffiliate, gasCashbackLink, hotelsLink, ticketsLink } from './lib/affiliates';
import { getThemeMode, setThemeMode, type ThemeMode } from './lib/theme';
import { consumeAuthErrorFromUrl, getUser, hasAuth, signOut, subscribe, type AuthUser } from './lib/auth';
import { AuthPanel } from './components/AuthPanel';
import { catLabel, getLang, LANGUAGES, setLang, t, type Lang } from './lib/i18n';
import { getVehicle, setVehicle, VEHICLES, VEHICLE_MAP, type Vehicle } from './lib/vehicle';
import {
  clearCurrentTrip,
  deleteSavedTrip,
  listSavedTrips,
  loadCurrentTrip,
  saveCurrentTrip,
  saveTripToLibrary,
  updateSavedTrip,
  type StoredTrip,
  type TripData,
} from './lib/tripStore';

const THEME_LABELS: Record<ThemeMode, { icon: string; label: string }> = {
  auto: { icon: '🌓', label: 'Auto (follows your device)' },
  dark: { icon: '🌙', label: 'Dark' },
  light: { icon: '☀️', label: 'Light' },
};
const THEME_CYCLE: Record<ThemeMode, ThemeMode> = { auto: 'dark', dark: 'light', light: 'auto' };

const PARKING_KEY: Record<'free' | 'paid' | 'none', 'parkFree' | 'parkPaid' | 'parkNone'> = {
  free: 'parkFree',
  paid: 'parkPaid',
  none: 'parkNone',
};

// Decode a shared trip from location.hash (#trip=<base64>). Returns the route
// endpoints (as text) and the planned stops, or null if there's no valid share.
function parseShareHash(): { fromText: string; toText: string; plan: Stop[] } | null {
  const m = /[#&]trip=([^&]+)/.exec(location.hash);
  if (!m) return null;
  try {
    const data = JSON.parse(decodeURIComponent(atob(m[1])));
    if (!data.f || !data.t || !Array.isArray(data.p)) return null;
    const known = new Set(CATEGORIES.map((c) => c.id));
    const plan: Stop[] = data.p
      .filter((p: any) => Number.isFinite(Number(p.a)) && Number.isFinite(Number(p.o)))
      .map((p: any, i: number) => ({
      id: `share/${i}`,
      name: String(p.n ?? 'Stop').slice(0, 120),
      lat: Number(p.a),
      lng: Number(p.o),
      category: (known.has(p.c) ? p.c : 'fun') as CategoryId,
      kind: p.k ?? 'community',
      visitMin: Number(p.v) || 30,
      source: 'community' as const,
      description: p.d || undefined,
      parking: p.pk,
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    }));
    return { fromText: String(data.f), toText: String(data.t), plan };
  } catch {
    return null;
  }
}
import { cumulativeKm, haversineKm, projectOntoRoute, sampleAlong, simplify, type LatLng } from './lib/geo';
import { distValue, fmtDist, fmtDur, type Units } from './lib/format';
import { getUnits, setUnits } from './lib/units';
import { MapView } from './MapView';
import { PlaceInput } from './components/PlaceInput';

const DETOUR_OPTIONS = [5, 10, 15, 25, 40];
const VISIT_OPTIONS: Array<{ key: 'visitQuick' | 'visitShort' | 'visit1h' | 'visit2h' | 'visitAny'; max: number }> = [
  { key: 'visitQuick', max: 15 },
  { key: 'visitShort', max: 30 },
  { key: 'visit1h', max: 60 },
  { key: 'visit2h', max: 120 },
  { key: 'visitAny', max: 9999 },
];
const LIST_CAP = 250;

function shortName(displayName: string): string {
  return displayName.split(',')[0];
}

// Device position with a friendly, accurate error. Low accuracy + a cached fix
// is plenty for a route origin and far more reliable than high-accuracy (GPS)
// requests, which routinely time out on desktops with no GPS chip — the usual
// cause of "could not get your location" even when permission is granted.
// Retries once on a transient failure before giving up.
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available in this browser'));
      return;
    }
    const opts: PositionOptions = { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 };
    const fail = (err: GeolocationPositionError) => {
      reject(
        new Error(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked for this site — allow it via the location icon in your address bar, then try again'
            : err.code === err.TIMEOUT
              ? 'Getting your location timed out — try again, or just type your starting point'
              : "Couldn't pin down your location right now — try again, or type your starting point",
        ),
      );
    };
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        // A transient "position unavailable" often clears on a second try.
        // Don't retry a timeout (we already waited the full window) or a
        // denied permission (it won't change) — fail fast so the user can type.
        if (err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(resolve, fail, { ...opts, maximumAge: 0 });
        } else {
          fail(err);
        }
      },
      opts,
    );
  });
}

// Defensive String(): a rare POI can arrive with a non-string name (e.g. a
// purely numeric OSM name), and this runs over every stop from every source —
// it must never throw ("e.toLowerCase is not a function" killed whole searches).
function normName(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Wikipedia stops win on collisions — they carry descriptions, photos and links.
function mergeStops(primary: Stop[], secondary: Stop[]): Stop[] {
  const out = [...primary];
  const byNorm = new Map<string, Stop[]>();
  for (const s of primary) {
    const key = normName(s.name);
    const list = byNorm.get(key) ?? [];
    list.push(s);
    byNorm.set(key, list);
  }
  for (const s of secondary) {
    const dupes = byNorm.get(normName(s.name)) ?? [];
    if (!dupes.some((p) => haversineKm(p, s) < 0.8)) out.push(s);
  }
  return out.sort((a, b) => a.alongKm - b.alongKm);
}

export default function App() {
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  // Exact coordinates from a chosen autocomplete suggestion (or the geolocation
  // button); when set, the search skips geocoding the typed text.
  const [fromPick, setFromPick] = useState<LatLng | null>(null);
  const [toPick, setToPick] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLabel, setRouteLabel] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [cats, setCats] = useState<Set<CategoryId>>(new Set(CATEGORIES.map((c) => c.id)));
  const [maxDetour, setMaxDetour] = useState(15);
  const [maxVisit, setMaxVisit] = useState(9999);
  const [planIds, setPlanIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Fuller Wikipedia intro per stop id ('' = fetched, nothing usable).
  const [wikiIntros, setWikiIntros] = useState<Record<string, string>>({});
  const [aheadOnly, setAheadOnly] = useState(false);
  const [myAlongKm, setMyAlongKm] = useState<number | null>(null);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getThemeMode);
  const [units, setUnitsState] = useState<Units>(getUnits);
  const [lang, setLangState] = useState<Lang>(getLang);
  // Non-car routing needs Geoapify; fall back to car in hobby mode.
  const [vehicle, setVehicleState] = useState<Vehicle>(() => (hasGeoapify() ? getVehicle() : 'car'));
  // Ref mirror so a re-run picks the current vehicle without waiting for state.
  const vehicleRef = useRef<Vehicle>(vehicle);
  const [savedTrips, setSavedTrips] = useState<StoredTrip[]>(listSavedTrips);
  // Community places: shared with all users via the optional backend.
  const [communityOn, setCommunityOn] = useState(false);
  const [addArmed, setAddArmed] = useState(false);
  const [addPin, setAddPin] = useState<LatLng | null>(null);
  const [addName, setAddName] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addCategory, setAddCategory] = useState<CategoryId>('fun');
  const [addVisit, setAddVisit] = useState(30);
  const [addParking, setAddParking] = useState<'free' | 'paid' | 'none' | ''>('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const routeCalcRef = useRef<{ calcRoute: LatLng[]; cum: number[] } | null>(null);

  // Bumped on every new search so a slow response from an old search can't
  // overwrite the results of a newer one.
  const searchSeq = useRef(0);
  // Library entry the active trip belongs to (saved or loaded from it) —
  // edits live-sync to that entry. A fresh search detaches until re-saved.
  const activeLibraryIdRef = useRef<string | null>(null);
  // Planned stops from an opened share link, applied once the search rebuilds
  // the route and full stop list.
  const sharedPlanRef = useRef<Stop[] | null>(null);
  const [sharePending, setSharePending] = useState(false);

  // Make a stored trip the active one: route, stops, plan, map refs.
  function applyTrip(t: TripData) {
    const calcRoute = simplify(t.route.coords, 1500);
    routeCalcRef.current = { calcRoute, cum: cumulativeKm(calcRoute) };
    setFromText(t.fromText);
    setToText(t.toText);
    setFromPick(null);
    setToPick(null);
    setRoute(t.route);
    setRouteLabel(t.routeLabel);
    setStops(t.stops);
    setPlanIds(new Set(t.planIds));
    setSelectedId(null);
    setAheadOnly(false);
    setMyAlongKm(null);
  }

  // Route geometry is simplified before writing to stay inside storage quotas.
  const buildTripData = (): TripData | null =>
    route && stops.length
      ? {
          fromText,
          toText,
          routeLabel,
          route: { ...route, coords: simplify(route.coords, 1500) },
          stops,
          planIds: [...planIds],
        }
      : null;

  // Show the community "Add a place" feature only when the backend exists.
  useEffect(() => {
    void hasCommunity().then(setCommunityOn);
  }, []);

  // Track sign-in state (community submissions require an account when auth
  // is configured). No-op when auth isn't set up. If an OAuth redirect bounced
  // back with an error in the URL hash, surface it — otherwise a failed Google
  // sign-in looks like the button did nothing.
  useEffect(() => {
    if (!hasAuth()) return;
    const authErr = consumeAuthErrorFromUrl();
    if (authErr) setError(`Sign-in failed: ${authErr}`);
    void getUser().then(setUser);
    return subscribe(setUser);
  }, []);

  // On startup: an opened share link wins over the auto-saved trip. It carries
  // the endpoints and planned stops; we re-run the search to rebuild the route
  // and full results, then re-apply the shared plan (see the effect below).
  useEffect(() => {
    const shared = parseShareHash();
    if (shared) {
      history.replaceState(null, '', location.pathname + location.search); // drop the long hash
      sharedPlanRef.current = shared.plan;
      setSharePending(true);
      setFromText(shared.fromText);
      setToText(shared.toText);
      setFromPick(null);
      setToPick(null);
      setNotice('Opening a shared trip — finding stops along the route…');
      void findStops(shared.fromText, shared.toText);
      return;
    }
    const saved = loadCurrentTrip();
    if (!saved) return;
    applyTrip(saved);
    if (!navigator.onLine) setNotice('You are offline — showing your saved trip.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once a shared trip's search has populated stops, restore its plan: match
  // shared stops to the rebuilt results by id/coordinates, and append any that
  // aren't found (e.g. community places) so the plan is exactly as shared.
  useEffect(() => {
    if (!sharePending || stops.length === 0) return;
    const shared = sharedPlanRef.current ?? [];
    const ids = new Set<string>();
    const extras: Stop[] = [];
    for (const sp of shared) {
      const match = stops.find(
        (s) => s.id === sp.id || (Math.abs(s.lat - sp.lat) < 6e-4 && Math.abs(s.lng - sp.lng) < 6e-4),
      );
      if (match) ids.add(match.id);
      else extras.push(enrichWithRoute(sp));
    }
    if (extras.length) setStops((prev) => [...prev, ...extras].sort((a, b) => a.alongKm - b.alongKm));
    for (const e of extras) ids.add(e.id);
    setPlanIds(ids);
    setSharePending(false);
    sharedPlanRef.current = null;
    setNotice(`Opened a shared trip with ${ids.size} stop${ids.size === 1 ? '' : 's'}. Add more or start driving!`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, sharePending]);

  // Keep the auto-saved current trip fresh (plan edits included), and
  // live-sync the library entry this trip belongs to, if any.
  useEffect(() => {
    const t = buildTripData();
    if (!t) return;
    saveCurrentTrip(t);
    if (activeLibraryIdRef.current) {
      updateSavedTrip(activeLibraryIdRef.current, t);
      setSavedTrips(listSavedTrips());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, stops, planIds, routeLabel]);

  function handleSaveTrip() {
    const t = buildTripData();
    if (!t) return;
    const err = saveTripToLibrary(t);
    const list = listSavedTrips();
    setSavedTrips(list);
    if (!err) activeLibraryIdRef.current = list.find((s) => s.routeLabel === t.routeLabel)?.id ?? null;
    setNotice(err ?? '💾 Trip saved — it keeps updating as you edit, and you can reopen it from the start screen.');
  }

  function handleLoadTrip(t: StoredTrip) {
    searchSeq.current++; // invalidates any in-flight search
    activeLibraryIdRef.current = t.id;
    setBusy(null);
    setError(null);
    setNotice(null);
    applyTrip(t);
  }

  function handleDeleteTrip(t: StoredTrip) {
    if (!window.confirm(`Delete saved trip "${t.routeLabel}"?`)) return;
    if (activeLibraryIdRef.current === t.id) activeLibraryIdRef.current = null;
    setSavedTrips(deleteSavedTrip(t.id));
  }

  // Enrich a single stop against the active route (no-op when no route).
  function enrichWithRoute(s: Stop): Stop {
    const calc = routeCalcRef.current;
    if (!calc) return s;
    const proj = projectOntoRoute({ lat: s.lat, lng: s.lng }, calc.calcRoute, calc.cum);
    return {
      ...s,
      offRouteKm: proj.offRouteKm,
      alongKm: proj.alongKm,
      detourMin: Math.round((proj.offRouteKm * 2 * 60) / 40) + 2,
    };
  }

  function pickAddPoint(p: LatLng) {
    setAddPin(p);
    setAddArmed(false);
    setAddName('');
    setAddNote('');
    setAddCategory('fun');
    setAddVisit(30);
    setAddParking('');
    setAddError(null);
  }

  async function shareAddPlace() {
    if (!addPin || !addName.trim() || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const stop = await submitCommunityStop({
        name: addName.trim(),
        note: addNote.trim(),
        category: addCategory,
        visitMin: addVisit,
        parking: addParking,
        lat: addPin.lat,
        lng: addPin.lng,
      });
      setAddPin(null);
      if (route) {
        const enriched = enrichWithRoute(stop);
        setStops((prev) => [...prev, enriched].sort((a, b) => a.alongKm - b.alongKm));
        setSelectedId(stop.id);
        setNotice('👥 Thanks — your place is now visible to all travellers.');
      } else {
        setNotice('👥 Thanks — your place will appear on any route passing nearby.');
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  }

  async function handleReport(s: Stop) {
    await reportCommunityStop(s.id).catch(() => {});
    setNotice('🚩 Reported — thank you. Places with several reports are hidden for everyone.');
  }

  // Open the whole trip (origin → planned stops → destination) as one
  // multi-stop driving route in Google Maps. Google's consumer URL takes up
  // to ~9 waypoints; extra stops are dropped from navigation (still in the plan).
  function navigateTrip() {
    if (!route || plan.length === 0) return;
    const origin = route.coords[0];
    const dest = route.coords[route.coords.length - 1];
    const waypoints = plan.slice(0, 9).map((s) => `${s.lat},${s.lng}`);
    const url =
      `https://www.google.com/maps/dir/?api=1&travelmode=driving` +
      `&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}` +
      `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
    window.open(url, '_blank', 'noopener');
    if (plan.length > 9) {
      setNotice('Opened your first 9 stops in Google Maps — Google limits a shared route to 9 waypoints.');
    }
  }

  // Build a shareable link that carries the route endpoints and the planned
  // stops (compact) in the URL hash, so a friend can reopen the trip.
  function buildShareUrl(): string | null {
    if (!route || plan.length === 0) return null;
    const payload = {
      f: fromText,
      t: toText,
      p: plan.map((s) => ({
        n: s.name,
        a: Number(s.lat.toFixed(5)),
        o: Number(s.lng.toFixed(5)),
        c: s.category,
        k: s.kind,
        v: s.visitMin,
        d: s.description,
        pk: s.parking,
      })),
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    return `${location.origin}${location.pathname}#trip=${encoded}`;
  }

  async function shareTrip() {
    const url = buildShareUrl();
    if (!url) return;
    const shareData = { title: 'Pithop road trip', text: `My road trip: ${routeLabel}`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User cancelled the share sheet, or it failed — fall back to copy.
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('🔗 Trip link copied — paste it to share or open on another device.');
    } catch {
      // Clipboard blocked — show the raw link so it can be copied by hand.
      setNotice(`🔗 Share this link: ${url}`);
    }
  }

  // Overrides let callers (e.g. opening a shared link) pass endpoints directly
  // instead of relying on React state that hasn't flushed yet.
  async function findStops(overrideFrom?: string, overrideTo?: string) {
    const fText = overrideFrom ?? fromText;
    const tText = overrideTo ?? toText;
    const fPick = overrideFrom ? null : fromPick;
    const tPick = overrideTo ? null : toPick;
    const token = ++searchSeq.current;
    const fresh = () => searchSeq.current === token;
    activeLibraryIdRef.current = null; // a fresh search is a new, unsaved trip
    setBusy('Locating places…');
    setError(null);
    setNotice(null);
    setStops([]);
    setPlanIds(new Set());
    setSelectedId(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    const veh = vehicleRef.current;
    const offKmh = VEHICLE_MAP[veh].offRouteKmh;
    try {
      const [from, to] = await Promise.all([
        fPick ? Promise.resolve({ ...fPick, displayName: fText }) : geocode(fText),
        tPick ? Promise.resolve({ ...tPick, displayName: tText }) : geocode(tText),
      ]);
      if (!fresh()) return;
      setBusy('Calculating route…');
      const r = await fetchRoute(from, to, veh);
      if (!fresh()) return;
      setRoute(r);
      setRouteLabel(`${shortName(from.displayName)} → ${shortName(to.displayName)}`);
      setBusy('Finding stops along your route…');

      // Cap the number of sample discs so ultra-long routes stay affordable.
      const spacingKm = Math.max(12, r.distanceKm / 80);
      const samples = sampleAlong(r.coords, spacingKm);
      const calcRoute = simplify(r.coords, 1500);
      const cum = cumulativeKm(calcRoute);
      routeCalcRef.current = { calcRoute, cum };
      const enrich = (raw: Stop[]) =>
        raw
          // One malformed POI must never sink the whole result set.
          .filter((s) => s && s.name != null && Number.isFinite(s.lat) && Number.isFinite(s.lng))
          .map((s) => (typeof s.name === 'string' ? s : { ...s, name: String(s.name) }))
          .map((s) => {
            const proj = projectOntoRoute({ lat: s.lat, lng: s.lng }, calcRoute, cum);
            return {
              ...s,
              offRouteKm: proj.offRouteKm,
              alongKm: proj.alongKm,
              // Round-trip detour at the vehicle's off-route speed, plus a buffer.
              detourMin: Math.round((proj.offRouteKm * 2 * 60) / offKmh) + 2,
            };
          })
          .filter((s) => s.offRouteKm <= 12)
          .sort((a, b) => a.alongKm - b.alongKm);

      // Roadside data (food, fuel, rest areas) comes from Geoapify when a key
      // is configured, else the free Overpass servers. Either way it can be
      // slow — show Wikipedia landmarks as soon as they're ready and merge
      // the roadside stops in whenever they arrive.
      const roadsidePromise = hasGeoapify() ? fetchGeoapifyRoadside(samples) : fetchRoadsideStops(samples);
      // Traveller-shared places along the corridor — best-effort, silent on failure.
      const communityPromise = fetchCommunityStops(samples).catch(() => [] as Stop[]);
      let wikiStops: Stop[] = [];
      let wikiError = false;
      // Paint each round of Wikipedia results as it lands — the first stops
      // show within a couple of seconds instead of after the whole corridor.
      const paintPartial = (raw: Stop[]) => {
        if (!fresh()) return;
        const enriched = enrich(raw);
        if (!enriched.length) return;
        wikiStops = enriched;
        setStops(enriched);
        setBusy(null);
        setNotice('Found the first stops — still scanning the rest of your route…');
      };
      try {
        wikiStops = enrich(await fetchWikiStops(samples, paintPartial));
      } catch {
        wikiError = true;
      }
      if (!fresh()) return;
      if (wikiStops.length) {
        setStops(wikiStops);
        setBusy(null);
        setNotice('Adding food, viewpoint and rest-stop data…');
      }

      const [roadsideSettled, communityStops] = await Promise.all([
        Promise.allSettled([roadsidePromise]).then(([r]) => r),
        communityPromise,
      ]);
      if (!fresh()) return;
      const roadsideStops = roadsideSettled.status === 'fulfilled' ? enrich(roadsideSettled.value) : [];
      const roadsideError = roadsideSettled.status === 'rejected';
      if (wikiError && roadsideError) {
        throw new Error('Both place services are unavailable right now — try again in a couple of minutes');
      }
      setStops(mergeStops(mergeStops(wikiStops, roadsideStops), enrich(communityStops)));
      if (roadsideError) {
        setNotice('Live food & rest-stop data is busy right now — other sources are shown.');
      } else {
        setNotice(wikiError ? 'Wikipedia lookup failed — showing roadside stops only.' : null);
      }
    } catch (e) {
      if (!fresh()) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fresh()) setBusy(null);
    }
  }

  // Wipe the whole trip: search fields, results, plan, map and the saved
  // offline copy — back to the blank start screen.
  function clearTrip() {
    if (planIds.size > 0 && !window.confirm('Clear this trip? Your stop list will be lost.')) return;
    searchSeq.current++; // invalidates any in-flight search
    setRoute(null);
    setRouteLabel('');
    setStops([]);
    setPlanIds(new Set());
    setSelectedId(null);
    setError(null);
    setNotice(null);
    setBusy(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    setFromText('');
    setToText('');
    setFromPick(null);
    setToPick(null);
    routeCalcRef.current = null;
    activeLibraryIdRef.current = null;
    clearCurrentTrip();
  }

  function changeVehicle(v: Vehicle) {
    if (v === vehicle) return;
    vehicleRef.current = v;
    setVehicleState(v);
    setVehicle(v);
    // Re-route immediately if a trip is already on screen.
    if (route && !busy) void findStops();
  }

  function toggleCat(id: CategoryId) {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlan(id: string) {
    setPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(
    () =>
      stops.filter(
        (s) =>
          cats.has(s.category) &&
          s.detourMin <= maxDetour &&
          s.visitMin <= maxVisit &&
          (!aheadOnly || myAlongKm === null || (s.alongKm >= myAlongKm - 2 && s.alongKm <= myAlongKm + 80)),
      ),
    [stops, cats, maxDetour, maxVisit, aheadOnly, myAlongKm],
  );

  const catCounts = useMemo(() => {
    const counts: Partial<Record<CategoryId, number>> = {};
    for (const s of stops) {
      if (s.detourMin <= maxDetour && s.visitMin <= maxVisit) {
        counts[s.category] = (counts[s.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [stops, maxDetour, maxVisit]);

  const plan = useMemo(() => stops.filter((s) => planIds.has(s.id)), [stops, planIds]);
  const planExtraMin = plan.reduce((sum, s) => sum + s.visitMin + s.detourMin, 0);

  // When a Wikipedia stop is opened, pull in the article intro so the card
  // can say more than the one-line short description.
  useEffect(() => {
    if (!selectedId || !selectedId.startsWith('wiki/') || selectedId in wikiIntros) return;
    const pageid = Number(selectedId.slice('wiki/'.length));
    if (!Number.isFinite(pageid)) return;
    const id = selectedId;
    let cancelled = false;
    void fetchWikiExtract(pageid).then((text) => {
      if (!cancelled) setWikiIntros((prev) => ({ ...prev, [id]: text ?? '' }));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, wikiIntros]);

  function useMyLocation() {
    if (locating) return;
    setLocating(true);
    getPosition()
      .then(
        (pos) => {
          setError(null);
          setFromText('My location');
          setFromPick({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (e: Error) => setError(e.message),
      )
      .finally(() => setLocating(false));
  }

  function toggleAhead() {
    if (aheadOnly) {
      setAheadOnly(false);
      setMyAlongKm(null);
      return;
    }
    const calc = routeCalcRef.current;
    if (!calc) return;
    getPosition().then(
      (pos) => {
        setError(null);
        const proj = projectOntoRoute(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          calc.calcRoute,
          calc.cum,
        );
        setMyAlongKm(proj.alongKm);
        setAheadOnly(true);
      },
      (e: Error) => setError(e.message),
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="hero">
          <header className="brand">
            <div className="brand-top">
            <h1>
              <span className="brand-icon">🛣️</span> <span className="brand-name">Pithop</span>
            </h1>
            <div className="head-tools">
              <select
                className="lang-select"
                aria-label={t('language')}
                value={lang}
                onChange={(e) => {
                  const next = e.target.value as Lang;
                  setLang(next);
                  setLangState(next);
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div className="units-toggle" role="group" aria-label="Distance units">
                {(['km', 'mi'] as Units[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={units === u ? 'active' : ''}
                    aria-pressed={units === u}
                    onClick={() => {
                      setUnitsState(u);
                      setUnits(u);
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="theme-btn"
                title={`Theme: ${THEME_LABELS[themeMode].label} — click to change`}
                aria-label={`Theme: ${THEME_LABELS[themeMode].label} — click to change`}
                onClick={() => {
                  const next = THEME_CYCLE[themeMode];
                  setThemeModeState(next);
                  setThemeMode(next);
                }}
              >
                {THEME_LABELS[themeMode].icon}
              </button>
            </div>
            </div>
            <p>{t('tagline')}</p>
          </header>

          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              void findStops();
            }}
          >
            <div className="from-row">
              <PlaceInput
                value={fromText}
                placeholder={`${t('fromPh')} 📍`}
                onChange={(t) => {
                  setFromText(t);
                  setFromPick(null);
                }}
                onSelect={(p) => {
                  setFromText(p.label);
                  setFromPick({ lat: p.lat, lng: p.lng });
                }}
              />
              <button
                type="button"
                className={`geo-btn${locating ? ' locating' : ''}`}
                title="Use my location"
                aria-label="Use my current location as the starting point"
                disabled={locating}
                onClick={useMyLocation}
              >
                {locating ? '⏳' : '📍'}
              </button>
            </div>
            <PlaceInput
              value={toText}
              placeholder={t('toPh')}
              onChange={(t) => {
                setToText(t);
                setToPick(null);
              }}
              onSelect={(p) => {
                setToText(p.label);
                setToPick({ lat: p.lat, lng: p.lng });
              }}
            />
            <div className="vehicle-select" role="group" aria-label={t('vehicle')}>
              {VEHICLES.map((v) => {
                const locked = v.id !== 'car' && !hasGeoapify();
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`veh-btn${vehicle === v.id ? ' active' : ''}`}
                    aria-pressed={vehicle === v.id}
                    aria-label={t(('veh_' + v.id) as 'veh_car')}
                    title={locked ? t('vehNeedsKey') : t(('veh_' + v.id) as 'veh_car')}
                    disabled={locked}
                    onClick={() => changeVehicle(v.id)}
                  >
                    {v.icon}
                  </button>
                );
              })}
            </div>
            <button type="submit" className={`go-btn${busy ? ' busy' : ''}`} disabled={!!busy || !fromText.trim() || !toText.trim()}>
              {busy ?? t('find')}
            </button>
          </form>
        </div>

        {hasAuth() && user && (
          <div className="signed-bar">
            <span>
              ✓ {t('signedInAs')} <strong>{user.name}</strong>
            </span>
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              {t('signOut')}
            </button>
          </div>
        )}

        {error && <div className="error">⚠️ {error}</div>}
        {notice && !busy && <div className="notice">ℹ️ {notice}</div>}

        {addPin && (
          <div className="add-place">
            <h2>📍 {t('shareTitle')}</h2>
            <p className="add-coords">
              Pin at {addPin.lat.toFixed(4)}, {addPin.lng.toFixed(4)} — drag the map and tap "Add a place" again to
              move it.
            </p>
            {hasAuth() && !user ? (
              <>
                <AuthPanel />
                <button type="button" className="add-cancel auth-cancel" onClick={() => setAddPin(null)}>
                  {t('cancel')}
                </button>
              </>
            ) : (
              <>
                {user && (
                  <p className="add-signed">
                    {t('signedInAs')} <strong>{user.name}</strong> ·{' '}
                    <button type="button" className="link-btn" onClick={() => void signOut()}>
                      {t('signOut')}
                    </button>
                  </p>
                )}
                <input
                  className="add-name"
                  value={addName}
                  maxLength={60}
                  placeholder={t('namePh')}
                  onChange={(e) => setAddName(e.target.value)}
                />
            <div className="add-row">
              <select value={addCategory} onChange={(e) => setAddCategory(e.target.value as CategoryId)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
              <select value={addVisit} onChange={(e) => setAddVisit(Number(e.target.value))}>
                <option value={15}>~15 min stop</option>
                <option value={30}>~30 min stop</option>
                <option value={60}>~1 hour stop</option>
                <option value={120}>~2 hour stop</option>
              </select>
            </div>
            <select
              className="add-parking"
              value={addParking}
              onChange={(e) => setAddParking(e.target.value as typeof addParking)}
            >
              <option value="">🅿️ {t('parkingQ')}</option>
              <option value="free">🅿️ {t('parkFree')}</option>
              <option value="paid">🅿️ {t('parkPaid')}</option>
              <option value="none">🅿️ {t('parkNone')}</option>
            </select>
            <textarea
              value={addNote}
              maxLength={200}
              placeholder={t('notePh')}
              onChange={(e) => setAddNote(e.target.value)}
            />
                {addError && <div className="add-error">⚠️ {addError}</div>}
                <div className="add-actions">
                  <button
                    type="button"
                    className="add-share"
                    disabled={!addName.trim() || addBusy}
                    onClick={() => void shareAddPlace()}
                  >
                    {addBusy ? t('sharing') : t('shareBtn')}
                  </button>
                  <button type="button" className="add-cancel" onClick={() => setAddPin(null)}>
                    Cancel
                  </button>
                </div>
                <p className="add-fine">
                  Shared publicly with every user of this app
                  {hasAuth() ? ', credited to your name' : ' — no account needed'}.
                </p>
              </>
            )}
          </div>
        )}

        {route && !busy && (
          <div className="summary">
            <div className="summary-actions">
              <button type="button" className="summary-save" title="Save this trip with all its stops" onClick={handleSaveTrip}>
                💾 {t('save')}
              </button>
              <button type="button" className="summary-clear" title="Clear this trip" onClick={clearTrip}>
                ✕ {t('clear')}
              </button>
            </div>
            <div className="summary-route">{routeLabel}</div>
            <div className="summary-stats">
              {fmtDist(route.distanceKm, units)} · {fmtDur(route.durationMin)} {t('drive')} ·{' '}
              {t('stopsFound', { n: stops.length })}
            </div>
            {(() => {
              const dest = routeLabel.split('→')[1]?.trim();
              const hotels = dest ? hotelsLink(dest) : null;
              return hotels ? (
                <a className="summary-hotels" href={hotels} target="_blank" rel="sponsored noreferrer">
                  🏨 Hotels in {dest} ↗
                </a>
              ) : null;
            })()}
            {plan.length > 0 && (
              <div className="summary-plan">
                With your {plan.length} stop{plan.length > 1 ? 's' : ''}: ≈{' '}
                {fmtDur(route.durationMin + planExtraMin)} total (+{fmtDur(planExtraMin)})
              </div>
            )}
            {stops.length > 0 && (
              <label className="ahead">
                <input type="checkbox" checked={aheadOnly} onChange={toggleAhead} />
                {t('aheadLabel')} ({units === 'mi' ? '50 mi' : '80 km'})
                {aheadOnly && myAlongKm !== null && (
                  <span className="ahead-pos"> — you're at {fmtDist(myAlongKm, units)}</span>
                )}
              </label>
            )}
          </div>
        )}

        {stops.length > 0 && (
          <>
            <div className="filters">
              <div className="chips">
                {CATEGORIES.map((c) => {
                  const active = cats.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip${active ? ' active' : ''}`}
                      style={active ? { background: c.color, borderColor: c.color } : undefined}
                      aria-pressed={active}
                      aria-label={`${catLabel(c.id)} filter, ${catCounts[c.id] ?? 0} stops`}
                      onClick={() => toggleCat(c.id)}
                    >
                      {c.emoji} {catLabel(c.id)}
                      <span className="chip-count">{catCounts[c.id] ?? 0}</span>
                    </button>
                  );
                })}
              </div>
              <div className="selects">
                <label>
                  {t('maxDetour')}
                  <select value={maxDetour} onChange={(e) => setMaxDetour(Number(e.target.value))}>
                    {DETOUR_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        ≤ {d} min
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('timeToSpend')}
                  <select value={maxVisit} onChange={(e) => setMaxVisit(Number(e.target.value))}>
                    {VISIT_OPTIONS.map((v) => (
                      <option key={v.max} value={v.max}>
                        {t(v.key)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {plan.length > 0 && (
              <div className="plan">
                <h2>{t('yourStops', { n: plan.length })}</h2>
                {plan.map((s) => (
                  <div key={s.id} className="plan-item">
                    <button type="button" className="plan-name" onClick={() => setSelectedId(s.id)}>
                      {CATEGORY_MAP[s.category].emoji} {s.name}
                    </button>
                    <span className="plan-time">{fmtDur(s.visitMin)}</span>
                    <button
                      type="button"
                      className="plan-remove"
                      aria-label={`Remove ${s.name} from your trip`}
                      onClick={() => togglePlan(s.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="plan-cta">
                  <button type="button" className="plan-nav" onClick={navigateTrip}>
                    🧭 {t('startTrip')}
                  </button>
                  <button type="button" className="plan-share" onClick={() => void shareTrip()}>
                    🔗 {t('share')}
                  </button>
                </div>
              </div>
            )}

            <div className="stop-list">
              <div className="list-header">
                {filtered.length} match{filtered.length === 1 ? '' : 'es'}
                {filtered.length > LIST_CAP ? ` · showing first ${LIST_CAP}` : ''}
              </div>
              {filtered.slice(0, LIST_CAP).map((s) => {
                const c = CATEGORY_MAP[s.category];
                const added = planIds.has(s.id);
                const selected = selectedId === s.id;
                const intro = wikiIntros[s.id];
                return (
                  <div
                    key={s.id}
                    className={`stop-card${selected ? ' selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={selected}
                    aria-label={`${s.name}, ${c.label}`}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(s.id);
                      }
                    }}
                  >
                    <div className="stop-icon" style={{ background: c.color + '26' }}>
                      {c.emoji}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">{s.name}</div>
                      <div className="stop-meta">
                        {s.source === 'community' ? `👥 ${t('travellerTip')} · ` : ''}
                        {catLabel(s.category)} · ⏱ {fmtDur(s.visitMin)} · 🚗 {s.detourMin} min · at{' '}
                        {distValue(s.alongKm, units)} {units}
                      </div>
                      {s.description && <div className="stop-desc">{s.description}</div>}
                      {selected && (
                        <div className="stop-details">
                          {s.imageUrl && <img className="stop-photo" src={s.imageUrl} alt={s.name} loading="lazy" />}
                          {intro && intro !== s.description && <p className="stop-intro">{intro}</p>}
                          <p className="stop-todo">💡 {thingsToDo(s.kind)}</p>
                          {s.parking && (
                            <p className={`stop-parking ${s.parking}`}>🅿️ {t(PARKING_KEY[s.parking])}</p>
                          )}
                          {s.source === 'community' && s.by && (
                            <p className="stop-by">👤 {t('addedBy', { name: s.by })}</p>
                          )}
                          <div className="stop-links" onClick={(e) => e.stopPropagation()}>
                            {ticketsLink(s.name, s.kind) && (
                              <a className="aff" href={ticketsLink(s.name, s.kind)!} target="_blank" rel="sponsored noreferrer">
                                🎟️ {t('bookTickets')} ↗
                              </a>
                            )}
                            {s.category === 'rest' && gasCashbackLink() && (
                              <a className="aff" href={gasCashbackLink()!} target="_blank" rel="sponsored noreferrer">
                                ⛽ {t('gasCashback')} ↗
                              </a>
                            )}
                            {s.wikiUrl && (
                              <a href={s.wikiUrl} target="_blank" rel="noreferrer">
                                Wikipedia ↗
                              </a>
                            )}
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${s.lat}%2C${s.lng}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Google Maps ↗
                            </a>
                            {s.source === 'community' && (
                              <button type="button" className="report-btn" onClick={() => void handleReport(s)}>
                                🚩 {t('report')}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`add-btn${added ? ' added' : ''}`}
                      title={added ? t('removeFromTrip') : t('addToTrip')}
                      aria-label={added ? `${t('removeFromTrip')}: ${s.name}` : `${t('addToTrip')}: ${s.name}`}
                      aria-pressed={added}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlan(s.id);
                      }}
                    >
                      {added ? '✓' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!route && !busy && savedTrips.length > 0 && (
          <div className="trips">
            <h2>💾 {t('savedTrips')}</h2>
            {savedTrips.map((t) => (
              <div key={t.id} className="trip-item">
                <button type="button" className="trip-load" onClick={() => handleLoadTrip(t)}>
                  <span className="trip-name">{t.routeLabel}</span>
                  <span className="trip-meta">
                    {t.stops.length} stops · {t.planIds.length} in plan · updated{' '}
                    {new Date(t.savedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="trip-del"
                  title="Delete saved trip"
                  onClick={() => handleDeleteTrip(t)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!route && !busy && !error && (
          <div className="hint">
            <p>{t('hintBody')}</p>
            <p className="hint-example">
              {t('tryLabel')}{' '}
              <button
                type="button"
                onClick={() => {
                  setFromText('Austin, TX');
                  setToText('Dallas, TX');
                }}
              >
                Austin → Dallas
              </button>
            </p>
          </div>
        )}
        <footer className="foot">
          {anyAffiliate() && (
            <p className="foot-disclosure">
              Links marked 🎟️/🏨/⛽ are affiliate links — they support the app at no extra cost to you.
            </p>
          )}
          <a href="/privacy.html" target="_blank" rel="noreferrer">
            Privacy & data sources
          </a>
        </footer>
      </aside>

      <MapView
        route={route}
        stops={filtered}
        planIds={planIds}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onTogglePlan={togglePlan}
        communityOn={communityOn}
        addArmed={addArmed}
        onToggleAdd={() => {
          setAddArmed((a) => !a);
          setAddPin(null);
        }}
        onPickPoint={pickAddPoint}
        pinPreview={addPin}
        lang={lang}
      />
    </div>
  );
}
