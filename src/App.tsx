import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { geocode } from './api/geocode';
import { fetchRoutes, type RouteResult } from './api/route';
import { fetchRoadsideStops } from './api/overpass';
import { fetchWikiExtract, fetchWikiStops } from './api/wikipedia';
import { fetchGeoapifyLodging, fetchGeoapifyRoadside, hasGeoapify } from './api/geoapify';
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
import { ItineraryView } from './components/Itinerary';
import { buildItinerary, defaultDeparture } from './lib/itinerary';
import { catLabel, getLang, LANGUAGES, setLang, t, type Lang } from './lib/i18n';
import { getVehicle, setVehicle, VEHICLES, VEHICLE_MAP, type Vehicle } from './lib/vehicle';
import {
  bingoLineCount,
  buildBingoCard,
  rouletteSpin,
  surprisePlan,
  type BingoSquare,
} from './lib/planner';
import {
  DEFAULT_PREFS,
  PERSONALITIES,
  isHiddenGem,
  pithopScore,
  type PersonalityId,
  type ScoredStop,
  type TripPrefs,
} from './lib/score';
import { hoursStatus, prettyHours } from './lib/hours';
import {
  clearCurrentTrip,
  deleteSavedTrip,
  listSavedTrips,
  loadCurrentTrip,
  saveCurrentTrip,
  mergeRemoteTrips,
  saveTripToLibrary,
  setRemoteId,
  updateSavedTrip,
  type StoredTrip,
  type TripData,
} from './lib/tripStore';
import { deleteRemoteTrip, listRemoteTrips, upsertRemoteTrip } from './lib/tripsDb';

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
// endpoints and any intermediate stops (as text) plus the planned stops, or
// null if there's no valid share. `w` (waypoints) is absent in older links.
function parseShareHash(): { fromText: string; toText: string; viaTexts: string[]; plan: Stop[] } | null {
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
    const viaTexts: string[] = Array.isArray(data.w)
      ? data.w.map((v: unknown) => String(v ?? '').slice(0, 200)).filter((v: string) => v.trim()).slice(0, MAX_VIAS)
      : [];
    return { fromText: String(data.f), toText: String(data.t), viaTexts, plan };
  } catch {
    return null;
  }
}
import { cumulativeKm, haversineKm, projectOntoRoute, sampleAlong, simplify, type LatLng } from './lib/geo';
import { distValue, fmtDist, fmtDur, type Units } from './lib/format';
import { getUnits, setUnits } from './lib/units';
import { MapView, type LivePos } from './MapView';
import { PlaceInput } from './components/PlaceInput';

const DETOUR_OPTIONS = [5, 10, 15, 25, 40, 60];
const VISIT_OPTIONS: Array<{ key: 'visitQuick' | 'visitShort' | 'visit1h' | 'visit2h' | 'visitAny'; max: number }> = [
  { key: 'visitQuick', max: 15 },
  { key: 'visitShort', max: 30 },
  { key: 'visit1h', max: 60 },
  { key: 'visit2h', max: 120 },
  { key: 'visitAny', max: 9999 },
];
const LIST_CAP = 400;
// How far off the road a place can sit and still count as "along the way".
// Every source is queried out to roughly this far, so this is the width of the
// corridor the traveller can actually explore via the max-detour filter.
const CORRIDOR_KM = 15;
// Default max round-trip detour. At a car's 40 km/h off-route estimate this
// reaches ~7.5 km either side — generous enough that a first search shows the
// interesting finds a few minutes off the highway, not just the roadside ones.
const DEFAULT_MAX_DETOUR = 25;

// How many intermediate stops a route may carry. Both routers handle far more,
// but each one adds a leg to geocode and draw, and the search form has to stay
// usable on a phone.
const MAX_VIAS = 8;

// One intermediate waypoint in the search form. `pick` holds exact coordinates
// when the traveller chose an autocomplete suggestion; free-typed text is
// geocoded at search time instead.
interface Via {
  key: string;
  text: string;
  pick: LatLng | null;
}

