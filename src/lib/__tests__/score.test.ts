import { describe, it, expect } from 'vitest';
import {
  pithopScore, verdictFor, isHiddenGem, DEFAULT_PREFS, PERSONALITIES, PERSONALITY_MAP,
  type TripPrefs,
} from '../score';
import type { Stop } from '../../types';

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's1', name: 'Somewhere', lat: 40, lng: -80,
  category: 'views', kind: 'viewpoint', visitMin: 30,
  source: 'osm', offRouteKm: 2, alongKm: 100, detourMin: 8,
  ...over,
});

const prefs = (over: Partial<TripPrefs> = {}): TripPrefs => ({ ...DEFAULT_PREFS, ...over });

describe('pithopScore — determinism', () => {
  it('returns an identical result for identical inputs', () => {
    const s = stop();
    const p = prefs({ personalities: ['scenic'] });
    const runs = Array.from({ length: 25 }, () => pithopScore(s, p).score);
    expect(new Set(runs).size).toBe(1);
  });

  it('is stable across separately constructed but equal inputs', () => {
    const a = pithopScore(stop(), prefs({ personalities: ['nature'] }));
    const b = pithopScore(stop(), prefs({ personalities: ['nature'] }));
    expect(a).toEqual(b);
  });

  it('always lands within 0..100 even for absurd inputs', () => {
    const extremes = [
      pithopScore(stop({ detourMin: 100000, visitMin: 100000 }), prefs()),
      pithopScore(stop({ detourMin: 0, visitMin: 0, imageUrl: 'x', description: 'd', wikiUrl: 'w', source: 'community' }),
        prefs({ personalities: PERSONALITIES.map((p) => p.id), withKids: true, withPets: true })),
    ];
    for (const e of extremes) {
      expect(e.score).toBeGreaterThanOrEqual(0);
      expect(e.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(e.score)).toBe(true);
    }
  });
});

describe('pithopScore — personality influences ranking', () => {
  it('ranks a viewpoint above a diner for a scenic trip, and the reverse for a foodie', () => {
    const view = stop({ id: 'v', category: 'views', kind: 'viewpoint' });
    const food = stop({ id: 'f', category: 'food', kind: 'restaurant', visitMin: 60 });
    const scenic = pithopScore(view, prefs({ personalities: ['scenic'] })).score
      - pithopScore(food, prefs({ personalities: ['scenic'] })).score;
    const foodie = pithopScore(food, prefs({ personalities: ['foodie'] })).score
      - pithopScore(view, prefs({ personalities: ['foodie'] })).score;
    expect(scenic).toBeGreaterThan(0);
    expect(foodie).toBeGreaterThan(0);
  });

  it('every personality promotes at least one of its own categories', () => {
    for (const p of PERSONALITIES) {
      const cat = p.cats[0];
      const onCat = pithopScore(stop({ category: cat, kind: 'x' }), prefs({ personalities: [p.id] })).score;
      const offCat = pithopScore(stop({ category: 'rest', kind: 'fuel' }), prefs({ personalities: [p.id] })).score;
      expect(onCat, `personality ${p.id} should favour ${cat}`).toBeGreaterThan(offCat);
    }
  });

  it('boosts a hidden gem further when Hidden Gems is selected', () => {
    const gem = stop({ source: 'community' });
    const withHidden = pithopScore(gem, prefs({ personalities: ['hidden'] })).score;
    const withoutHidden = pithopScore(gem, prefs({ personalities: ['foodie'] })).score;
    expect(withHidden).toBeGreaterThan(withoutHidden);
  });
});

describe('pithopScore — detour and hours', () => {
  it('scores a shorter detour higher, all else equal', () => {
    const near = pithopScore(stop({ detourMin: 5 }), prefs()).score;
    const far = pithopScore(stop({ detourMin: 40 }), prefs()).score;
    expect(near).toBeGreaterThan(far);
  });

  it('penalises a place that is closed on arrival', () => {
    const eta = new Date('2026-03-10T21:00:00Z'); // a Tuesday evening
    const open = pithopScore(stop({ hours: '24/7' }), prefs(), { eta }).score;
    const shut = pithopScore(stop({ hours: 'Mo-Su 09:00-17:00' }), prefs(), { eta }).score;
    expect(shut).toBeLessThan(open);
  });

  it('treats unknown hours as neutral rather than penalising missing data', () => {
    const eta = new Date('2026-03-10T21:00:00Z');
    const unknown = pithopScore(stop({ hours: undefined }), prefs(), { eta }).score;
    const shut = pithopScore(stop({ hours: 'Mo-Su 09:00-17:00' }), prefs(), { eta }).score;
    expect(unknown).toBeGreaterThan(shut);
  });

  it('reports total extra time as detour plus visit', () => {
    expect(pithopScore(stop({ detourMin: 12, visitMin: 45 }), prefs()).totalExtraMin).toBe(57);
  });
});

