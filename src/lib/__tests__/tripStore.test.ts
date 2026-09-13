import { describe, it, expect, beforeEach } from 'vitest';
import { mergeRemoteTrips, saveTripToLibrary, listSavedTrips, setRemoteId, type TripData } from '../tripStore';
import type { Stop } from '../../types';

// tripStore talks to localStorage; Vitest's default environment is plain Node,
// so stand one up rather than pulling in a whole DOM.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

const aStop = (): Stop => ({
  id: 'x', name: 'A place', lat: 1, lng: 2, category: 'views', kind: 'viewpoint',
  visitMin: 20, source: 'osm', offRouteKm: 1, alongKm: 10, detourMin: 5,
});

const trip = (label: string, over: Partial<TripData> = {}): TripData => ({
  fromText: 'A', toText: 'B', routeLabel: label,
  route: { coords: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], distanceKm: 100, durationMin: 90 },
  stops: [aStop()], planIds: [],
  ...over,
});

describe('mergeRemoteTrips', () => {
  it('adds server trips that this device has never seen', () => {
    const merged = mergeRemoteTrips([{ ...trip('Austin → Dallas'), remoteId: 'r1', savedAt: 1000 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].routeLabel).toBe('Austin → Dallas');
    expect(merged[0].remoteId).toBe('r1');
  });

  it('lets a newer server copy win over an older local one', () => {
    saveTripToLibrary(trip('Austin → Dallas', { toText: 'local' }));
    const local = listSavedTrips()[0];
    const merged = mergeRemoteTrips([
      { ...trip('Austin → Dallas', { toText: 'server' }), remoteId: 'r1', savedAt: Date.now() + 60_000 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].toText).toBe('server');
    // The local id survives so anything already pointing at this trip still does.
    expect(merged[0].id).toBe(local.id);
  });

  it('keeps a newer local copy but still records where it lives remotely', () => {
    saveTripToLibrary(trip('Austin → Dallas', { toText: 'local' }));
    const merged = mergeRemoteTrips([
      { ...trip('Austin → Dallas', { toText: 'server' }), remoteId: 'r1', savedAt: 1 },
    ]);
    expect(merged[0].toText).toBe('local');
    expect(merged[0].remoteId).toBe('r1');
  });

  it('does not duplicate a trip that exists on both sides', () => {
    saveTripToLibrary(trip('Austin → Dallas'));
    mergeRemoteTrips([{ ...trip('Austin → Dallas'), remoteId: 'r1', savedAt: 500 }]);
    expect(listSavedTrips()).toHaveLength(1);
  });

  it('ignores malformed server rows rather than corrupting the library', () => {
    saveTripToLibrary(trip('Good trip'));
    const merged = mergeRemoteTrips([
      { ...(trip('Broken') as TripData), route: { coords: [], distanceKm: 0, durationMin: 0 }, remoteId: 'r2', savedAt: 9 } as any,
      { ...(trip('Also broken') as TripData), stops: [], remoteId: 'r3', savedAt: 9 } as any,
    ]);
    expect(merged.map((t) => t.routeLabel)).toEqual(['Good trip']);
  });

  it('merges several distinct trips and orders them newest first', () => {
    const merged = mergeRemoteTrips([
      { ...trip('Old one'), remoteId: 'r1', savedAt: 1000 },
      { ...trip('New one'), remoteId: 'r2', savedAt: 5000 },
    ]);
    expect(merged.map((t) => t.routeLabel)).toEqual(['New one', 'Old one']);
  });
});

describe('setRemoteId', () => {
  it('attaches a server id to a locally saved trip', () => {
    saveTripToLibrary(trip('Austin → Dallas'));
    const { id } = listSavedTrips()[0];
    setRemoteId(id, 'r-123');
    expect(listSavedTrips()[0].remoteId).toBe('r-123');
  });

  it('is a no-op for an id that is not in the library', () => {
    saveTripToLibrary(trip('Austin → Dallas'));
    setRemoteId('nope', 'r-123');
    expect(listSavedTrips()[0].remoteId).toBeUndefined();
  });
});
