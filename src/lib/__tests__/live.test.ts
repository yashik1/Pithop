import { describe, it, expect } from 'vitest';
import { stopsAhead, bestNextStop, projectLivePosition } from '../live';
import type { Stop } from '../../types';
import { DEFAULT_PREFS } from '../score';

const stop = (id: string, alongKm: number, over: Partial<Stop> = {}): Stop => ({
  id,
  name: `Stop ${id}`,
  lat: 40 + alongKm * 0.001,
  lng: -80,
  category: 'views',
  kind: 'viewpoint',
  visitMin: 20,
  source: 'osm',
  offRouteKm: 1,
  alongKm,
  detourMin: 6,
  ...over,
});

describe('stopsAhead', () => {
  it('keeps only stops within the horizon ahead of the traveller', () => {
    const list = [stop('a', 10), stop('b', 50), stop('c', 120), stop('d', 5)];
    const ahead = stopsAhead(list, 40, 80);
    expect(ahead.map((s) => s.id).sort()).toEqual(['b', 'c']);
  });

  it('includes a stop the traveller is essentially at', () => {
    const list = [stop('a', 40.2)];
    expect(stopsAhead(list, 40, 80)).toHaveLength(1);
  });
});

describe('bestNextStop', () => {
  it('returns null when nothing is ahead', () => {
    expect(bestNextStop([stop('a', 10)], 100)).toBeNull();
  });

  it('prefers a higher-scoring stop that is still reasonably close', () => {
    const gem = stop('gem', 55, { source: 'community', imageUrl: 'x', description: 'wow' });
    const plain = stop('plain', 45, { category: 'rest', kind: 'fuel' });
    const next = bestNextStop([gem, plain], 40, DEFAULT_PREFS);
    expect(next?.stop.id).toBe('gem');
  });

  it('skips visited stops', () => {
    const a = stop('a', 50);
    const b = stop('b', 60, { source: 'community', imageUrl: 'x' });
    const next = bestNextStop([a, b], 40, DEFAULT_PREFS, { visitedIds: new Set(['b']) });
    expect(next?.stop.id).toBe('a');
  });
});

describe('projectLivePosition', () => {
  it('projects onto a simple northbound route', () => {
    const route = [
      { lat: 40, lng: -80 },
      { lat: 41, lng: -80 },
      { lat: 42, lng: -80 },
    ];
    const cum = [0, 111, 222];
    const pos = projectLivePosition({ lat: 40.5, lng: -80 }, route, cum);
    expect(pos.offRoute).toBe(false);
    expect(pos.alongKm).toBeGreaterThan(40);
    expect(pos.alongKm).toBeLessThan(70);
  });
});