describe('verdicts', () => {
  it('calls a great, cheap stop Worth It', () => {
    expect(verdictFor(85, 30, prefs())).toBe('worth');
  });

  it('calls a wildly expensive stop Skip however good it is', () => {
    expect(verdictFor(100, 10_000, prefs())).toBe('skip');
  });

  it('calls a poor stop Skip', () => {
    expect(verdictFor(20, 10, prefs())).toBe('skip');
  });

  it('tolerates a longer detour for a Hidden Gems trip than an efficient one', () => {
    const gemHunter = verdictFor(80, 120, prefs({ personalities: ['hidden'], pace: 'relaxed' }));
    const inAHurry = verdictFor(80, 120, prefs({ pace: 'efficient' }));
    expect(gemHunter).not.toBe('skip');
    expect(inAHurry).toBe('skip');
  });
});

describe('isHiddenGem', () => {
  it('counts traveller submissions and Wikivoyage pages', () => {
    expect(isHiddenGem(stop({ source: 'community' }))).toBe(true);
    expect(isHiddenGem(stop({ wikiUrl: 'https://en.wikivoyage.org/wiki/Somewhere' }))).toBe(true);
  });

  it('never counts fuel or restrooms', () => {
    expect(isHiddenGem(stop({ category: 'rest', kind: 'fuel', source: 'community' }))).toBe(false);
  });

  it('counts a described but unphotographed landmark off the main road', () => {
    expect(isHiddenGem(stop({ source: 'wiki', description: 'An old mill', offRouteKm: 4 }))).toBe(true);
    expect(isHiddenGem(stop({ source: 'wiki', description: 'An old mill', imageUrl: 'x', offRouteKm: 4 }))).toBe(false);
  });
});

describe('reasons', () => {
  it('explains itself without ever exceeding three reasons', () => {
    const r = pithopScore(
      stop({ source: 'community', imageUrl: 'x', description: 'd', detourMin: 3, visitMin: 15 }),
      prefs({ personalities: ['hidden'] }),
    );
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.length).toBeLessThanOrEqual(3);
  });

  it('flags a closed-on-arrival stop in its reasons', () => {
    const r = pithopScore(stop({ hours: 'Mo-Su 09:00-17:00' }), prefs(), { eta: new Date('2026-03-10T21:00:00Z') });
    expect(r.reasons.some((x) => x.code === 'closedOnArrival')).toBe(true);
  });
});

describe('personality table integrity', () => {
  it('has thirteen personalities with unique ids and a lookup entry each', () => {
    expect(PERSONALITIES).toHaveLength(13);
    expect(new Set(PERSONALITIES.map((p) => p.id)).size).toBe(13);
    for (const p of PERSONALITIES) expect(PERSONALITY_MAP[p.id]).toBe(p);
  });
});

describe('isHiddenGem — map-data places', () => {
  it('counts an interesting OSM/Geoapify kind that sits off the highway', () => {
    expect(isHiddenGem(stop({ source: 'geoapify', kind: 'waterfall', offRouteKm: 3 }))).toBe(true);
    expect(isHiddenGem(stop({ source: 'osm', kind: 'viewpoint', offRouteKm: 2 }))).toBe(true);
  });

  it('rejects the same kind when it is right on the road', () => {
    expect(isHiddenGem(stop({ source: 'geoapify', kind: 'waterfall', offRouteKm: 0.2 }))).toBe(false);
  });

  it('never counts everyday roadside infrastructure', () => {
    for (const kind of ['fuel', 'toilets', 'fast_food', 'charging_station']) {
      expect(isHiddenGem(stop({ source: 'geoapify', kind, category: 'rest', offRouteKm: 5 })), kind).toBe(false);
    }
    expect(isHiddenGem(stop({ source: 'geoapify', kind: 'fast_food', category: 'food', offRouteKm: 5 }))).toBe(false);
  });
});
