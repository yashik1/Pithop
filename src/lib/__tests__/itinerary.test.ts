import { describe, it, expect } from 'vitest';
import { buildItinerary, defaultDeparture, type ItineraryOptions } from '../itinerary';
import type { Stop } from '../../types';

// A 600 km / 600 min route: exactly 1 minute per km, which keeps the arithmetic
// in these tests obvious.
const base: ItineraryOptions = {
  departAt: new Date('2026-04-10T08:00:00'),
  dailyDepartMin: 8 * 60,
  maxDriveMinPerDay: 6 * 60,
  totalDistanceKm: 600,
  totalDurationMin: 600,
};

const stop = (id: string, alongKm: number, over: Partial<Stop> = {}): Stop => ({
  id, name: `Stop ${id}`, lat: 1, lng: 2, category: 'views', kind: 'viewpoint',
  visitMin: 30, source: 'osm', offRouteKm: 1, alongKm, detourMin: 0, ...over,
});

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('buildItinerary — timing', () => {
  it('arrives at a stop after exactly its driving time', () => {
    const it = buildItinerary([stop('a', 120)], base);
    expect(hhmm(it.days[0].stops[0].arrive)).toBe('10:00'); // 08:00 + 120 min
    expect(hhmm(it.days[0].stops[0].depart)).toBe('10:30'); // + 30 min visit
  });

  it('carries visit time into every later arrival', () => {
    const it = buildItinerary([stop('a', 60), stop('b', 120)], base);
    const [a, b] = it.days[0].stops;
    expect(hhmm(a.arrive)).toBe('09:00');
    expect(hhmm(b.arrive)).toBe('10:30'); // 09:30 depart + 60 min drive
  });

  it('charges half a detour each way rather than the whole round trip up front', () => {
    const it = buildItinerary([stop('a', 60, { detourMin: 20 })], base);
    expect(it.days[0].stops[0].driveMinFromPrev).toBe(70); // 60 km + 10 min in
  });

  it('reaches the destination after the final leg', () => {
    // Cap lifted so the whole drive fits in one day and the final-leg
    // arithmetic is tested on its own, without a day break moving the clock.
    const it = buildItinerary([stop('a', 100)], { ...base, maxDriveMinPerDay: 24 * 60 });
    // 08:00 +100 drive = 09:40, +30 visit = 10:10, +500 km = 18:30
    expect(hhmm(it.arriveAt)).toBe('18:30');
    expect(it.days).toHaveLength(1);
  });

  it('pushes the run home to the next day when it would blow the cap', () => {
    const it = buildItinerary([stop('a', 100)], base); // 500 km left, 6 h cap
    expect(it.days).toHaveLength(2);
    expect(hhmm(it.arriveAt)).toBe('16:20'); // next morning 08:00 + 500 min
  });

  it('schedules a trip with no stops at all', () => {
    const it = buildItinerary([], base);
    expect(it.days).toHaveLength(1);
    expect(hhmm(it.arriveAt)).toBe('18:00');
    expect(it.totalVisitMin).toBe(0);
  });

  it('orders stops by road position regardless of the order given', () => {
    const it = buildItinerary([stop('c', 300), stop('a', 60), stop('b', 150)], base);
    expect(it.days.flatMap((d) => d.stops.map((s) => s.stop.id))).toEqual(['a', 'b', 'c']);
  });
});

describe('buildItinerary — splitting days', () => {
  it('keeps a short trip to a single day', () => {
    const it = buildItinerary([stop('a', 100), stop('b', 200)], { ...base, totalDistanceKm: 300, totalDurationMin: 300 });
    expect(it.days).toHaveLength(1);
    expect(it.days[0].isFinal).toBe(true);
  });

  it('starts a new day when the cap would be exceeded, resuming next morning', () => {
    // 6 h cap; stops every 200 km on a 600 km route forces a break.
    const it = buildItinerary([stop('a', 200), stop('b', 400)], base);
    expect(it.days.length).toBeGreaterThan(1);
    expect(hhmm(it.days[1].departAt)).toBe('08:00');
    expect(it.days[1].departAt.getDate()).toBe(it.days[0].departAt.getDate() + 1);
  });

  it('never emits a day with no stops just because one leg is long', () => {
    const it = buildItinerary([stop('a', 590)], base); // 9.8 h to the first stop
    expect(it.days[0].stops).toHaveLength(1);
    expect(it.days.every((d) => d.stops.length > 0 || d.isFinal)).toBe(true);
  });

  it('honours an explicit "end the day here" even when the cap is nowhere near', () => {
    // Short route, so the only reason to split is the traveller's own choice.
    const it = buildItinerary([stop('a', 30), stop('b', 60)], {
      ...base, totalDistanceKm: 90, totalDurationMin: 90, dayBreaksAfter: new Set(['a']),
    });
    expect(it.days).toHaveLength(2);
    expect(it.days[0].stops.map((s) => s.stop.id)).toEqual(['a']);
    expect(it.days[1].stops.map((s) => s.stop.id)).toEqual(['b']);
  });

  it('numbers days from zero and marks only the last as final', () => {
    const it = buildItinerary([stop('a', 200), stop('b', 400)], base);
    expect(it.days.map((d) => d.index)).toEqual(it.days.map((_, i) => i));
    expect(it.days.filter((d) => d.isFinal)).toHaveLength(1);
    expect(it.days[it.days.length - 1].isFinal).toBe(true);
  });
});

