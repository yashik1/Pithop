import { useEffect, useMemo, useRef, useState } from 'react';
import { geocode } from './api/geocode';
import { fetchRoute, type RouteResult } from './api/route';
import { fetchRoadsideStops } from './api/overpass';
import { fetchWikiExtract, fetchWikiStops } from './api/wikipedia';
import { fetchGeoapifyRoadside, hasGeoapify } from './api/geoapify';
import type { Stop } from './types';
import { CATEGORIES, CATEGORY_MAP, thingsToDo, type CategoryId } from './lib/categories';
import { cumulativeKm, haversineKm, projectOntoRoute, sampleAlong, simplify, type LatLng } from './lib/geo';
import { fmtDur } from './lib/format';
import { MapView } from './MapView';
import { PlaceInput } from './components/PlaceInput';

// Last successful trip, persisted so it survives restarts and works with no
// signal: reopening the app offline restores the route, stops and plan.
const TRIP_KEY = 'sidequest-trip-v1';

interface SavedTrip {
  fromText: string;
  toText: string;
  routeLabel: string;
  route: RouteResult;
  stops: Stop[];
  planIds: string[];
}

function loadSavedTrip(): SavedTrip | null {
  try {
    const raw = localStorage.getItem(TRIP_KEY);
    if (!raw) return null;
    const trip = JSON.parse(raw) as SavedTrip;
    if (!trip.route?.coords?.length || !Array.isArray(trip.stops) || !trip.stops.length) return null;
    return trip;
  } catch {
    return null;
  }
}

const DETOUR_OPTIONS = [5, 10, 15, 25, 40];
const VISIT_OPTIONS = [
  { label: 'Quick stop (≤ 15 min)', max: 15 },
  { label: 'Short (≤ 30 min)', max: 30 },
  { label: 'Up to 1 hour', max: 60 },
  { label: 'Up to 2 hours', max: 120 },
  { label: 'Any length', max: 9999 },
];
const LIST_CAP = 250;

