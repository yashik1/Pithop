import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { RouteResult } from './api/route';
import type { Stop } from './types';
import { CATEGORY_MAP, thingsToDo } from './lib/categories';
import { fmtDur } from './lib/format';
import { geoapifyTileLayer, hasGeoapify } from './api/geoapify';

interface Props {
  route: RouteResult | null;
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
}

interface LiveProps {
  planIds: Set<string>;
  onSelect: (id: string) => void;
  onTogglePlan: (id: string) => void;
  addArmed: boolean;
  onPickPoint: (p: { lat: number; lng: number }) => void;
}

function buildPopup(stop: Stop, live: { current: LiveProps }): HTMLElement {
  const cat = CATEGORY_MAP[stop.category];
  const div = document.createElement('div');
  div.className = 'map-popup';
  // A plain Google Maps deep link for turn-by-turn navigation — no API involved.
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${stop.lat}%2C${stop.lng}`;
  const img = stop.imageUrl ? `<img class="p-img" src="${stop.imageUrl}" alt="" />` : '';
  const wiki = stop.wikiUrl
    ? ` · <a class="p-link" href="${stop.wikiUrl}" target="_blank" rel="noreferrer">Wikipedia ↗</a>`
    : '';
  div.innerHTML = `
    ${img}
    <div class="p-name"></div>
    ${stop.source === 'community' ? '<div class="p-community">👥 Traveller tip</div>' : ''}
    <div class="p-desc"></div>
    <div class="p-meta">${cat.emoji} ${cat.label}</div>
    <div class="p-meta">⏱ ~${fmtDur(stop.visitMin)} visit · 🚗 ~${stop.detourMin} min off route</div>
    <div class="p-todo"></div>
    <div class="p-links"><a class="p-link" href="${gmaps}" target="_blank" rel="noreferrer">Open in Google Maps ↗</a>${wiki}</div>
    <button type="button" class="p-add"></button>`;
  div.querySelector('.p-name')!.textContent = stop.name;
  const desc = div.querySelector<HTMLElement>('.p-desc')!;
  if (stop.description) desc.textContent = stop.description;
  else desc.remove();
  div.querySelector('.p-todo')!.textContent = `💡 ${thingsToDo(stop.kind)}`;
  const btn = div.querySelector<HTMLButtonElement>('.p-add')!;
  btn.textContent = live.current.planIds.has(stop.id) ? '✓ Added — remove' : '+ Add to trip';
  btn.addEventListener('click', () => {
    const wasInPlan = live.current.planIds.has(stop.id);
    live.current.onTogglePlan(stop.id);
    btn.textContent = wasInPlan ? '+ Add to trip' : '✓ Added — remove';
  });
  return div;
}

export function MapView({
  route,
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
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, L.CircleMarker>());
  const liveRef = useRef<LiveProps>({ planIds, onSelect, onTogglePlan, addArmed, onPickPoint });
  liveRef.current = { planIds, onSelect, onTogglePlan, addArmed, onPickPoint };

  useEffect(() => {
    const map = L.map(divRef.current!, { preferCanvas: true }).setView([39.5, -98.35], 4);
    // Geoapify tiles (commercial-use OK, needs attribution) when a key is
    // configured; the donation-funded OSM public tiles otherwise.
    const tiles = hasGeoapify()
      ? geoapifyTileLayer()
      : {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        };
    L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const live = liveRef.current;
      if (live.addArmed) live.onPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
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
  }, [route]);

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

  return (
    <div className="map">
      <div ref={divRef} className="map-canvas" />
      {communityOn && (
        <button type="button" className={`map-add${addArmed ? ' armed' : ''}`} onClick={onToggleAdd}>
          {addArmed ? 'Tap the map where the place is — or cancel ✕' : '📍 Add a place'}
        </button>
      )}
    </div>
  );
}