describe('buildItinerary — warnings', () => {
  it('warns when a place is shut on arrival', () => {
    const it = buildItinerary([stop('a', 600, { hours: 'Mo-Su 09:00-12:00' })], base);
    expect(it.warnings.some((w) => w.code === 'closedOnArrival' && w.stopId === 'a')).toBe(true);
    expect(it.days[0].stops[0].closedOnArrival).toBe(true);
  });

  it('stays quiet about a place that is open when you get there', () => {
    const it = buildItinerary([stop('a', 60, { hours: '24/7' })], base);
    expect(it.warnings.some((w) => w.code === 'closedOnArrival')).toBe(false);
  });

  it('says nothing about hours the place never published', () => {
    const it = buildItinerary([stop('a', 60)], base);
    expect(it.warnings.some((w) => w.code === 'closedOnArrival')).toBe(false);
  });

  it('warns when the trip needs more days than the traveller has', () => {
    const it = buildItinerary([stop('a', 200), stop('b', 400)], { ...base, maxDays: 1 });
    const w = it.warnings.find((x) => x.code === 'needsMoreDays');
    expect(w).toBeDefined();
    expect(w!.value).toBeGreaterThanOrEqual(1);
  });

  it('does not warn when the day count fits', () => {
    const it = buildItinerary([stop('a', 100)], { ...base, maxDays: 3 });
    expect(it.warnings.some((w) => w.code === 'needsMoreDays')).toBe(false);
  });

  it('warns about arriving very late in the evening', () => {
    const it = buildItinerary([], { ...base, departAt: new Date('2026-04-10T12:30:00'), maxDriveMinPerDay: 24 * 60 });
    expect(hhmm(it.arriveAt)).toBe('22:30');
    expect(it.warnings.some((w) => w.code === 'lateArrival')).toBe(true);
  });

  it('warns about an arrival that lands after midnight', () => {
    // 14:00 + 10 h = midnight exactly. Reading only "minutes past midnight"
    // would score this as 00:00 and call it an early arrival.
    const it = buildItinerary([], { ...base, departAt: new Date('2026-04-10T14:00:00'), maxDriveMinPerDay: 24 * 60 });
    expect(it.arriveAt.getDate()).toBe(11);
    expect(it.warnings.some((w) => w.code === 'lateArrival')).toBe(true);
  });

  it('stays quiet about a normal daytime arrival', () => {
    const it = buildItinerary([], { ...base, maxDriveMinPerDay: 24 * 60 });
    expect(it.warnings.some((w) => w.code === 'lateArrival')).toBe(false);
  });

  it('flags an unavoidably over-cap day', () => {
    const it = buildItinerary([], { ...base, maxDriveMinPerDay: 60 });
    expect(it.warnings.some((w) => w.code === 'overDriveCap')).toBe(true);
  });
});

describe('buildItinerary — totals and determinism', () => {
  it('totals visit time across every stop', () => {
    const it = buildItinerary([stop('a', 100, { visitMin: 45 }), stop('b', 300, { visitMin: 15 })], base);
    expect(it.totalVisitMin).toBe(60);
  });

  it('totals driving to roughly the route length', () => {
    const it = buildItinerary([stop('a', 100), stop('b', 300)], base);
    expect(it.totalDriveMin).toBe(600); // no detours, so exactly the route
  });

  it('produces the same schedule every time', () => {
    const plan = [stop('a', 100), stop('b', 300)];
    const runs = Array.from({ length: 10 }, () => JSON.stringify(buildItinerary(plan, base)));
    expect(new Set(runs).size).toBe(1);
  });

  it('survives a zero-length route without dividing by zero', () => {
    const it = buildItinerary([stop('a', 0)], { ...base, totalDistanceKm: 0, totalDurationMin: 0 });
    expect(Number.isNaN(it.arriveAt.getTime())).toBe(false);
    expect(it.totalDriveMin).toBe(0);
  });
});

describe('defaultDeparture', () => {
  it('is the next morning at 08:00', () => {
    const d = defaultDeparture(new Date('2026-04-10T15:30:00'));
    expect(hhmm(d)).toBe('08:00');
    expect(d.getDate()).toBe(11);
  });
});
