import { describe, it, expect } from 'vitest';
import { pithopScore, DEFAULT_PREFS } from '../score';
import type { Stop } from '../../types';

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's1', name: 'Somewhere', lat: 40, lng: -80,
  category: 'rest', kind: 'charging_station', visitMin: 30,
  source: 'osm', offRouteKm: 1, alongKm: 100, detourMin: 5,
  ...over,
});

describe('pithopScore — EV preference', () => {
  it('boosts charging stations when ev is on', () => {
    const withEv = pithopScore(stop(), { ...DEFAULT_PREFS, ev: true }).score;
    const without = pithopScore(stop(), { ...DEFAULT_PREFS, ev: false }).score;
    expect(withEv).toBeGreaterThan(without);
  });

  it('emits an evFriendly reason for charging stations when ev is on', () => {
    const r = pithopScore(stop(), { ...DEFAULT_PREFS, ev: true });
    expect(r.reasons.some((x) => x.code === 'evFriendly')).toBe(true);
  });
});
