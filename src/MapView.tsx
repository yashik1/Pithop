import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { RouteResult } from './api/route';
import type { LatLng as LatLngT } from './lib/geo';
import type { Stop } from './types';
import { CATEGORY_MAP, thingsToDo } from './lib/categories';
import { fmtDur } from './lib/format';
import { addTilesWithFailover, tileProviders } from './lib/tiles';
import { hoursStatus, prettyHours } from './lib/hours';
import { catLabel, t, type Lang } from './lib/i18n';

export interface LivePos {
  lat: number;
  lng: number;
  heading?: number | null;
  accuracy?: number;
}

export interface LiveView {
  on: boolean;
  follow: boolean;
  pos: LivePos | null;
  turn: string;
  primary: string;
  primaryMeta: string;
  secondary: string;
  offRoute: boolean;
  voiceOn: boolean;
  onToggleVoice: () => void;
  onRecenter: () => void;
  onEnd: () => void;
  onPan: () => void;
}

interface Props {
  route: RouteResult | null;
  // Non-selected route alternatives, drawn dim behind the active route.
  altRoutes: LatLngT[][];
  stops: Stop[];
  planIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTogglePlan: (id: string) => void;
  communityOn: boolean;
  addArmed: boolean;
  onToggleAdd: () => void;
  onPickPoint: (p: { lat: number; lng: number }) => void;
  pinPreview: { lat: number; lng: number } | null;
  lang: Lang;
  live: LiveView;
}

interface LiveProps {
  planIds: Set<string>;
  onSelect: (id: string) => void;
  onTogglePlan: (id: string) => void;
  addArmed: boolean;
  onPickPoint: (p: { lat: number; lng: number }) => void;
}

// Accept only parseable http(s) URLs, returned re-serialized. External URLs
// must never be string-interpolated into popup HTML — DOM-assign them instead.
function httpUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
  } catch {
    return null;
  }
}

