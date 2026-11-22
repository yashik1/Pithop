import { describe, expect, it } from 'vitest';
import {
  CELL_DEG,
  cellCentre,
  cellFor,
  cellKey,
  feelsLikeC,
  hourAt,
  iconOf,
  kindOf,
  mergeCells,
  parseMetSeries,
  routeCells,
  severity,
  type WxHour,
} from '../weather';
import { cumulativeKm, type LatLng } from '../geo';
import type { Vehicle } from '../vehicle';

const hour = (over: Partial<WxHour> = {}): WxHour => ({
  t: 1764000000, tempC: 12, precipMm: 0, windMs: 2, sym: 'clearsky', night: false, ...over,
});

/** A straight line of coordinates, for building routes in tests. */
const line = (fromLat: number, toLat: number, lng: number, n = 40): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: fromLat + ((toLat - fromLat) * i) / (n - 1), lng }));

describe('the grid', () => {
  // THE point of using a fixed grid rather than sampling each route. Sampling
  // at a fixed spacing makes the points depend on where the route started, so
  // two drives down the same road never share a cache key and every trip pays
  // full price upstream. This is the assertion that keeps that from coming back.
  it('gives two routes down the same corridor identical keys', () => {
    const shared = line(45, 47, 10);
    const fromA = [...line(43, 45, 10), ...shared]; // joins the corridor from the south
    const fromB = [...line(44.5, 45, 11), ...shared]; // joins from elsewhere

    const keysA = new Set(routeCells(fromA, cumulativeKm(fromA), 99).map((c) => c.k));
    const keysB = routeCells(fromB, cumulativeKm(fromB), 99).map((c) => c.k);

    const overlap = keysB.filter((k) => keysA.has(k));
    expect(overlap.length).toBeGreaterThan(5);
  });

  it('floors consistently either side of zero', () => {
    expect(cellKey(0.1, 0.1)).toBe('0,0');
    // -0.1 belongs to the cell BELOW zero, not to cell 0 — Math.floor, not trunc.
    expect(cellKey(-0.1, -0.1)).toBe('-1,-1');
    expect(cellKey(-0.1, -0.1)).not.toBe(cellKey(0.1, 0.1));
  });

  it('puts a point within half a cell of its centre', () => {
    for (const p of [{ lat: 45.3, lng: -73.6 }, { lat: -33.9, lng: 151.2 }, { lat: 0, lng: 0 }]) {
      const c = cellCentre(cellKey(p.lat, p.lng));
      expect(Math.abs(c.lat - p.lat)).toBeLessThanOrEqual(CELL_DEG / 2);
      expect(Math.abs(c.lng - p.lng)).toBeLessThanOrEqual(CELL_DEG / 2);
    }
  });

  it('sends cell centres upstream, never the point it was given', () => {
    const c = cellFor({ lat: 45.3178, lng: -73.6412 }, 0.5);
    expect(c.lat).not.toBe(45.3178);
    expect(c.lng).not.toBe(-73.6412);
  });

  it('keeps route cells in road order and deduped', () => {
    const route = line(45, 48, 10);
    const cells = routeCells(route, cumulativeKm(route), 99);
    expect(new Set(cells.map((c) => c.k)).size).toBe(cells.length);
    const fracs = cells.map((c) => c.frac);
    expect([...fracs].sort((a, b) => a - b)).toEqual(fracs);
  });

  it('thins a long route but keeps the far end, where the destination is', () => {
    const route = line(35, 60, 10, 500);
    const all = routeCells(route, cumulativeKm(route), 999);
    const capped = routeCells(route, cumulativeKm(route), 24);
    expect(all.length).toBeGreaterThan(24);
    expect(capped.length).toBe(24);
    expect(capped[capped.length - 1].k).toBe(all[all.length - 1].k);
  });

  it('merges stop cells in without duplicating the route it already covers', () => {
    const route = line(45, 46, 10);
    const cells = routeCells(route, cumulativeKm(route), 99);
    const onRoute = cellFor(route[2], 0.1); // already covered
    const faraway = cellFor({ lat: 45.5, lng: 14 }, 0.5); // 30 km off-route
    const merged = mergeCells(cells, [onRoute, faraway]);
    expect(merged.length).toBe(cells.length + 1);
    expect(merged.some((c) => c.k === faraway.k)).toBe(true);
  });
});

