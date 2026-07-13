import { useEffect, useMemo, useRef, useState } from 'react';
import { geocode } from './api/geocode';
import { fetchRoute, type RouteResult } from './api/route';
import { fetchRoadsideStops } from './api/overpass';
import { fetchWikiStops } from './api/wikipedia';
import { fetchGooglePlaces, fetchGoogleRoute, hasGoogleBackend } from './api/googleBackend';
import type { Stop } from './types';
import { CATEGORIES, CATEGORY_MAP, type CategoryId } from './lib/categories';
import { cumulativeKm, haversineKm, projectOntoRoute, sampleAlong, simplify, type LatLng } from './lib/geo';
import { fmtDur } from './lib/format';
import { MapView } from './MapView';

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
  const [traffic, setTraffic] = useState<{ durationMin: number; orderedIds: string[] } | null>(null);
  const [aheadOnly, setAheadOnly] = useState(false);
  const [myAlongKm, setMyAlongKm] = useState<number | null>(null);
  const routeEndsRef = useRef<{ from: LatLng; to: LatLng } | null>(null);
  const routeCalcRef = useRef<{ calcRoute: LatLng[]; cum: number[] } | null>(null);

  // Bumped on every new search so a slow response from an old search can't
  // overwrite the results of a newer one.
  const searchSeq = useRef(0);

  async function findStops() {
    const token = ++searchSeq.current;
    const fresh = () => searchSeq.current === token;
    setBusy('Locating places…');
    setError(null);
    setNotice(null);
    setStops([]);
    setPlanIds(new Set());
    setSelectedId(null);
    setTraffic(null);
    setAheadOnly(false);
    setMyAlongKm(null);
    try {
      const from = await geocode(fromText);
      const to = await geocode(toText);
      if (!fresh()) return;
      routeEndsRef.current = { from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng } };
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

      // Overpass can be slow or busy — show Wikipedia landmarks as soon as
      // they're ready and merge the other sources in whenever they arrive.
      const osmPromise = fetchRoadsideStops(samples);
      const googlePromise: Promise<Stop[]> = hasGoogleBackend()
        .then((ok) => (ok ? fetchGooglePlaces(simplify(r.coords, 90)) : []))
        .catch(() => []);
      let wikiStops: Stop[] = [];
      let wikiError = false;
      try {
        wikiStops = enrich(await fetchWikiStops(samples));
      } catch {
        wikiError = true;
      }
      if (!fresh()) return;
      if (wikiStops.length) {
        setStops(wikiStops);
        setBusy(null);
        setNotice('Adding food, viewpoint and rest-stop data…');
      }

      const [googleSettled, osmSettled] = await Promise.allSettled([googlePromise, osmPromise]);
      if (!fresh()) return;
      const googleStops = googleSettled.status === 'fulfilled' ? enrich(googleSettled.value) : [];
      const osmStops = osmSettled.status === 'fulfilled' ? enrich(osmSettled.value) : [];
      const osmError = osmSettled.status === 'rejected';
      if (wikiError && osmError && !googleStops.length) {
        throw new Error('Both place services are unavailable right now — try again in a couple of minutes');
      }
      setStops(mergeStops(mergeStops(wikiStops, googleStops), osmStops));
      if (osmError) {
        setNotice('Live food & rest-stop data (OpenStreetMap) is busy right now — other sources are shown.');
      } else {
        setNotice(wikiError ? 'Wikipedia lookup failed — showing the other stop sources only.' : null);
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
  const planVisitMin = plan.reduce((sum, s) => sum + s.visitMin, 0);

  // When the Google proxy is configured, refresh the trip plan with a
  // traffic-aware total and an optimized stop order (debounced).
  useEffect(() => {
    setTraffic(null);
    const ends = routeEndsRef.current;
    if (!route || !ends || plan.length === 0 || plan.length > 23) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!(await hasGoogleBackend()) || cancelled) return;
      try {
        const res = await fetchGoogleRoute(
          ends.from,
          ends.to,
          plan.map((p) => ({ lat: p.lat, lng: p.lng })),
        );
        if (cancelled) return;
        const orderedIds = res.order ? res.order.map((i) => plan[i]?.id).filter(Boolean) : plan.map((p) => p.id);
        setTraffic({ durationMin: res.durationMin, orderedIds });
      } catch {
        // Proxy or Routes API unavailable — the heuristic estimate stays.
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [plan, route]);

  const planDisplay = useMemo(() => {
    if (!traffic || traffic.orderedIds.length !== plan.length) return plan;
    const byId = new Map(plan.map((p) => [p.id, p]));
    const ordered = traffic.orderedIds.map((id) => byId.get(id)).filter((s): s is Stop => Boolean(s));
    return ordered.length === plan.length ? ordered : plan;
  }, [plan, traffic]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFromText(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
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
              <input
                value={fromText}
                onChange={(e) => setFromText(e.target.value)}
                placeholder="From — city, address or 📍"
              />
              <button type="button" className="geo-btn" title="Use my location" onClick={useMyLocation}>
                📍
              </button>
            </div>
            <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="To — city or address" />
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
                {traffic && (
                  <div className="summary-traffic">
                    🚦 Google, live traffic via your stops: {fmtDur(traffic.durationMin + planVisitMin)} door-to-door
                  </div>
                )}
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
                <h2>
                  Your stops ({plan.length})
                  {traffic && planDisplay !== plan ? ' · optimized order' : ''}
                </h2>
                {planDisplay.map((s) => (
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
                return (
                  <div
                    key={s.id}
                    className={`stop-card${selectedId === s.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="stop-icon" style={{ background: c.color + '26' }}>
                      {c.emoji}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">{s.name}</div>
                      <div className="stop-meta">
                        {s.rating ? `★ ${s.rating.toFixed(1)} · ` : ''}
                        {c.label} · ⏱ {fmtDur(s.visitMin)} · 🚗 {s.detourMin} min detour · km {Math.round(s.alongKm)}
                      </div>
                      {s.description && <div className="stop-desc">{s.description}</div>}
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