function buildPopup(stop: Stop, live: { current: LiveProps }): HTMLElement {
  const cat = CATEGORY_MAP[stop.category];
  const div = document.createElement('div');
  div.className = 'map-popup';
  // A plain Google Maps deep link for turn-by-turn navigation — no API involved.
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${Number(stop.lat)}%2C${Number(stop.lng)}`;
  div.innerHTML = `
    <div class="p-name"></div>
    ${stop.source === 'community' ? `<div class="p-community">👥 ${t('travellerTip')}</div>` : ''}
    <div class="p-desc"></div>
    ${stop.source === 'community' && stop.by ? '<div class="p-by"></div>' : ''}
    <div class="p-meta">${cat.emoji} ${catLabel(stop.category)}</div>
    <div class="p-meta">⏱ ~${fmtDur(stop.visitMin)} · 🚗 ~${stop.detourMin} min</div>
    ${
      stop.parking
        ? `<div class="p-meta">🅿️ ${
            stop.parking === 'free' ? t('parkFree') : stop.parking === 'paid' ? t('parkPaid') : t('parkNone')
          }</div>`
        : ''
    }
    <div class="p-todo"></div>
    <div class="p-links"><a class="p-link" href="${gmaps}" target="_blank" rel="noreferrer">Google Maps ↗</a></div>
    <button type="button" class="p-add"></button>`;
  div.querySelector('.p-name')!.textContent = stop.name;
  const desc = div.querySelector<HTMLElement>('.p-desc')!;
  if (stop.description) desc.textContent = stop.description;
  else desc.remove();
  div.querySelector('.p-todo')!.textContent = `💡 ${thingsToDo(stop.kind)}`;
  if (stop.hours) {
    // Live open/closed status when the OSM hours parse; raw hours otherwise.
    const hs = hoursStatus(stop.hours);
    const line = document.createElement('div');
    line.className = 'p-meta p-hours';
    line.textContent = hs
      ? `🕐 ${hs.open ? t('hoursOpen') : t('hoursClosed')}${
          hs.open && hs.until ? ` · ${t('hoursUntil', { t: hs.until })}` : ''
        }${!hs.open && hs.opensAt ? ` · ${t('hoursOpens', { t: hs.opensAt })}` : ''}`
      : `🕐 ${prettyHours(stop.hours)}`;
    div.querySelector('.p-todo')!.before(line);
  }
  // Everything URL-shaped from external data (Wikipedia thumbnail/link, OSM
  // website) is validated to http(s) and DOM-assigned — never interpolated
  // into the HTML template above.
  const imgUrl = httpUrl(stop.imageUrl);
  if (imgUrl) {
    const img = document.createElement('img');
    img.className = 'p-img';
    img.src = imgUrl;
    img.alt = '';
    div.prepend(img);
  }
  const links = div.querySelector<HTMLElement>('.p-links')!;
  const wikiUrl = httpUrl(stop.wikiUrl);
  if (wikiUrl) {
    const a = document.createElement('a');
    a.className = 'p-link';
    a.href = wikiUrl;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = `${wikiUrl.includes('wikivoyage') ? 'Wikivoyage' : 'Wikipedia'} ↗`;
    links.append(' · ', a);
  }
  const siteUrl = httpUrl(stop.website);
  if (siteUrl) {
    const site = document.createElement('a');
    site.className = 'p-link';
    site.href = siteUrl;
    site.target = '_blank';
    site.rel = 'noreferrer';
    site.textContent = `🌐 ${t('website')} ↗`;
    links.prepend(site, ' · ');
  }
  if (stop.source === 'community' && stop.by) {
    // textContent (not innerHTML) — the display name is user-controlled.
    div.querySelector('.p-by')!.textContent = `👤 ${t('addedBy', { name: stop.by })}`;
  }
  const btn = div.querySelector<HTMLButtonElement>('.p-add')!;
  btn.textContent = live.current.planIds.has(stop.id) ? `✓ ${t('removeFromTrip')}` : `+ ${t('addToTrip')}`;
  btn.addEventListener('click', () => {
    const wasInPlan = live.current.planIds.has(stop.id);
    live.current.onTogglePlan(stop.id);
    btn.textContent = wasInPlan ? `+ ${t('addToTrip')}` : `✓ ${t('removeFromTrip')}`;
  });
  return div;
}

export function MapView({
  route,
  altRoutes,
  stops,
  planIds,
  selectedId,
  onSelect,
  onTogglePlan,
  communityOn,
  addArmed,
  onToggleAdd,
  onPickPoint,
  pinPreview,
  lang,
  live,
}: Props) {
  void lang; // re-render markers/labels when the language changes
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const liveLayerRef = useRef<L.LayerGroup | null>(null);
  const liveStartedRef = useRef(false);
  const markersRef = useRef(new Map<string, L.CircleMarker>());
  const liveRef = useRef<LiveProps>({ planIds, onSelect, onTogglePlan, addArmed, onPickPoint });
  liveRef.current = { planIds, onSelect, onTogglePlan, addArmed, onPickPoint };
  // Latest live-nav props for the map's own event handlers (e.g. drag-to-pan
  // during a live drive pauses auto-follow).
  const liveNavRef = useRef<LiveView>(live);
  liveNavRef.current = live;

  useEffect(() => {
    const map = L.map(divRef.current!, { preferCanvas: true }).setView([39.5, -98.35], 4);
    // Tiles with failover: Geoapify when a key is set, else OSM — each backed
    // by keyless fallbacks so a blocked/down provider never leaves a blank map.
    addTilesWithFailover(map, tileProviders());
    routeLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current = L.layerGroup().addTo(map);
    liveLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const live = liveRef.current;
      if (live.addArmed) live.onPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    // Dragging the map during a live drive means the user wants to look around —
    // pause auto-follow so we stop yanking the view back to their position.
    map.on('dragstart', () => {
      const nav = liveNavRef.current;
      if (nav.on && nav.follow) nav.onPan();
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!route) return;
    // Alternatives first (underneath), dim and dashed.
    for (const alt of altRoutes) {
      layer.addLayer(
        L.polyline(
          alt.map((c) => [c.lat, c.lng] as [number, number]),
          { color: '#94a3b8', weight: 4, opacity: 0.55, dashArray: '6 8' },
        ),
      );
    }
    const latlngs = route.coords.map((c) => [c.lat, c.lng] as [number, number]);
    const line = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.7 });
    layer.addLayer(line);
    const endpoint = (pos: [number, number], html: string) =>
      L.marker(pos, {
        icon: L.divIcon({ className: 'endpoint', html, iconSize: [28, 28], iconAnchor: [14, 24] }),
      });
    layer.addLayer(endpoint(latlngs[0], '🚩'));
    layer.addLayer(endpoint(latlngs[latlngs.length - 1], '🏁'));
    map.fitBounds(line.getBounds(), { padding: [40, 40] });
  }, [route, altRoutes]);

  useEffect(() => {
    const layer = stopsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const s of stops) {
      const cat = CATEGORY_MAP[s.category];
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 1.5,
        fillColor: cat.color,
        fillOpacity: 0.95,
      });
      marker.bindPopup(() => buildPopup(s, liveRef));
      marker.on('click', () => liveRef.current.onSelect(s.id));
      layer.addLayer(marker);
      markersRef.current.set(s.id, marker);
    }
  }, [stops]);

  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const inPlan = planIds.has(id);
      marker.setStyle({ color: inPlan ? '#111827' : '#ffffff', weight: inPlan ? 2.5 : 1.5 });
      marker.setRadius(inPlan ? 9 : 7);
    }
  }, [planIds, stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const marker = markersRef.current.get(selectedId);
    if (!marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13));
    marker.openPopup();
  }, [selectedId]);

  // Crosshair cursor while picking a spot for a new community place.
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getContainer().style.cursor = addArmed ? 'crosshair' : '';
  }, [addArmed]);

  // Dashed preview ring where the new place will go.
  useEffect(() => {
    const layer = pinLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!pinPreview) return;
    layer.addLayer(
      L.circleMarker([pinPreview.lat, pinPreview.lng], {
        radius: 11,
        color: '#c2419a',
        weight: 2.5,
        dashArray: '4 4',
        fillColor: '#c2419a',
        fillOpacity: 0.25,
      }),
    );
  }, [pinPreview]);

  // Live drive: a pulsing "you are here" dot (with a heading arrow when the
  // device reports one) plus a faint accuracy ring, following the user as they
  // move when auto-follow is on.
  useEffect(() => {
    const layer = liveLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (!live.on || !live.pos) {
      liveStartedRef.current = false;
      return;
    }
    const { lat, lng, heading, accuracy } = live.pos;
    if (accuracy != null && accuracy > 0 && accuracy < 2000) {
      layer.addLayer(
        L.circle([lat, lng], {
          radius: accuracy,
          color: '#2563eb',
          weight: 1,
          opacity: 0.35,
          fillColor: '#2563eb',
          fillOpacity: 0.1,
          interactive: false,
        }),
      );
    }
    const rot =
      heading != null && !Number.isNaN(heading) ? ` style="transform:rotate(${heading}deg)"` : '';
    const arrow = heading != null && !Number.isNaN(heading) ? `<i class="live-arrow"${rot}></i>` : '';
    layer.addLayer(
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'live-icon',
          html: `<span class="live-dot">${arrow}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        interactive: false,
        zIndexOffset: 1000,
      }),
    );
    if (live.follow) {
      if (!liveStartedRef.current) {
        map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
        liveStartedRef.current = true;
      } else {
        map.panTo([lat, lng], { animate: true });
      }
    }
  }, [live.on, live.pos, live.follow]);

  // Travel-direction needle for the compass — the device's heading, shown only
  // while driving live (GPS reports it moving; null when stationary/unsupported).
  const headingDeg =
    live.on && live.pos && live.pos.heading != null && !Number.isNaN(live.pos.heading)
      ? live.pos.heading
      : null;

  return (
    <div className="map">
      <div ref={divRef} className="map-canvas" />
      {/* North-up compass. The map never rotates, so N is always toward the top;
          during a live drive a blue needle shows the direction of travel. */}
      <div className="map-compass" aria-hidden="true">
        <span className="compass-lbl compass-n">N</span>
        <span className="compass-lbl compass-e">E</span>
        <span className="compass-lbl compass-s">S</span>
        <span className="compass-lbl compass-w">W</span>
        <span className="compass-north" />
        {headingDeg != null && (
          <span className="compass-heading" style={{ transform: `rotate(${headingDeg}deg)` }} />
        )}
      </div>
      {live.on && (
        <div className="live-hud">
          <div className="live-info">
            {live.turn && <div className="live-turn">↱ {live.turn}</div>}
            <div className="live-primary">{live.primary}</div>
            {live.primaryMeta && <div className="live-meta">{live.primaryMeta}</div>}
            {live.secondary && <div className="live-secondary">{live.secondary}</div>}
            {live.offRoute && <div className="live-offroute">⚠️ {t('liveOffRoute')}</div>}
          </div>
          <div className="live-actions">
            <button
              type="button"
              className="live-voice"
              aria-label={live.voiceOn ? t('liveVoiceOn') : t('liveVoiceOff')}
              title={live.voiceOn ? t('liveVoiceOn') : t('liveVoiceOff')}
              aria-pressed={live.voiceOn}
              onClick={live.onToggleVoice}
            >
              {live.voiceOn ? '🔊' : '🔇'}
            </button>
            {!live.follow && (
              <button
                type="button"
                className="live-recenter"
                aria-label={t('liveRecenter')}
                title={t('liveRecenter')}
                onClick={live.onRecenter}
              >
                ◎
              </button>
            )}
            <button type="button" className="live-end" onClick={live.onEnd}>
              ✕ {t('liveEnd')}
            </button>
          </div>
        </div>
      )}
      {communityOn && (
        <button type="button" className={`map-add${addArmed ? ' armed' : ''}`} onClick={onToggleAdd}>
          {addArmed ? t('addPlaceArmed') : `📍 ${t('addPlace')}`}
        </button>
      )}
    </div>
  );
}
