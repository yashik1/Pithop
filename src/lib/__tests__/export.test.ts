import { describe, it, expect } from 'vitest';
import {
  googleMapsMultiStopUrl,
  appleMapsMultiStopUrl,
  buildSharePayload,
  planAsVias,
} from '../export';
import type { Stop } from '../../types';

const stop = (id: string, lat: number, lng: number, alongKm: number): Stop => ({
  id,
  name: `Stop ${id}`,
  lat,
  lng,
  category: 'fun',
  kind: 'attraction',
  visitMin: 30,
  source: 'osm',
  offRouteKm: 1,
  alongKm,
  detourMin: 8,
});

describe('googleMapsMultiStopUrl', () => {
  it('includes origin, destination and waypoints', () => {
    const url = googleMapsMultiStopUrl(
      { lat: 40, lng: -80 },
      { lat: 42, lng: -79 },
      [{ lat: 41, lng: -79.5 }],
    );
    expect(url).toContain('origin=40,-80');
    expect(url).toContain('destination=42,-79');
    expect(url).toContain('waypoints=41,-79.5');
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
  });
});

describe('appleMapsMultiStopUrl', () => {
  it('builds an Apple Maps directions link', () => {
    const url = appleMapsMultiStopUrl({ lat: 40, lng: -80 }, { lat: 42, lng: -79 });
    expect(url).toContain('maps.apple.com');
    expect(url).toContain('saddr=40,-80');
    expect(url).toContain('daddr=42,-79');
  });
});

describe('buildSharePayload', () => {
  it('round-trips through atob/JSON', () => {
    const hash = buildSharePayload({
      fromText: 'Austin',
      toText: 'Dallas',
      viaTexts: ['Waco'],
      plan: [stop('a', 30.2, -97.7, 50)],
    });
    const data = JSON.parse(decodeURIComponent(atob(hash)));
    expect(data.f).toBe('Austin');
    expect(data.t).toBe('Dallas');
    expect(data.w).toEqual(['Waco']);
    expect(data.p).toHaveLength(1);
    expect(data.p[0].n).toBe('Stop a');
  });
});

describe('planAsVias', () => {
  it('returns stops sorted by alongKm', () => {
    const vias = planAsVias([stop('b', 1, 1, 80), stop('a', 2, 2, 20)]);
    expect(vias[0]).toEqual({ lat: 2, lng: 2 });
    expect(vias[1]).toEqual({ lat: 1, lng: 1 });
  });
});
