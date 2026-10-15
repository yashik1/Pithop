import { describe, it, expect } from 'vitest';
import {
  googleMapsMultiStopUrl,
  appleMapsMultiStopUrl,
  buildSharePayload,
  planAsVias,
  shareTripUrl,
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
    // Read back through searchParams rather than matching the raw string:
    // URLSearchParams percent-encodes the commas as %2C, which Google decodes
    // perfectly well, so asserting the literal text tested the encoding rather
    // than the link.
    const p = new URL(url).searchParams;
    expect(p.get('origin')).toBe('40,-80');
    expect(p.get('destination')).toBe('42,-79');
    expect(p.get('waypoints')).toBe('41,-79.5');
    expect(p.get('travelmode')).toBe('driving');
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

// This is the function App.tsx calls when someone taps Share, and the encoder
// now lives here while its decoder (parseShareHash) stays in App.tsx — so these
// guard the contract between the two.
describe('shareTripUrl', () => {
  const trip = { fromText: 'Austin', toText: 'Dallas', plan: [stop('a', 30.2, -97.7, 50)] };

  it('puts the trip in the fragment, where it never reaches the server', () => {
    const url = new URL(shareTripUrl({ ...trip, base: 'https://pithop.com/' }));
    expect(url.search).toBe('');
    expect(url.hash.startsWith('#trip=')).toBe(true);
  });

  // parseShareHash captures the payload with [^&]+, so anything outside the
  // base64 alphabet would silently truncate the trip on the way back in.
  it('encodes to characters the decoder can capture whole', () => {
    const url = shareTripUrl({
      ...trip,
      viaTexts: ['Smith & Sons'],
      base: 'https://pithop.com/',
    });
    expect(url.slice(url.indexOf('#trip=') + 6)).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  // btoa throws on anything outside Latin-1, so the percent-escape has to come
  // first. Without that order, sharing a trip through Kyoto or Athens crashes.
  it('survives place names outside Latin-1', () => {
    const url = shareTripUrl({
      fromText: '東京',
      toText: 'Αθήνα',
      plan: [{ ...stop('a', 35, 135, 10), name: '清水寺 — 🏯' }],
      base: 'https://pithop.com/',
    });
    const data = JSON.parse(decodeURIComponent(atob(url.split('#trip=')[1])));
    expect(data.f).toBe('東京');
    expect(data.t).toBe('Αθήνα');
    expect(data.p[0].n).toBe('清水寺 — 🏯');
  });
});

describe('planAsVias', () => {
  it('returns stops sorted by alongKm', () => {
    const vias = planAsVias([stop('b', 1, 1, 80), stop('a', 2, 2, 20)]);
    expect(vias[0]).toEqual({ lat: 2, lng: 2 });
    expect(vias[1]).toEqual({ lat: 1, lng: 1 });
  });
});