function shortName(displayName: string): string {
  return displayName.split(',')[0];
}

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  const routeCalcRef = useRef<{ calcRoute: LatLng[]; cum: number[] } | null>(null);

  // Bumped on every new search so a slow response from an old search can't
  // overwrite the results of a newer one.
  const searchSeq = useRef(0);

  // Restore the last planned trip on startup — works fully offline since
  // everything needed (route, stops, plan) comes from localStorage.
  useEffect(() => {
    const saved = loadSavedTrip();
    if (!saved) return;
    const calcRoute = simplify(saved.route.coords, 1500);
    routeCalcRef.current = { calcRoute, cum: cumulativeKm(calcRoute) };
    setFromText(saved.fromText);
    setToText(saved.toText);
    setRoute(saved.route);
    setRouteLabel(saved.routeLabel);
    setStops(saved.stops);
    setPlanIds(new Set(saved.planIds));
    if (!navigator.onLine) setNotice('You are offline — showing your saved trip.');
  }, []);

  // Keep the saved trip current (plan edits included). Route geometry is
  // simplified before writing to stay well inside localStorage quotas.
  useEffect(() => {
    if (!route || stops.length === 0) return;
    try {
      const payload: SavedTrip = {
        fromText,
        toText,
        routeLabel,
        route: { ...route, coords: simplify(route.coords, 1500) },
        stops,
        planIds: [...planIds],
      };
      localStorage.setItem(TRIP_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or blocked — the app still works, just without offline restore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, stops, planIds, routeLabel]);

  async function findStops() {
    const token = ++searchSeq.current;
    const fresh = () => searchSeq.current === token;
    setBusy('Locating places…');
    setError(null);
    setNotice(null);
    setStops([]);
    setPlanIds(new Set());
    setSelectedId(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    try {
      const [from, to] = await Promise.all([
        fromPick ? Promise.resolve({ ...fromPick, displayName: fromText }) : geocode(fromText),
        toPick ? Promise.resolve({ ...toPick, displayName: toText }) : geocode(toText),
      ]);
      if (!fresh()) return;
      setBusy('Calculating route…');
      const r = await fetchRoute(from, to);
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
          .map((s) => {
            const proj = projectOntoRoute({ lat: s.lat, lng: s.lng }, calcRoute, cum);
            return {
              ...s,
              offRouteKm: proj.offRouteKm,
              alongKm: proj.alongKm,
              // Rough round-trip detour at ~40 km/h off-highway, plus exit/parking buffer.
              detourMin: Math.round((proj.offRouteKm * 2 * 60) / 40) + 2,
            };
          })
          .filter((s) => s.offRouteKm <= 12)
          .sort((a, b) => a.alongKm - b.alongKm);

      // Roadside data (food, fuel, rest areas) comes from Geoapify when a key
      // is configured, else the free Overpass servers. Either way it can be
      // slow — show Wikipedia landmarks as soon as they're ready and merge
      // the roadside stops in whenever they arrive.
      const roadsidePromise = hasGeoapify() ? fetchGeoapifyRoadside(samples) : fetchRoadsideStops(samples);
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

      const [roadsideSettled] = await Promise.allSettled([roadsidePromise]);
      if (!fresh()) return;
      const roadsideStops = roadsideSettled.status === 'fulfilled' ? enrich(roadsideSettled.value) : [];
      const roadsideError = roadsideSettled.status === 'rejected';
      if (wikiError && roadsideError) {
        throw new Error('Both place services are unavailable right now — try again in a couple of minutes');
      }
      setStops(mergeStops(wikiStops, roadsideStops));
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
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFromText('My location');
        setFromPick({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setError('Could not get your location — check location permissions'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function toggleAhead() {
    if (aheadOnly) {
      setAheadOnly(false);
      setMyAlongKm(null);
      return;
    }
    const calc = routeCalcRef.current;
    if (!calc || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const proj = projectOntoRoute(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          calc.calcRoute,
          calc.cum,
        );
        setMyAlongKm(proj.alongKm);
        setAheadOnly(true);
      },
      () => setError('Could not get your location — check location permissions'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="hero">
          <header className="brand">
            <h1>
              <span className="brand-icon">🛣️</span> <span className="brand-name">SideQuest</span>
            </h1>
            <p>Fun stops, hidden gems and breaks along your drive</p>
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
                placeholder="From — city, address or 📍"
                onChange={(t) => {
                  setFromText(t);
                  setFromPick(null);
                }}
                onSelect={(p) => {
                  setFromText(p.label);
                  setFromPick({ lat: p.lat, lng: p.lng });
                }}
              />
              <button type="button" className="geo-btn" title="Use my location" onClick={useMyLocation}>
                📍
              </button>
            </div>
            <PlaceInput
              value={toText}
              placeholder="To — city or address"
              onChange={(t) => {
                setToText(t);
                setToPick(null);
              }}
              onSelect={(p) => {
                setToText(p.label);
                setToPick({ lat: p.lat, lng: p.lng });
              }}
            />
            <button type="submit" className={`go-btn${busy ? ' busy' : ''}`} disabled={!!busy || !fromText.trim() || !toText.trim()}>
              {busy ?? 'Find stops along the way'}
            </button>
          </form>
        </div>

        {error && <div className="error">⚠️ {error}</div>}
        {notice && !busy && <div className="notice">ℹ️ {notice}</div>}

        {route && !busy && (
          <div className="summary">
            <div className="summary-route">{routeLabel}</div>
            <div className="summary-stats">
              {Math.round(route.distanceKm)} km · {fmtDur(route.durationMin)} drive · {stops.length} stops found
            </div>
            {plan.length > 0 && (
              <div className="summary-plan">
                With your {plan.length} stop{plan.length > 1 ? 's' : ''}: ≈{' '}
                {fmtDur(route.durationMin + planExtraMin)} total (+{fmtDur(planExtraMin)})
              </div>
            )}
            {stops.length > 0 && (
              <label className="ahead">
                <input type="checkbox" checked={aheadOnly} onChange={toggleAhead} />
                On the road: only stops ahead of me (next 80 km)
                {aheadOnly && myAlongKm !== null && (
                  <span className="ahead-pos"> — you're at km {Math.round(myAlongKm)}</span>
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
                      onClick={() => toggleCat(c.id)}
                    >
                      {c.emoji} {c.label}
                      <span className="chip-count">{catCounts[c.id] ?? 0}</span>
                    </button>
                  );
                })}
              </div>
              <div className="selects">
                <label>
                  Max detour
                  <select value={maxDetour} onChange={(e) => setMaxDetour(Number(e.target.value))}>
                    {DETOUR_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        ≤ {d} min
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Time to spend
                  <select value={maxVisit} onChange={(e) => setMaxVisit(Number(e.target.value))}>
                    {VISIT_OPTIONS.map((v) => (
                      <option key={v.max} value={v.max}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {plan.length > 0 && (
              <div className="plan">
                <h2>Your stops ({plan.length})</h2>
                {plan.map((s) => (
                  <div key={s.id} className="plan-item">
                    <span className="plan-name" onClick={() => setSelectedId(s.id)}>
                      {CATEGORY_MAP[s.category].emoji} {s.name}
                    </span>
                    <span className="plan-time">{fmtDur(s.visitMin)}</span>
                    <button type="button" className="plan-remove" onClick={() => togglePlan(s.id)}>
                      ✕
                    </button>
                  </div>
                ))}
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
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="stop-icon" style={{ background: c.color + '26' }}>
                      {c.emoji}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">{s.name}</div>
                      <div className="stop-meta">
                        {c.label} · ⏱ {fmtDur(s.visitMin)} · 🚗 {s.detourMin} min detour · km {Math.round(s.alongKm)}
                      </div>
                      {s.description && <div className="stop-desc">{s.description}</div>}
                      {selected && (
                        <div className="stop-details">
                          {s.imageUrl && <img className="stop-photo" src={s.imageUrl} alt={s.name} loading="lazy" />}
                          {intro && intro !== s.description && <p className="stop-intro">{intro}</p>}
                          <p className="stop-todo">💡 {thingsToDo(s.kind)}</p>
                          <div className="stop-links" onClick={(e) => e.stopPropagation()}>
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
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`add-btn${added ? ' added' : ''}`}
                      title={added ? 'Remove from trip' : 'Add to trip'}
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

        {!route && !busy && !error && (
          <div className="hint">
            <p>
              Enter where you're driving from and to. SideQuest maps your route and finds viewpoints, quirky
              attractions, nature, history and food along the way — with how far off your route each stop is and how
              long you'd spend there.
            </p>
            <p className="hint-example">
              Try:{' '}
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
      />
    </div>
  );
}