let viaSeq = 0;
function newVia(text = ''): Via {
  return { key: `via-${++viaSeq}`, text, pick: null };
}

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
// Run a state change inside a View Transition when the browser supports one, so
// the jump from the search form to the results view crossfades instead of
// snapping. Falls back to applying the change directly everywhere else, and
// opts out under reduced motion.
function withViewTransition(apply: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (
    typeof doc.startViewTransition !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    apply();
    return;
  }
  doc.startViewTransition(apply);
}

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
  // The sidebar is the scroll container for the results list; listRef marks
  // where the list starts inside it (see the virtualiser below).
  const sidebarRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Intermediate stops the traveller wants the route to pass through, in order.
  const [vias, setVias] = useState<Via[]>([]);
  // Resolved coordinates of the vias on the active route — kept separately from
  // the form so the map and the Google Maps handoff use what was actually
  // routed, not text the traveller may have edited since.
  const [routeVias, setRouteVias] = useState<LatLng[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLabel, setRouteLabel] = useState('');
  // Alternative routes from the last search, and which one is active.
  const [routeAlts, setRouteAlts] = useState<RouteResult[]>([]);
  const [routeIdx, setRouteIdx] = useState(0);
  // Avoid options (Geoapify only — the free server's profile is fixed).
  const [avoidTolls, setAvoidTolls] = useState(() => {
    try {
      return localStorage.getItem('sq-avoid-tolls') === 'on';
    } catch {
      return false;
    }
  });
  const [avoidHighways, setAvoidHighways] = useState(() => {
    try {
      return localStorage.getItem('sq-avoid-highways') === 'on';
    } catch {
      return false;
    }
  });
  const avoidRef = useRef({ tolls: avoidTolls, highways: avoidHighways });
  const [stops, setStops] = useState<Stop[]>([]);
  const [cats, setCats] = useState<Set<CategoryId>>(new Set(CATEGORIES.map((c) => c.id)));
  const [maxDetour, setMaxDetour] = useState(DEFAULT_MAX_DETOUR);
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
  // Live drive mode: follow the trip on the map (GPS position, distance/ETA to
  // the next stop and destination, arrival alerts) without leaving for Maps.
  const [liveOn, setLiveOn] = useState(false);
  const [livePos, setLivePos] = useState<LivePos | null>(null);
  const [liveFollow, setLiveFollow] = useState(true);
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem('sq-live-voice') !== 'off';
    } catch {
      return true;
    }
  });
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  // Surprise-me spare-time budget (minutes) and the active trip vibe.
  const [spareMin, setSpareMin] = useState<number | null>(null);
  // Trip personalities are multi-select: they narrow the category filter AND
  // weight the Pithop Score, so two travellers on the same road see different
  // stops at the top.
  const [personalities, setPersonalities] = useState<Set<PersonalityId>>(new Set());
  const [gemsOnly, setGemsOnly] = useState(false);
  // Day-by-day view. Departure defaults to tomorrow morning rather than "now",
  // because a trip being planned is almost never one starting this minute.
  const [showItinerary, setShowItinerary] = useState(false);
  const [departAt, setDepartAt] = useState<Date>(() => defaultDeparture());
  const [maxDriveMin, setMaxDriveMin] = useState(360);
  const [maxDays, setMaxDays] = useState<number | null>(null);
  const [dayBreaks, setDayBreaks] = useState<Set<string>>(new Set());
  // How long the traveller wants at a stop, overriding the estimate the data
  // came with. Keyed by stop id so it survives re-discovery of the same place.
  const [visitOverride, setVisitOverride] = useState<Record<string, number>>({});
  const [lodging, setLodging] = useState<Map<number, Stop[]>>(new Map());
  // Detour Roulette: the stop on the wheel, spin animation, chicken counter.
  const [rouletteStop, setRouletteStop] = useState<Stop | null>(null);
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [respins, setRespins] = useState(0);
  // Road Trip Bingo.
  const [bingoOn, setBingoOn] = useState(false);
  const [bingoSquares, setBingoSquares] = useState<BingoSquare[]>([]);
  const [bingoMarked, setBingoMarked] = useState<boolean[]>([]);
  const [bingoWin, setBingoWin] = useState(false);
  // Landmarks already narrated this drive, and when we last spoke one.
  const factsSpokenRef = useRef<Set<string>>(new Set());
  const lastFactAtRef = useRef(0);
  // Planned stops we've already announced arrival for this drive (don't repeat).
  const announcedRef = useRef<Set<string>>(new Set());
  // Turn instructions already spoken this drive, keyed by their along-route km
  // (far = the "in one mile…" heads-up, near = the turn itself).
  const spokenFarRef = useRef<Set<number>>(new Set());
  const spokenNearRef = useRef<Set<number>>(new Set());
  const arrivedRef = useRef(false);
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
    setVias((t.viaTexts ?? []).map((v) => newVia(v)));
    setRouteVias(t.routeVias ?? []);
    setRoute(t.route);
    setRouteAlts([t.route]); // saved trips carry one route — no alternatives UI
    setRouteIdx(0);
    setRouteLabel(t.routeLabel);
    setStops(t.stops);
    setPlanIds(new Set(t.planIds));
    setSelectedId(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    // Restore the schedule the traveller built, or fall back to defaults for a
    // trip saved before the itinerary existed.
    const it = t.itinerary;
    setDepartAt(it ? new Date(it.departAt) : defaultDeparture());
    setMaxDriveMin(it?.maxDriveMin ?? 360);
    setMaxDays(it?.maxDays ?? null);
    setDayBreaks(new Set(it?.dayBreaks ?? []));
    setVisitOverride(it?.visitOverride ?? {});
  }

  // Route geometry is simplified before writing to stay inside storage quotas.
  const buildTripData = (): TripData | null =>
    route && stops.length
      ? {
          fromText,
          toText,
          viaTexts: vias.map((v) => v.text).filter((v) => v.trim()),
          routeVias,
          routeLabel,
          route: { ...route, coords: simplify(route.coords, 1500) },
          stops,
          planIds: [...planIds],
          itinerary: {
            departAt: departAt.getTime(),
            maxDriveMin,
            maxDays,
            dayBreaks: [...dayBreaks],
            visitOverride,
          },
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

  // Once somebody is signed in, fold their server-side trips into the local
  // library. localStorage stays what the app reads from; this only widens it,
  // so a signed-out session and an offline one behave exactly as before.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void listRemoteTrips()
      .then((remote) => {
        if (cancelled || remote.length === 0) return;
        setSavedTrips(mergeRemoteTrips(remote));
      })
      .catch(() => {
        // Offline or the table isn't created yet — local trips still work.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      setVias(shared.viaTexts.map((v) => newVia(v)));
      setNotice('Opening a shared trip — finding stops along the route…');
      void findStops(shared.fromText, shared.toText, shared.viaTexts);
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
    const entry = list.find((s) => s.routeLabel === t.routeLabel);
    if (!err) activeLibraryIdRef.current = entry?.id ?? null;
    setNotice(err ?? '💾 Trip saved — it keeps updating as you edit, and you can reopen it from the start screen.');
    // Mirror it to the account, when there is one. Failure is not surfaced:
    // the trip is already saved locally, which is what the traveller asked for.
    if (!err && entry) {
      void upsertRemoteTrip(t, entry.remoteId)
        .then((remoteId) => {
          if (remoteId) setRemoteId(entry.id, remoteId);
        })
        .catch(() => {});
    }
  }

  function handleLoadTrip(t: StoredTrip) {
    searchSeq.current++; // invalidates any in-flight search
    activeLibraryIdRef.current = t.id;
    // Start screen → full trip is a whole-view swap, so it crossfades.
    withViewTransition(() => {
      setBusy(null);
      setError(null);
      setNotice(null);
      applyTrip(t);
    });
  }

  function handleDeleteTrip(t: StoredTrip) {
    if (!window.confirm(`Delete saved trip "${t.routeLabel}"?`)) return;
    if (activeLibraryIdRef.current === t.id) activeLibraryIdRef.current = null;
    setSavedTrips(deleteSavedTrip(t.id));
    // Otherwise the next sign-in on this device would pull it straight back.
    if (t.remoteId) void deleteRemoteTrip(t.remoteId).catch(() => {});
  }

  // How far along the active route a coordinate sits, for ordering things by
  // road position. 0 when there's no route to measure against.
  function alongKmOf(p: LatLng): number {
    const calc = routeCalcRef.current;
    return calc ? projectOntoRoute(p, calc.calcRoute, calc.cum).alongKm : 0;
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
    try {
      await reportCommunityStop(s.id);
      setNotice('🚩 Reported — thank you. Places with several reports are hidden for everyone.');
    } catch (e) {
      // e.g. "Please sign in to report a place" — don't fake a success.
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Open the whole trip (origin → planned stops → destination) as one
  // multi-stop driving route in Google Maps. Google's consumer URL takes up
  // to ~9 waypoints; extra stops are dropped from navigation (still in the plan).
  function navigateTrip() {
    if (!route || (plan.length === 0 && routeVias.length === 0)) return;
    const origin = route.coords[0];
    const dest = route.coords[route.coords.length - 1];
    // The traveller's own intermediate stops define the route, so they go in
    // alongside the planned stops, interleaved in road order — otherwise Google
    // would re-route around them and the drive wouldn't match what's on screen.
    const all = [
      ...routeVias.map((v) => ({ lat: v.lat, lng: v.lng, alongKm: alongKmOf(v) })),
      ...plan.map((s) => ({ lat: s.lat, lng: s.lng, alongKm: s.alongKm })),
    ].sort((a, b) => a.alongKm - b.alongKm);
    const waypoints = all.slice(0, 9).map((s) => `${s.lat},${s.lng}`);
    const url =
      `https://www.google.com/maps/dir/?api=1&travelmode=driving` +
      `&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}` +
      `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
    window.open(url, '_blank', 'noopener');
    if (all.length > 9) {
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
      w: vias.map((v) => v.text).filter((v) => v.trim()),
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
  async function findStops(overrideFrom?: string, overrideTo?: string, overrideVias?: string[]) {
    const fText = overrideFrom ?? fromText;
    const tText = overrideTo ?? toText;
    const fPick = overrideFrom ? null : fromPick;
    const tPick = overrideTo ? null : toPick;
    // Overridden vias arrive as plain text (from a share link) and need
    // geocoding; the form's own vias may already carry exact coordinates.
    const viaList: Array<{ text: string; pick: LatLng | null }> = overrideVias
      ? overrideVias.map((text) => ({ text, pick: null }))
      : vias.map((v) => ({ text: v.text, pick: v.pick }));
    const activeVias = viaList.filter((v) => v.text.trim());
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
      const [from, to, ...viaPlaces] = await Promise.all([
        fPick ? Promise.resolve({ ...fPick, displayName: fText }) : geocode(fText),
        tPick ? Promise.resolve({ ...tPick, displayName: tText }) : geocode(tText),
        ...activeVias.map((v) =>
          v.pick ? Promise.resolve({ ...v.pick, displayName: v.text }) : geocode(v.text),
        ),
      ]);
      if (!fresh()) return;
      setBusy(activeVias.length ? 'Calculating route through your stops…' : 'Calculating route…');
      const points = [from, ...viaPlaces, to].map((p) => ({ lat: p.lat, lng: p.lng }));
      const routes = await fetchRoutes(points, veh, {
        avoidTolls: avoidRef.current.tolls,
        avoidHighways: avoidRef.current.highways,
      });
      const r = routes[0];
      if (!fresh()) return;
      setRouteAlts(routes);
      setRouteIdx(0);
      setRoute(r);
      setRouteVias(points.slice(1, -1));
      setRouteLabel([from, ...viaPlaces, to].map((p) => shortName(p.displayName)).join(' → '));
      if (r.avoidFailed) {
        setNotice(`⚠️ ${t('avoidFailed')}`);
      }
      await discoverStops(r, token);
    } catch (e) {
      if (!fresh()) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fresh()) setBusy(null);
    }
  }

  // Find stops along one specific route geometry. Shared by a fresh search and
  // by switching between route alternatives (which re-scans the new corridor).
  async function discoverStops(r: RouteResult, token: number) {
    const fresh = () => searchSeq.current === token;
    const offKmh = VEHICLE_MAP[vehicleRef.current].offRouteKmh;
    {
      setBusy('Finding stops along your route…');

      // Space the sample discs along the route. Short trips get a much tighter
      // spacing so dense urban corridors (where each source's per-disc result
      // cap bites) are covered more fully; the spacing eases back to 12 km by
      // ~160 km, so medium and long trips — and their API cost — are unchanged.
      // The distance/80 term still caps ultra-long routes at ~80 discs.
      const spacingKm = Math.max(r.distanceKm / 80, Math.min(12, 1.5 + r.distanceKm / 15));
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
          .filter((s) => s.offRouteKm <= CORRIDOR_KM)
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
    }
  }

  // Switch to another route alternative: same endpoints, new corridor — the
  // stop list (and any plan) belongs to the old road, so it's rebuilt.
  async function switchRoute(i: number) {
    const r = routeAlts[i];
    if (!r || i === routeIdx || busy) return;
    const token = ++searchSeq.current;
    const fresh = () => searchSeq.current === token;
    setRouteIdx(i);
    setRoute(r);
    setStops([]);
    setPlanIds(new Set());
    setSelectedId(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    setError(null);
    setNotice(null);
    try {
      await discoverStops(r, token);
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
    withViewTransition(() => resetTrip());
  }

  function resetTrip() {
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
    setVias([]);
    setRouteVias([]);
    setShowItinerary(false);
    setDayBreaks(new Set());
    setVisitOverride({});
    setDepartAt(defaultDeparture());
    endLive();
    setRouletteStop(null);
    setRespins(0);
    setBingoOn(false);
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

  // Avoid tolls / highways (Geoapify only). Persisted; flips re-route live.
  function toggleAvoid(kind: 'tolls' | 'highways') {
    const next = { ...avoidRef.current, [kind]: !avoidRef.current[kind] };
    avoidRef.current = next;
    if (kind === 'tolls') setAvoidTolls(next.tolls);
    else setAvoidHighways(next.highways);
    try {
      localStorage.setItem(`sq-avoid-${kind}`, next[kind] ? 'on' : 'off');
    } catch {
      // storage blocked — won't persist
    }
    if (route && !busy) void findStops();
  }

  // --- Intermediate stops (route waypoints) -------------------------------
  // Edits only touch the form; nothing re-routes until the traveller searches
  // again, so a half-typed stop never wipes the trip already on screen.
  function addVia() {
    setVias((prev) => (prev.length >= MAX_VIAS ? prev : [...prev, newVia()]));
  }

  function removeVia(key: string) {
    setVias((prev) => prev.filter((v) => v.key !== key));
  }

  function updateVia(key: string, patch: Partial<Omit<Via, 'key'>>) {
    setVias((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  // Order is what the router follows, so travellers need to fix a stop entered
  // out of sequence without retyping it.
  function moveVia(key: string, dir: -1 | 1) {
    setVias((prev) => {
      const i = prev.findIndex((v) => v.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function toggleCat(id: CategoryId) {
    // Hand-editing the category chips means the traveller is steering directly,
    // so any personality preset stops claiming to describe the filter.
    setPersonalities(new Set());
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

  // The traveller's preferences, in the shape the scorer wants. Kept as one
  // memo so every consumer (list, Don't Miss, Surprise Me) scores identically.
  const prefs = useMemo<TripPrefs>(
    () => ({ ...DEFAULT_PREFS, personalities: [...personalities], maxDetourMin: maxDetour }),
    [personalities, maxDetour],
  );

  // Average speed of the chosen route, used to project an arrival clock time
  // for each stop so opening hours are judged at arrival rather than "now".
  const avgKmh = route && route.durationMin > 0 ? route.distanceKm / (route.durationMin / 60) : 70;
  const etaOf = useCallback(
    (alongKm: number) => new Date(Date.now() + (alongKm / avgKmh) * 3600_000),
    [avgKmh],
  );

  // Pithop Score for every stop. Deterministic, so this is pure derived state.
  const scoreById = useMemo(() => {
    const out = new Map<string, ScoredStop>();
    for (const s of stops) out.set(s.id, pithopScore(s, prefs, { eta: etaOf(s.alongKm) }));
    return out;
  }, [stops, prefs, etaOf]);

  const filtered = useMemo(
    () =>
      stops
        .filter(
          (s) =>
            cats.has(s.category) &&
            s.detourMin <= maxDetour &&
            s.visitMin <= maxVisit &&
            (!gemsOnly || isHiddenGem(s)) &&
            (!aheadOnly || myAlongKm === null || (s.alongKm >= myAlongKm - 2 && s.alongKm <= myAlongKm + 80)),
        )
        // Best match first. Ties keep road order, so a run of equally good stops
        // still reads as a journey rather than an arbitrary shuffle.
        .sort((a, b) => {
          const d = (scoreById.get(b.id)?.score ?? 0) - (scoreById.get(a.id)?.score ?? 0);
          return d !== 0 ? d : a.alongKm - b.alongKm;
        }),
    [stops, cats, maxDetour, maxVisit, gemsOnly, aheadOnly, myAlongKm, scoreById],
  );

  // "Don't Miss These": the strongest handful, spread along the route so they
  // are not all clustered in the same town.
  // Renders the Pithop Score line: the number, the Worth It / Maybe / Skip
  // verdict with the true cost of the stop, and up to three plain-English
  // reasons. Shared by the results list and the Don't Miss cards so the two can
  // never disagree about a stop.
  function ScoreRow({ id }: { id: string }) {
    const sc = scoreById.get(id);
    if (!sc) return null;
    return (
      <div className="score-row">
        <span className={`score-badge s${Math.floor(sc.score / 20)}`} title={t('scoreLabel')}>
          {t('scoreLabel')} {sc.score}
        </span>
        <span className={`verdict ${sc.verdict}`}>{t(`verdict_${sc.verdict}` as 'verdict_worth')}</span>
        <span className="score-extra">{t('totalExtra', { n: fmtDur(sc.totalExtraMin) })}</span>
      </div>
    );
  }

  function ScoreReasons({ id }: { id: string }) {
    const sc = scoreById.get(id);
    if (!sc?.reasons.length) return null;
    return (
      <ul className="score-why">
        {sc.reasons.map((r) => (
          <li key={r.code}>{t(`r_${r.code}` as 'r_hasPhoto', { n: r.value ?? 0 })}</li>
        ))}
      </ul>
    );
  }

  const dontMiss = useMemo(() => {
    const out: Stop[] = [];
    for (const s of filtered) {
      if (out.length >= 5) break;
      if ((scoreById.get(s.id)?.score ?? 0) < 60) continue;
      if (out.some((o) => Math.abs(o.alongKm - s.alongKm) < 15)) continue;
      out.push(s);
    }
    return out;
  }, [filtered, scoreById]);

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

  // The plan as the scheduler wants it: road order, with any visit-length the
  // traveller has chosen applied over the data's own estimate.
  const planForSchedule = useMemo(
    () =>
      plan
        .map((s) => (visitOverride[s.id] != null ? { ...s, visitMin: visitOverride[s.id] } : s))
        .sort((a, b) => a.alongKm - b.alongKm),
    [plan, visitOverride],
  );

  const itinerary = useMemo(() => {
    if (!route) return null;
    return buildItinerary(planForSchedule, {
      departAt,
      dailyDepartMin: departAt.getHours() * 60 + departAt.getMinutes(),
      maxDriveMinPerDay: maxDriveMin,
      totalDistanceKm: route.distanceKm,
      totalDurationMin: route.durationMin,
      dayBreaksAfter: dayBreaks,
      maxDays: maxDays ?? undefined,
    });
  }, [route, planForSchedule, departAt, maxDriveMin, dayBreaks, maxDays]);

  // Somewhere to sleep at each overnight point. Only fetched for days that
  // actually end away from home, and only with a commercial key — the free
  // stack has no lodging source, and inventing hotels would strand someone.
  useEffect(() => {
    if (!itinerary || !hasGeoapify()) return;
    const overnights = itinerary.days.filter((d) => !d.isFinal);
    if (overnights.length === 0) {
      setLodging(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(
      overnights.map(async (d) => {
        const last = d.stops[d.stops.length - 1]?.stop;
        if (!last) return [d.index, [] as Stop[]] as const;
        try {
          return [d.index, await fetchGeoapifyLodging({ lat: last.lat, lng: last.lng })] as const;
        } catch {
          return [d.index, [] as Stop[]] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setLodging(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
    // Only the overnight anchors matter, not every re-render of the schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary?.days.map((d) => (d.isFinal ? '' : d.stops[d.stops.length - 1]?.stop.id)).join('|')]);

  function toggleDayBreak(id: string) {
    setDayBreaks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }


  // --- Virtualised results list ---------------------------------------------
  // The list can run to LIST_CAP cards; rendering them all is what made
  // scrolling stutter on mid-range phones. Only the rows near the viewport are
  // mounted. The scroll container is the whole sidebar (search form, summary
  // and filters scroll with the list), so the virtualiser is told where the
  // list starts within it via scrollMargin, and measures each row because card
  // heights vary with description, badges and the expanded detail panel.
  const visible = useMemo(() => filtered.slice(0, LIST_CAP), [filtered]);
  const [listTop, setListTop] = useState(0);

  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => sidebarRef.current,
    estimateSize: () => 96,
    scrollMargin: listTop,
    overscan: 8,
    getItemKey: (i) => visible[i]?.id ?? i,
  });

  // Where the list begins inside the sidebar's scrollable content. Re-measured
  // when anything above it changes height (route summary, filters, plan panel).
  useEffect(() => {
    const el = listRef.current;
    const scroller = sidebarRef.current;
    if (!el || !scroller) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setListTop((prev) => (Math.abs(prev - top) > 1 ? top : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    for (const child of Array.from(scroller.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [route, stops.length, plan.length, routeAlts.length, spareMin, bingoOn, rouletteStop]);

  // Entrance animation is only for the batch that lands after a search. Without
  // this gate, virtualised rows would fade in as the traveller scrolls, which
  // reads as the list redrawing itself.
  const [entering, setEntering] = useState(false);
  const hadStops = useRef(false);
  useEffect(() => {
    if (stops.length > 0 && !hadStops.current) {
      hadStops.current = true;
      setEntering(true);
      // Longer than the animation plus the largest stagger delay, so removing
      // the class never truncates a running animation.
      const timer = window.setTimeout(() => setEntering(false), 900);
      return () => window.clearTimeout(timer);
    }
    if (stops.length === 0) hadStops.current = false;
  }, [stops.length]);

  // --- Draggable sheet (mobile) ---------------------------------------------
  // Below 768px the sidebar is styled as a bottom sheet with a grabber, but the
  // grabber did nothing — it looked draggable and wasn't. Dragging it now snaps
  // between three heights so the map can be opened up or the list filled out.
  // Height is driven by a CSS var the media query consumes, so desktop is
  // untouched. Snap fractions are of the viewport.
  const SNAPS = [0.3, 0.55, 0.92];
  const [snap, setSnap] = useState(1);
  const dragRef = useRef<{ startY: number; startH: number; t: number; moved: boolean } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);

  function sheetPointerDown(e: React.PointerEvent) {
    if (window.innerWidth > 768) return;
    const el = sidebarRef.current;
    if (!el) return;
    // Capture so the drag survives the pointer leaving the grabber.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: el.getBoundingClientRect().height, t: Date.now(), moved: false };
  }

  function sheetPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    // Dragging down (positive dy) shrinks the sheet.
    let h = d.startH - (e.clientY - d.startY);
    const min = window.innerHeight * SNAPS[0];
    const max = window.innerHeight * SNAPS[SNAPS.length - 1];
    // Past the ends, keep moving but with resistance — a hard stop feels broken.
    if (h > max) h = max + (h - max) * 0.2;
    if (h < min) h = min - (min - h) * 0.2;
    if (Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    setDragH(h);
  }

  function sheetPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.moved) {
      setDragH(null);
      return;
    }
    const dy = e.clientY - d.startY;
    const velocity = Math.abs(dy) / Math.max(1, Date.now() - d.t);
    const heights = SNAPS.map((f) => window.innerHeight * f);
    const current = d.startH - dy;
    // A quick flick moves one stop in its direction regardless of distance;
    // otherwise settle on whichever snap point is nearest.
    let next: number;
    if (velocity > 0.5) {
      next = dy > 0 ? Math.max(0, snap - 1) : Math.min(SNAPS.length - 1, snap + 1);
    } else {
      next = heights.reduce((best, h, i) => (Math.abs(h - current) < Math.abs(heights[best] - current) ? i : best), 0);
    }
    setSnap(next);
    setDragH(null);
  }

  // Selecting a card grows it; re-measure so the rows below shift correctly.
  const measureRow = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) rowVirtualizer.measureElement(el);
    },
    [rowVirtualizer],
  );

  // "Surprise me": auto-fill the plan with the best stops that fit the spare
  // time. Works over the filtered list, so an active vibe gives a themed trip.
  function handleSurprise() {
    if (!spareMin) return;
    const ids = surprisePlan(filtered, spareMin, prefs, { eta: etaOf(0) });
    if (ids.length === 0) {
      setNotice(`🎲 ${t('surpriseNone')}`);
      return;
    }
    setPlanIds(new Set(ids));
    setNotice(`🎲 ${t('surpriseDone', { n: ids.length })}`);
  }

  // Detour Roulette: one weighted-random wildcard within the current filters,
  // revealed after a short spin. Re-spins are counted (and gently mocked).
  function spinRoulette() {
    if (rouletteSpinning) return;
    const candidates = filtered.filter((s) => !planIds.has(s.id));
    if (!candidates.length) {
      setNotice(`🎰 ${t('rouletteNone')}`);
      return;
    }
    if (rouletteStop) setRespins((n) => n + 1);
    setRouletteSpinning(true);
    const excludeId = rouletteStop?.id;
    window.setTimeout(() => {
      setRouletteStop(rouletteSpin(candidates, excludeId));
      setRouletteSpinning(false);
    }, 1100);
  }

  function rouletteCommit() {
    if (!rouletteStop) return;
    togglePlan(rouletteStop.id);
    setSelectedId(rouletteStop.id);
    setRouletteStop(null);
    setRespins(0);
    setNotice(`🎰 ${t('rouletteCommitted')}`);
  }

  // Road Trip Bingo: 4x4 card of route stops + classic sightings, persisted
  // per trip so the card (and progress) survives reloads mid-drive.
  const BINGO_KEY = 'sq-bingo-v1';
  function openBingo() {
    if (bingoOn) {
      setBingoOn(false);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(BINGO_KEY) ?? 'null');
      if (saved && saved.label === routeLabel && Array.isArray(saved.squares) && saved.squares.length === 16) {
        setBingoSquares(saved.squares);
        setBingoMarked(Array.isArray(saved.marked) ? saved.marked : Array(16).fill(false));
        setBingoOn(true);
        return;
      }
    } catch {
      // corrupt save — deal a fresh card
    }
    const squares = buildBingoCard(stops);
    setBingoSquares(squares);
    setBingoMarked(Array(16).fill(false));
    try {
      localStorage.setItem(BINGO_KEY, JSON.stringify({ label: routeLabel, squares, marked: Array(16).fill(false) }));
    } catch {
      // storage blocked — card just won't persist
    }
    setBingoOn(true);
  }

  function toggleBingoSquare(i: number) {
    const next = [...bingoMarked];
    next[i] = !next[i];
    if (bingoLineCount(next) > bingoLineCount(bingoMarked)) {
      setBingoWin(true);
      navigator.vibrate?.([80, 40, 80, 40, 160]);
      window.setTimeout(() => setBingoWin(false), 4000);
    }
    setBingoMarked(next);
    try {
      localStorage.setItem(BINGO_KEY, JSON.stringify({ label: routeLabel, squares: bingoSquares, marked: next }));
    } catch {
      // storage blocked
    }
  }

  // Trip vibes: one-tap category presets. Tapping the active vibe restores all.
  // Toggling a personality re-derives the category filter from whatever is now
  // selected: the union of their categories, or everything when none are.
  function togglePersonality(id: PersonalityId) {
    setPersonalities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const union = new Set<CategoryId>();
      for (const pid of next) {
        for (const c of PERSONALITIES.find((p) => p.id === pid)?.cats ?? []) union.add(c);
      }
      setCats(union.size ? union : new Set(CATEGORIES.map((c) => c.id)));
      return next;
    });
  }

  // Meal timing: project each food stop's arrival clock time from the route's
  // average speed (leaving now) and badge the ones landing in a meal window.
  const mealById = useMemo(() => {
    const out = new Map<string, { clock: string; meal: 'mealLunch' | 'mealDinner' }>();
    if (!route) return out;
    const avgKmh = route.durationMin > 0 ? route.distanceKm / (route.durationMin / 60) : 70;
    const departure = Date.now();
    for (const s of stops) {
      if (s.category !== 'food') continue;
      const eta = new Date(departure + (s.alongKm / avgKmh) * 3600_000);
      const mins = eta.getHours() * 60 + eta.getMinutes();
      const meal =
        mins >= 680 && mins <= 830 ? 'mealLunch' : mins >= 1040 && mins <= 1180 ? 'mealDinner' : null;
      if (meal) {
        out.set(s.id, { clock: eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), meal });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, route]);

  // Shareable trip recap card: a branded 1080x1350 image drawn on a canvas —
  // route, stats and the stop list — shared via the native sheet when the
  // browser supports sharing files, else downloaded.
  async function shareTripCard() {
    if (!route || plan.length === 0) return;
    const W = 1080;
    const H = 1350;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    if (!x) return;
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1e3a8a');
    g.addColorStop(0.5, '#2563eb');
    g.addColorStop(1, '#0891b2');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#bfdbfe';
    x.font = '700 40px system-ui, sans-serif';
    x.fillText('🛣️ My Pithop road trip', 64, 108);
    x.fillStyle = '#ffffff';
    x.font = '800 62px system-ui, sans-serif';
    let label = routeLabel;
    while (label.length > 8 && x.measureText(label).width > W - 128) label = `${label.slice(0, -2)}…`;
    x.fillText(label, 64, 200);
    x.fillStyle = '#bfdbfe';
    x.font = '600 38px system-ui, sans-serif';
    x.fillText(
      `${fmtDist(route.distanceKm, units)} · ${fmtDur(route.durationMin + planExtraMin)} · ${plan.length} stops`,
      64,
      264,
    );
    x.fillStyle = '#ffffff';
    x.font = '500 40px system-ui, sans-serif';
    const shown = plan.slice(0, 10);
    shown.forEach((s, i) => {
      const name = s.name.length > 32 ? `${s.name.slice(0, 31)}…` : s.name;
      x.fillText(`${CATEGORY_MAP[s.category].emoji}  ${name}`, 64, 370 + i * 84);
    });
    if (plan.length > shown.length) {
      x.fillStyle = '#bfdbfe';
      x.fillText(`… and ${plan.length - shown.length} more`, 64, 370 + shown.length * 84);
    }
    x.fillStyle = '#ffffff';
    x.font = '700 42px system-ui, sans-serif';
    x.fillText('pithop.com', 64, H - 64);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'pithop-trip.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My Pithop road trip' }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pithop-trip.png';
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`📸 ${t('tripCardSaved')}`);
  }

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

  function startLive() {
    if (!route) return;
    announcedRef.current = new Set();
    spokenFarRef.current = new Set();
    spokenNearRef.current = new Set();
    factsSpokenRef.current = new Set();
    lastFactAtRef.current = 0;
    arrivedRef.current = false;
    setLivePos(null);
    setLiveFollow(true);
    setError(null);
    setNotice(null);
    setLiveOn(true);
  }

  function endLive() {
    setLiveOn(false);
    setLivePos(null);
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // no speech support
    }
  }

  // Voice announcements via the browser's built-in speech synthesis — no
  // network, no API. Best-effort: silently does nothing where unsupported.
  function speak(text: string) {
    if (!voiceRef.current) return;
    try {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // no speech support
    }
  }

  function toggleVoice() {
    setVoiceOn((v) => {
      const next = !v;
      try {
        localStorage.setItem('sq-live-voice', next ? 'on' : 'off');
      } catch {
        // storage blocked — won't persist
      }
      if (!next) {
        try {
          window.speechSynthesis?.cancel();
        } catch {
          // no speech support
        }
      }
      return next;
    });
  }

  // Follow the device position while live drive is on. High accuracy (we want
  // the GPS chip when driving), and a best-effort screen wake lock so the phone
  // doesn't sleep mid-trip. watchPosition keeps firing on its own — transient
  // errors are ignored; only a denied permission ends the mode.
  useEffect(() => {
    if (!liveOn) return;
    if (!navigator.geolocation) {
      setError(t('liveNoGeo'));
      setLiveOn(false);
      return;
    }
    let wakeLock: { release?: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<any> } }).wakeLock;
    if (wl?.request) wl.request('screen').then((w) => (wakeLock = w)).catch(() => {});
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLivePos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError(t('liveBlocked'));
          setLiveOn(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      void wakeLock?.release?.().catch(() => {});
    };
  }, [liveOn]);

  // Turn instructions projected onto the route, sorted by where they happen —
  // so "the next turn" is just the first one ahead of the driver's position.
  const liveSteps = useMemo(() => {
    const calc = routeCalcRef.current;
    if (!route?.steps?.length || !calc) return [];
    return route.steps
      .map((st) => ({ ...st, alongKm: projectOntoRoute(st, calc.calcRoute, calc.cum).alongKm }))
      .sort((a, b) => a.alongKm - b.alongKm);
  }, [route]);

  // Announcements while driving: buzz + notice (and voice) the first time we
  // come within ~400 m of each planned stop; speak each turn twice — a heads-up
  // a mile/kilometre out and again just before it — and the final arrival.
  useEffect(() => {
    if (!liveOn || !livePos) return;
    for (const s of plan) {
      if (announcedRef.current.has(s.id)) continue;
      if (haversineKm(livePos, s) <= 0.4) {
        announcedRef.current.add(s.id);
        setNotice(`📍 ${t('liveArriving', { name: s.name })}`);
        navigator.vibrate?.([120, 60, 120]);
        speak(t('liveArriving', { name: s.name }));
      }
    }
    const calc = routeCalcRef.current;
    if (!calc || !route) return;
    const proj = projectOntoRoute(livePos, calc.calcRoute, calc.cum);
    const next = liveSteps.find((st) => st.alongKm > proj.alongKm + 0.02);
    if (next) {
      const d = next.alongKm - proj.alongKm;
      const farKm = units === 'mi' ? 1.609 : 1;
      if (d <= 0.25 && !spokenNearRef.current.has(next.alongKm)) {
        spokenNearRef.current.add(next.alongKm);
        spokenFarRef.current.add(next.alongKm); // too late for the heads-up
        speak(next.text);
      } else if (d <= farKm && !spokenFarRef.current.has(next.alongKm)) {
        spokenFarRef.current.add(next.alongKm);
        speak(`${units === 'mi' ? t('liveInMile') : t('liveInKm')}, ${next.text}`);
      }
    }
    // Compare within the geometry's own cumulative km — the router's stated
    // road distance can differ from the (simplified) line's length by more
    // than this threshold, which would make arrival unreachable.
    const cumTotal = calc.cum[calc.cum.length - 1];
    if (!arrivedRef.current && cumTotal - proj.alongKm < 0.15 && proj.offRouteKm < 0.5) {
      arrivedRef.current = true;
      setNotice(`🏁 ${t('liveArrived')}`);
      navigator.vibrate?.([120, 60, 120, 60, 240]);
      speak(t('liveArrived'));
    }
    // Drive facts: narrate a landmark you're about to pass (voice on, not in
    // the plan — planned stops get their own arrival call). One per landmark
    // per drive, throttled so the car isn't chattering.
    if (voiceRef.current && Date.now() - lastFactAtRef.current > 45_000) {
      const fact = stops.find(
        (s) =>
          s.source === 'wiki' &&
          s.description &&
          !planIds.has(s.id) &&
          !factsSpokenRef.current.has(s.id) &&
          s.offRouteKm < 5 &&
          s.alongKm - proj.alongKm > 0 &&
          s.alongKm - proj.alongKm < 1.2,
      );
      if (fact) {
        factsSpokenRef.current.add(fact.id);
        lastFactAtRef.current = Date.now();
        speak(`${t('drivePassing', { name: fact.name })}. ${fact.description}`);
        setNotice(`🔎 ${t('drivePassing', { name: fact.name })} — ${fact.description}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePos, liveOn]);

  // Live HUD figures: project the position onto the route to get progress, then
  // distance/ETA to the next planned stop ahead and to the destination. ETA uses
  // the route's own average speed so it agrees with the planned drive time.
  const liveNav = useMemo(() => {
    if (!liveOn) return null;
    const destName = shortName(toText || routeLabel.split('→')[1]?.trim() || '') || t('liveDest');
    if (!livePos)
      return { pos: null, turn: '', primary: t('liveWaiting'), primaryMeta: '', secondary: '', offRoute: false };
    const calc = routeCalcRef.current;
    if (!calc || !route)
      return { pos: livePos, turn: '', primary: `🏁 ${destName}`, primaryMeta: '', secondary: '', offRoute: false };
    const proj = projectOntoRoute(livePos, calc.calcRoute, calc.cum);
    const avgKmh = route.durationMin > 0 ? route.distanceKm / (route.durationMin / 60) : 60;
    const eta = (km: number) => fmtDur((km / avgKmh) * 60);
    // Remaining road distance = remaining fraction of the geometry, scaled to
    // the router's stated distance (the two lengths differ slightly).
    const cumTotal = calc.cum[calc.cum.length - 1] || 1;
    const destKm = Math.max(0, (route.distanceKm * (cumTotal - proj.alongKm)) / cumTotal);
    const offRoute = proj.offRouteKm > 0.5;
    // The next maneuver ahead of the driver, as "distance · instruction".
    const nextStep = liveSteps.find((st) => st.alongKm > proj.alongKm + 0.02);
    const turn = nextStep ? `${fmtDist(Math.max(0, nextStep.alongKm - proj.alongKm), units)} · ${nextStep.text}` : '';
    const next = plan.filter((s) => s.alongKm >= proj.alongKm - 0.3).sort((a, b) => a.alongKm - b.alongKm)[0];
    if (next) {
      const nextKm = Math.max(0, next.alongKm - proj.alongKm);
      return {
        pos: livePos,
        turn,
        primary: `🎯 ${next.name}`,
        primaryMeta: `${fmtDist(nextKm, units)} · ${t('liveEta')} ${eta(nextKm)}`,
        secondary: `🏁 ${destName} · ${fmtDist(destKm, units)} · ${eta(destKm)}`,
        offRoute,
      };
    }
    return {
      pos: livePos,
      turn,
      primary: `🏁 ${destName}`,
      primaryMeta: `${fmtDist(destKm, units)} · ${t('liveEta')} ${eta(destKm)}`,
      secondary: '',
      offRoute,
    };
  }, [liveOn, livePos, plan, route, units, toText, routeLabel, liveSteps]);

  // Non-selected route alternatives, drawn dim on the map.
  const altCoords = useMemo(
    () => routeAlts.filter((_, i) => i !== routeIdx).map((r) => r.coords),
    [routeAlts, routeIdx],
  );

  return (
    <div className="app">
      <aside
        className={`sidebar${dragH !== null ? ' dragging' : ''}`}
        ref={sidebarRef}
        data-snap={snap}
        style={dragH !== null ? ({ '--sheet-h': `${dragH}px` } as React.CSSProperties) : undefined}
      >
        <div className="hero">
          {/* The grabber: drag target for the mobile sheet. Hidden on desktop by
              the media query, where the sidebar is a fixed-width column. */}
          <div
            className="sheet-grab"
            role="separator"
            aria-label={t('sheetDrag')}
            onPointerDown={sheetPointerDown}
            onPointerMove={sheetPointerMove}
            onPointerUp={sheetPointerUp}
            onPointerCancel={sheetPointerUp}
          />
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
            {vias.map((v, i) => (
              <div className="via-row" key={v.key}>
                <span className="via-num" aria-hidden="true">
                  {i + 1}
                </span>
                <PlaceInput
                  value={v.text}
                  placeholder={t('viaPh')}
                  onChange={(text) => updateVia(v.key, { text, pick: null })}
                  onSelect={(p) => updateVia(v.key, { text: p.label, pick: { lat: p.lat, lng: p.lng } })}
                />
                <div className="via-actions">
                  <button
                    type="button"
                    className="via-btn"
                    title={t('viaUp')}
                    aria-label={`${t('viaUp')} (${i + 1})`}
                    disabled={i === 0}
                    onClick={() => moveVia(v.key, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="via-btn"
                    title={t('viaDown')}
                    aria-label={`${t('viaDown')} (${i + 1})`}
                    disabled={i === vias.length - 1}
                    onClick={() => moveVia(v.key, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="via-btn remove"
                    title={t('viaRemove')}
                    aria-label={`${t('viaRemove')} (${i + 1})`}
                    onClick={() => removeVia(v.key)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {vias.length < MAX_VIAS && (
              <button type="button" className="add-via-btn" onClick={addVia}>
                ➕ {t('addVia')}
              </button>
            )}
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
            <div className="avoid-row" role="group" aria-label="Route options">
              <button
                type="button"
                className={`avoid-chip${avoidTolls ? ' active' : ''}`}
                aria-pressed={avoidTolls}
                disabled={!hasGeoapify()}
                title={hasGeoapify() ? t('avoidTolls') : t('vehNeedsKey')}
                onClick={() => toggleAvoid('tolls')}
              >
                🚧 {t('avoidTolls')}
              </button>
              <button
                type="button"
                className={`avoid-chip${avoidHighways ? ' active' : ''}`}
                aria-pressed={avoidHighways}
                disabled={!hasGeoapify()}
                title={hasGeoapify() ? t('avoidHighways') : t('vehNeedsKey')}
                onClick={() => toggleAvoid('highways')}
              >
                🛣️ {t('avoidHighways')}
              </button>
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

        {/* Placeholder cards while the first batch of stops is still loading.
            They occupy roughly the space real cards will, so the list doesn't
            jump when results land, and they make the wait read as "filling in"
            rather than "nothing is happening". */}
        {busy && stops.length === 0 && (
          <div className="skeletons" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="skeleton-card" key={i} style={{ animationDelay: `${i * 90}ms` }}>
                <div className="sk sk-icon" />
                <div className="sk-body">
                  <div className="sk sk-line w70" />
                  <div className="sk sk-line w45" />
                </div>
                <div className="sk sk-add" />
              </div>
            ))}
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
            {routeAlts.length > 1 && (
              <div className="route-alts" role="group" aria-label={t('routesLabel')}>
                {routeAlts.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`route-alt${i === routeIdx ? ' active' : ''}`}
                    aria-pressed={i === routeIdx}
                    title={r.noTolls ? t('noTollsTitle') : r.tolls ? t('tollsMaybe') : undefined}
                    onClick={() => void switchRoute(i)}
                  >
                    {fmtDur(r.durationMin)} · {fmtDist(r.distanceKm, units)}
                    {r.tolls ? ' · 🚧' : ''}
                    {r.noTolls ? ` · ✓ ${t('noTollsLabel')}` : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="summary-stats">
              {fmtDist(route.distanceKm, units)} · {fmtDur(route.durationMin)} {t('drive')} ·{' '}
              {t('stopsFound', { n: stops.length })}
            </div>
            {route.tolls && <div className="summary-tolls">🚧 {t('tollsMaybe')}</div>}
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
            {!liveOn && (
              <button type="button" className="summary-live" onClick={startLive}>
                ▶ {t('liveDrive')}
              </button>
            )}
            {stops.length > 0 && (
              <div className="surprise">
                <span className="surprise-label">{t('spareTime')}</span>
                <div className="surprise-opts" role="group" aria-label={t('spareTime')}>
                  {[60, 120, 240, 480].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={spareMin === m ? 'active' : ''}
                      aria-pressed={spareMin === m}
                      onClick={() => setSpareMin((cur) => (cur === m ? null : m))}
                    >
                      {m === 480 ? t('fullDay') : fmtDur(m)}
                    </button>
                  ))}
                </div>
                <button type="button" className="surprise-go" disabled={!spareMin} onClick={handleSurprise}>
                  🎲 {t('surpriseBtn')}
                </button>
              </div>
            )}
            {stops.length > 0 && (
              <div className="fun-row">
                <button type="button" className="fun-btn" onClick={spinRoulette}>
                  🎰 {t('rouletteBtn')}
                </button>
                <button
                  type="button"
                  className={`fun-btn${bingoOn ? ' active' : ''}`}
                  aria-pressed={bingoOn}
                  onClick={openBingo}
                >
                  🎯 {t('bingoBtn')}
                </button>
              </div>
            )}
            {(rouletteSpinning || rouletteStop) && (
              <div className="roulette">
                <div className="roulette-title">🎰 {t('rouletteTitle')}</div>
                {rouletteSpinning ? (
                  <div className="roulette-spin" aria-hidden="true">
                    🎡 🗿 🦖 🛸 🎪
                  </div>
                ) : (
                  rouletteStop && (
                    <>
                      <div className="roulette-name">
                        {CATEGORY_MAP[rouletteStop.category].emoji} {rouletteStop.name}
                      </div>
                      <div className="roulette-meta">
                        🚗 {rouletteStop.detourMin} min detour · ⏱ {fmtDur(rouletteStop.visitMin)}
                      </div>
                      <div className="roulette-dare">{t('rouletteDare')}</div>
                      <div className="roulette-actions">
                        <button type="button" className="roulette-add" onClick={rouletteCommit}>
                          ✅ {t('rouletteAdd')}
                        </button>
                        <button type="button" className="roulette-respin" onClick={spinRoulette}>
                          🔁 {t('rouletteRespin')}
                        </button>
                      </div>
                      {respins >= 2 && <div className="roulette-chicken">{t('rouletteChicken', { n: respins })}</div>}
                    </>
                  )
                )}
              </div>
            )}
            {bingoOn && (
              <div className="bingo">
                <div className="bingo-hint">{t('bingoHint')}</div>
                {bingoWin && <div className="bingo-win">🎉 {t('bingoWin')}</div>}
                <div className="bingo-grid">
                  {bingoSquares.map((sq, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`bingo-sq${bingoMarked[i] ? ' marked' : ''}`}
                      aria-pressed={bingoMarked[i]}
                      onClick={() => toggleBingoSquare(i)}
                    >
                      {sq.text}
                    </button>
                  ))}
                </div>
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
              <div className="vibes" role="group" aria-label={t('vibeLabel')}>
                <span className="vibes-label">{t('vibeLabel')}</span>
                {PERSONALITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`vibe-chip${personalities.has(p.id) ? ' active' : ''}`}
                    aria-pressed={personalities.has(p.id)}
                    onClick={() => togglePersonality(p.id)}
                  >
                    {p.emoji} {t(`pers_${p.id}` as 'pers_scenic')}
                  </button>
                ))}
                <button
                  type="button"
                  className={`vibe-chip gem${gemsOnly ? ' active' : ''}`}
                  aria-pressed={gemsOnly}
                  onClick={() => setGemsOnly((v) => !v)}
                >
                  💎 {t('gemsOnly')}
                </button>
              </div>
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
                  <button
                    type="button"
                    className="plan-share"
                    title={t('tripCard')}
                    onClick={() => void shareTripCard()}
                  >
                    📸 {t('tripCard')}
                  </button>
                </div>
              </div>
            )}

            {plan.length > 0 && (
              <div className="view-tabs" role="tablist" aria-label={t('itineraryTab')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showItinerary}
                  className={`view-tab${!showItinerary ? ' active' : ''}`}
                  onClick={() => setShowItinerary(false)}
                >
                  📍 {t('listTab')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showItinerary}
                  className={`view-tab${showItinerary ? ' active' : ''}`}
                  onClick={() => setShowItinerary(true)}
                >
                  🗓 {t('itineraryTab')}
                </button>
              </div>
            )}

            {showItinerary && itinerary && plan.length > 0 ? (
              <ItineraryView
                itinerary={itinerary}
                units={units}
                departAt={departAt}
                maxDriveMin={maxDriveMin}
                maxDays={maxDays}
                dayBreaks={dayBreaks}
                lodging={lodging}
                onDepartChange={setDepartAt}
                onMaxDriveChange={setMaxDriveMin}
                onMaxDaysChange={setMaxDays}
                onToggleDayBreak={toggleDayBreak}
                onVisitChange={(id, min) => setVisitOverride((v) => ({ ...v, [id]: min }))}
                onRemove={(id) => togglePlan(id)}
                onSelect={(id) => {
                  setShowItinerary(false);
                  setSelectedId(id);
                }}
              />
            ) : (
            <>
            {dontMiss.length > 0 && (
              <div className="dont-miss">
                <h2>⭐ {t('dontMiss')}</h2>
                <div className="dm-cards">
                  {dontMiss.map((s) => {
                    const c = CATEGORY_MAP[s.category];
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="dm-card"
                        onClick={() => setSelectedId(s.id)}
                      >
                        {s.imageUrl && <img src={s.imageUrl} alt="" loading="lazy" />}
                        <div className="dm-body">
                          <div className="dm-name">
                            {c.emoji} {s.name}
                          </div>
                          <ScoreRow id={s.id} />
                          <ScoreReasons id={s.id} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="stop-list">
              <div className="list-header">
                {filtered.length} match{filtered.length === 1 ? '' : 'es'}
                {filtered.length > LIST_CAP ? ` · showing first ${LIST_CAP}` : ''}
              </div>
              <div
                className="stop-rows"
                ref={listRef}
                style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
              >
              {rowVirtualizer.getVirtualItems().map((row) => {
                const s = visible[row.index];
                if (!s) return null;
                const c = CATEGORY_MAP[s.category];
                const added = planIds.has(s.id);
                const selected = selectedId === s.id;
                const intro = wikiIntros[s.id];
                // Hours are judged at the PROJECTED ARRIVAL time, not "now" —
                // a place 4 hours down the road being open now is irrelevant.
                const avgKmh =
                  route && route.durationMin > 0 ? route.distanceKm / (route.durationMin / 60) : 70;
                const eta = new Date(Date.now() + (s.alongKm / avgKmh) * 3600_000);
                const etaClock = eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const hs = hoursStatus(s.hours, eta);
                return (
                  <div
                    key={s.id}
                    className="stop-row"
                    data-index={row.index}
                    ref={measureRow}
                    style={{ transform: `translateY(${row.start - listTop}px)` }}
                  >
                  <div
                    className={`stop-card${selected ? ' selected' : ''}${
                      entering && row.index < 12 ? ' entering' : ''
                    }`}
                    style={entering && row.index < 12 ? { animationDelay: `${row.index * 30}ms` } : undefined}
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
                      <ScoreRow id={s.id} />
                      {isHiddenGem(s) && <span className="gem-badge">💎 {t('gemBadge')}</span>}
                      {hs && (
                        <span className={`hours-badge ${hs.open ? 'open' : 'closed'}`}>
                          {hs.open ? t('hoursArriveOpen', { t: etaClock }) : `⚠️ ${t('hoursArriveClosed', { t: etaClock })}`}
                          {hs.open && hs.until ? ` · ${t('hoursUntil', { t: hs.until })}` : ''}
                          {!hs.open && hs.opensAt ? ` · ${t('hoursOpens', { t: hs.opensAt })}` : ''}
                        </span>
                      )}
                      {s.description && <div className="stop-desc">{s.description}</div>}
                      {mealById.has(s.id) && (
                        <div className="stop-meal">
                          🍽 ~{mealById.get(s.id)!.clock} · {t(mealById.get(s.id)!.meal)}
                        </div>
                      )}
                      {selected && (
                        <div className="stop-details">
                          {s.imageUrl && <img className="stop-photo" src={s.imageUrl} alt={s.name} loading="lazy" />}
                          {intro && intro !== s.description && <p className="stop-intro">{intro}</p>}
                          <ScoreReasons id={s.id} />
                          <p className="stop-todo">💡 {thingsToDo(s.kind)}</p>
                          {s.hours && <p className="stop-hours">🕐 {prettyHours(s.hours)}</p>}
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
                            {s.website && (
                              <a href={s.website} target="_blank" rel="noreferrer">
                                🌐 {t('website')} ↗
                              </a>
                            )}
                            {s.wikiUrl && (
                              <a href={s.wikiUrl} target="_blank" rel="noreferrer">
                                {s.wikiUrl.includes('wikivoyage') ? 'Wikivoyage' : 'Wikipedia'} ↗
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
                  </div>
                );
              })}
              </div>
            </div>
            </>
            )}
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
          {' · '}
          <a href="/terms.html" target="_blank" rel="noreferrer">
            Terms
          </a>
        </footer>
      </aside>

      <MapView
        route={route}
        altRoutes={altCoords}
        routeVias={routeVias}
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
        live={{
          on: liveOn,
          follow: liveFollow,
          pos: liveNav?.pos ?? null,
          turn: liveNav?.turn ?? '',
          primary: liveNav?.primary ?? '',
          primaryMeta: liveNav?.primaryMeta ?? '',
          secondary: liveNav?.secondary ?? '',
          offRoute: liveNav?.offRoute ?? false,
          voiceOn,
          onToggleVoice: toggleVoice,
          onRecenter: () => setLiveFollow(true),
          onEnd: endLive,
          onPan: () => setLiveFollow(false),
        }}
      />
    </div>
  );
}