describe('parseMetSeries', () => {
  const met = (entries: unknown[]) => ({ properties: { timeseries: entries } });
  const entry = (time: string, details: object, block: object) => ({
    time,
    data: { instant: { details: { air_temperature: 8, wind_speed: 3, ...details } }, ...block },
  });

  it('reads an hourly block', () => {
    const out = parseMetSeries(
      met([
        entry('2026-11-22T10:00:00Z', {}, {
          next_1_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 2 } },
        }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].precipMm).toBe(2);
    expect(out[0].sym).toBe('rain');
  });

  // The trap: past roughly two days MET only offers a six-hour block, and its
  // precipitation covers all six. Taken at face value a drizzle reads as a
  // deluge and every threshold fires.
  it('divides a six-hour precipitation total down to an hourly rate', () => {
    const out = parseMetSeries(
      met([
        entry('2026-11-25T10:00:00Z', {}, {
          next_6_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 3 } },
        }),
      ]),
    );
    expect(out[0].precipMm).toBe(0.5); // 3 mm over 6 h, not 3 mm in one
  });

  it('survives a missing gust, which many cells have', () => {
    const out = parseMetSeries(
      met([entry('2026-11-22T10:00:00Z', {}, { next_1_hours: { summary: { symbol_code: 'fair_day' } } })]),
    );
    expect(out[0].gustMs).toBeUndefined();
    expect(out[0].precipMm).toBe(0);
  });

  it('strips the day/night suffix but remembers which it was', () => {
    const out = parseMetSeries(
      met([
        entry('2026-11-22T22:00:00Z', {}, { next_1_hours: { summary: { symbol_code: 'clearsky_night' } } }),
      ]),
    );
    expect(out[0].sym).toBe('clearsky');
    expect(out[0].night).toBe(true);
    expect(iconOf(out[0])).toBe('🌙');
  });

  it('returns nothing rather than throwing on a shape it does not know', () => {
    expect(parseMetSeries(null)).toEqual([]);
    expect(parseMetSeries({ properties: {} })).toEqual([]);
  });
});

describe('hourAt', () => {
  const start = 1764000000;
  const series = Array.from({ length: 48 }, (_, i) => hour({ t: start + i * 3600, tempC: i }));

  it('picks the nearest hour', () => {
    expect(hourAt(series, new Date((start + 5 * 3600 + 600) * 1000))!.tempC).toBe(5);
    expect(hourAt(series, new Date((start + 5 * 3600 + 3000) * 1000))!.tempC).toBe(6);
  });

  // Past the forecast horizon the honest answer is "too far ahead to say",
  // not the last hour on file dressed up as a prediction.
  it('returns null beyond the horizon rather than the last hour it has', () => {
    expect(hourAt(series, new Date((start + 30 * 86400) * 1000))).toBeNull();
  });

  // Past ~2 days MET drops to six-hourly steps, so a 90-minute tolerance would
  // reject every day-three lookup.
  it('widens its tolerance in the six-hourly tail', () => {
    const sparse = [hour({ t: start }), hour({ t: start + 3 * 86400, tempC: 20 })];
    const threeDaysOut = new Date((start + 3 * 86400 + 2 * 3600) * 1000);
    expect(hourAt(sparse, threeDaysOut)?.tempC).toBe(20);
  });

  it('has nothing to say about an empty series', () => {
    expect(hourAt([], new Date())).toBeNull();
  });
});

describe('severity', () => {
  const levels = (h: WxHour, v: Vehicle, speed = 90) => severity(h, v, speed).level;
  const codes = (h: WxHour, v: Vehicle, speed = 90) =>
    severity(h, v, speed).reasons.map((r) => r.code);

  // The invariant that catches every threshold typo at once: an exposed rider
  // is never less concerned than a driver about the same hour.
  it('never rates a two-wheeler below a car for the same conditions', () => {
    const rank = { none: 0, note: 1, caution: 2, warn: 3 };
    for (const tempC of [-5, 0, 2, 8, 20, 36]) {
      for (const precipMm of [0, 0.3, 1.5, 5, 12]) {
        for (const windMs of [1, 9, 14, 22]) {
          for (const sym of ['clearsky', 'rain', 'snow', 'fog', 'thunder']) {
            const h = hour({ tempC, precipMm, windMs, sym });
            const car = rank[levels(h, 'car')];
            expect(rank[levels(h, 'motorcycle')], JSON.stringify(h)).toBeGreaterThanOrEqual(car);
            expect(rank[levels(h, 'bike')], JSON.stringify(h)).toBeGreaterThanOrEqual(car);
          }
        }
      }
    }
  });

  // The exception the invariant above must NOT be extended to cover. A truck is
  // more exposed to crosswind than a car but less exposed to rain and cold than
  // a motorcycle, so this cannot collapse into one "exposure" multiplier.
  it('treats a truck as windier but not wetter or colder', () => {
    const gusty = hour({ windMs: 14, gustMs: 14 });
    expect(levels(gusty, 'truck')).toBe('caution');
    expect(levels(gusty, 'car')).toBe('none');

    const wet = hour({ precipMm: 2, sym: 'rain' });
    expect(levels(wet, 'truck')).toBe('none');
    expect(levels(wet, 'motorcycle')).toBe('caution');

    // 4°C at motorway speed feels like about -5°C on a bike, so the rider gets
    // a warning while the cab gets nothing. That gap is the point.
    const cold = hour({ tempC: 4, windMs: 2 });
    expect(levels(cold, 'truck')).toBe('none');
    expect(levels(cold, 'motorcycle')).toBe('warn');
  });

  it('reads light rain as nothing by car and trouble on two wheels', () => {
    const h = hour({ precipMm: 2, sym: 'rain', tempC: 8 });
    expect(levels(h, 'car')).toBe('none');
    expect(levels(h, 'motorcycle')).toBe('caution');
    expect(levels(h, 'bike')).toBe('caution');
  });

  // 1°C with wet roads is the case the whole feature exists for: a car
  // understeers on ice, a motorcycle falls over.
  it('treats near-freezing wet roads as a warning for a rider', () => {
    const h = hour({ tempC: 1, precipMm: 0.5, sym: 'sleet' });
    expect(codes(h, 'motorcycle')).toContain('ice');
    expect(levels(h, 'motorcycle')).toBe('warn');
    expect(levels(h, 'car')).not.toBe('warn');
  });

  it('counts travel speed in the cold, not just the air temperature', () => {
    // 9°C is mild standing still and cold at speed: ~7°C felt at walking pace,
    // ~3°C at 90 km/h. Nothing but the speed changes between these two.
    const h = hour({ tempC: 9, windMs: 1 });
    expect(levels(h, 'motorcycle', 10)).toBe('none');
    expect(levels(h, 'motorcycle', 90)).toBe('caution');
  });

  it('tires a cyclist in heat that no driver would notice', () => {
    const h = hour({ tempC: 30, sym: 'clearsky' });
    expect(levels(h, 'bike')).toBe('caution');
    expect(levels(h, 'car')).toBe('none');
  });

  it('says nothing at all about a pleasant hour', () => {
    const h = hour({ tempC: 18, precipMm: 0, windMs: 2, sym: 'fair' });
    for (const v of ['car', 'truck', 'motorcycle', 'bike'] as Vehicle[]) {
      expect(severity(h, v, 90)).toEqual({ level: 'none', reasons: [] });
    }
  });

  it('reports codes rather than prose, so the UI can translate them', () => {
    const h = hour({ tempC: 1, precipMm: 3, windMs: 20, sym: 'snow' });
    for (const r of severity(h, 'motorcycle', 90).reasons) {
      expect(typeof r.code).toBe('string');
      expect(r.code).not.toMatch(/\s/);
    }
  });
});

describe('feelsLikeC', () => {
  it('leaves mild weather alone', () => {
    expect(feelsLikeC(18, 3, 90, 110)).toBe(18);
  });

  it('bites hard at speed near freezing', () => {
    expect(feelsLikeC(5, 0, 90, 110)).toBeLessThan(0);
  });

  it('caps the speed, so a cyclist is not treated as doing 110', () => {
    expect(feelsLikeC(5, 0, 200, 35)).toBeGreaterThan(feelsLikeC(5, 0, 200, 110));
  });
});

describe('kindOf', () => {
  it('maps the codes that change what a rider should do', () => {
    expect(kindOf('heavysnow')).toBe('heavysnow');
    expect(kindOf('lightrainshowers')).toBe('showers');
    expect(kindOf('rainandthunder')).toBe('thunder'); // thunder outranks the rain
    expect(kindOf('fog')).toBe('fog');
    expect(kindOf('clearsky')).toBe('clear');
  });
});
