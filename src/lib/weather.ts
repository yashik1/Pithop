// Weather along a route.
//
// Forecast for the time the traveller will actually be somewhere, not weather
// now — a trip usually starts tomorrow morning.
//
// WHY A FIXED GLOBAL GRID
// Positions are snapped to 0.25° cells (~25 km) rather than sampled per trip.
// Sampling a route at a fixed spacing seems natural but defeats the cache it
// feeds: the sample positions depend on where the route *started*, so two
// drives down the same motorway from different origins never share a key.
// Cells are a property of the map instead, so a popular corridor is warm for
// everyone, and a forecast fetched for one traveller serves the next.
//
// Everything here is pure, so it can be tested. The network half lives in
// api/weather.ts, which cannot be (tsconfig covers only src/).

import type { LatLng } from './geo';
import type { Vehicle } from './vehicle';

/** Grid resolution. ~28 km of latitude; less of longitude away from the
 *  equator, which is fine — weather does not need finer than this, and a
 *  smaller cell would cut the cache hit rate for no real accuracy. */
export const CELL_DEG = 0.25;

export interface WxCell {
  /** Grid key — also the cache key suffix. */
  k: string;
  /** Cell centre. This is what goes upstream, never the traveller's own point. */
  lat: number;
  lng: number;
  /** Where the route first enters this cell, as a fraction of the geometry. */
  frac: number;
}

export function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEG)},${Math.floor(lng / CELL_DEG)}`;
}

export function cellCentre(k: string): LatLng {
  const [i, j] = k.split(',').map(Number);
  return { lat: (i + 0.5) * CELL_DEG, lng: (j + 0.5) * CELL_DEG };
}

/** The cell holding one point — a planned stop, or the destination. */
export function cellFor(p: LatLng, frac: number): WxCell {
  const k = cellKey(p.lat, p.lng);
  return { k, ...cellCentre(k), frac };
}

/**
 * Cells the route passes through, in road order, deduped.
 *
 * Above `max` the list is thinned evenly. That does reintroduce some
 * dependence on the origin, but only on very long routes, and the alternative
 * — a coarser grid — would cost accuracy on every trip to fix the tail.
 */
export function routeCells(route: LatLng[], cum: number[], max = 24): WxCell[] {
  if (route.length === 0) return [];
  const total = cum[cum.length - 1] || 1;
  const out: WxCell[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < route.length; i++) {
    const k = cellKey(route[i].lat, route[i].lng);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ k, ...cellCentre(k), frac: Math.min(1, (cum[i] ?? 0) / total) });
  }
  if (out.length <= max) return out;
  const step = out.length / max;
  const thinned: WxCell[] = [];
  for (let i = 0; i < max; i++) thinned.push(out[Math.floor(i * step)]);
  // Always keep the far end: that is where the destination forecast comes from.
  if (thinned[thinned.length - 1].k !== out[out.length - 1].k) {
    thinned[thinned.length - 1] = out[out.length - 1];
  }
  return thinned;
}

/** Merge route cells with the cells planned stops and the destination fall in,
 *  deduped by key. A stop can sit 30 km off-route, and reading its weather off
 *  a motorway cell is how you tell somebody it is dry at a mountain lake. */
export function mergeCells(...groups: WxCell[][]): WxCell[] {
  const byKey = new Map<string, WxCell>();
  for (const g of groups) {
    for (const c of g) if (!byKey.has(c.k)) byKey.set(c.k, c);
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Forecast data
// ---------------------------------------------------------------------------

export type WxKind =
  | 'clear' | 'fair' | 'partlycloudy' | 'cloudy' | 'fog' | 'drizzle'
  | 'rain' | 'heavyrain' | 'showers' | 'sleet' | 'snow' | 'heavysnow' | 'thunder';

/** One hour at one cell. */
export interface WxHour {
  /** Epoch seconds, start of the hour. */
  t: number;
  tempC: number;
  /** Millimetres for this hour. Six-hourly data upstream is divided down. */
  precipMm: number;
  windMs: number;
  /** Absent at many cells and hours — never assume it is there. */
  gustMs?: number;
  fogPct?: number;
  uv?: number;
  /** MET symbol code with any _day/_night suffix stripped. */
  sym: string;
  night: boolean;
}

export type WxGrid = Record<string, WxHour[]>;

// Derived from the code string rather than enumerating MET's ~90 symbols:
// cheaper, and it keeps working when they add one.
export const isWet = (sym: string) => /rain|showers|drizzle|sleet/.test(sym);
export const isFrozen = (sym: string) => /snow|sleet/.test(sym);
export const isThunder = (sym: string) => /thunder/.test(sym);

export function kindOf(sym: string): WxKind {
  if (isThunder(sym)) return 'thunder';
  if (/heavysnow/.test(sym)) return 'heavysnow';
  if (/snow/.test(sym)) return 'snow';
  if (/sleet/.test(sym)) return 'sleet';
  if (/heavyrain/.test(sym)) return 'heavyrain';
  if (/showers/.test(sym)) return 'showers';
  if (/rain/.test(sym)) return 'rain';
  if (/drizzle/.test(sym)) return 'drizzle';
  if (/fog/.test(sym)) return 'fog';
  if (/cloudy/.test(sym)) return 'cloudy';
  if (/partlycloudy/.test(sym)) return 'partlycloudy';
  if (/fair/.test(sym)) return 'fair';
  return 'clear';
}

const ICONS: Record<WxKind, string> = {
  clear: '☀️', fair: '🌤️', partlycloudy: '⛅', cloudy: '☁️', fog: '🌫️',
  drizzle: '🌦️', rain: '🌧️', heavyrain: '🌧️', showers: '🌦️',
  sleet: '🌨️', snow: '🌨️', heavysnow: '❄️', thunder: '⛈️',
};

export function iconOf(h: WxHour): string {
  const kind = kindOf(h.sym);
  if (h.night && (kind === 'clear' || kind === 'fair')) return '🌙';
  return ICONS[kind];
}

/**
 * MET locationforecast JSON into one cell's timeline.
 *
 * Tolerant on purpose: the shape thins out with distance. `next_1_hours` only
 * covers roughly the first two days; past that only `next_6_hours` exists, and
 * **its precipitation covers six hours**, so it is divided down to keep
 * precipMm an hourly rate. Without that, a drizzle on day three reads as a
 * deluge and every severity threshold fires.
 */
export function parseMetSeries(json: unknown): WxHour[] {
  const ts = (json as any)?.properties?.timeseries;
  if (!Array.isArray(ts)) return [];
  const out: WxHour[] = [];
  for (const entry of ts) {
    const t = Date.parse(entry?.time);
    const inst = entry?.data?.instant?.details;
    if (!Number.isFinite(t) || !inst) continue;

    const h1 = entry?.data?.next_1_hours;
    const h6 = entry?.data?.next_6_hours;
    const block = h1 ?? h6;
    const over = h1 ? 1 : 6;
    const precip = block?.details?.precipitation_amount;

    const symRaw: string = block?.summary?.symbol_code ?? '';
    const night = /_night$/.test(symRaw);

    out.push({
      t: Math.floor(t / 1000),
      tempC: Number(inst.air_temperature),
      precipMm: Number.isFinite(precip) ? Number(precip) / over : 0,
      windMs: Number(inst.wind_speed ?? 0),
      gustMs: Number.isFinite(inst.wind_speed_of_gust) ? Number(inst.wind_speed_of_gust) : undefined,
      fogPct: Number.isFinite(inst.fog_area_fraction) ? Number(inst.fog_area_fraction) : undefined,
      uv: Number.isFinite(inst.ultraviolet_index_clear_sky)
        ? Number(inst.ultraviolet_index_clear_sky)
        : undefined,
      sym: symRaw.replace(/_(day|night|polartwilight)$/, ''),
      night,
    });
  }
  return out;
}

/**
 * The forecast nearest a given time, or null when it falls outside coverage.
 *
 * Returning null matters: MET reaches about nine days, and past that the
 * honest answer is "too far ahead to say" rather than the last hour on file.
 * The default tolerance widens automatically in the six-hourly tail.
 */
export function hourAt(hours: WxHour[], at: Date, toleranceMin?: number): WxHour | null {
  if (hours.length === 0) return null;
  const want = Math.floor(at.getTime() / 1000);
  let best: WxHour | null = null;
  let bestGap = Infinity;
  for (const h of hours) {
    const gap = Math.abs(h.t - want);
    if (gap < bestGap) {
      bestGap = gap;
      best = h;
    }
  }
  if (!best) return null;
  // Past roughly two days MET drops to six-hourly steps, so a strict tolerance
  // would reject every later lookup.
  const twoDays = hours[0].t + 2 * 86400;
  const tol = (toleranceMin ?? (best.t > twoDays ? 240 : 90)) * 60;
  return bestGap <= tol ? best : null;
}

// ---------------------------------------------------------------------------
// How much it matters, which depends on how you are travelling
// ---------------------------------------------------------------------------

export type WxLevel = 'none' | 'note' | 'caution' | 'warn';

export type WxReason =
  | 'ice' | 'snow' | 'rain' | 'wind' | 'fog' | 'thunder' | 'cold' | 'heat' | 'uv';

export interface WxVerdict {
  level: WxLevel;
  /** Codes, never prose — the UI translates them and the tests assert them. */
  reasons: Array<{ code: WxReason; level: WxLevel }>;
}

const RANK: Record<WxLevel, number> = { none: 0, note: 1, caution: 2, warn: 3 };
const worst = (a: WxLevel, b: WxLevel) => (RANK[a] >= RANK[b] ? a : b);

/**
 * Thresholds per vehicle.
 *
 * A table rather than one "exposure" multiplier, because the ordering is not
 * uniform: a truck needs a LOWER wind threshold than a car, because crosswind
 * on a high-sided vehicle is the hazard, but a HIGHER rain and cold threshold,
 * because it is still a cab. A single scalar gets one of those backwards.
 *
 * Two-wheelers treat 3°C as freezing, not 0°C: MET reports air temperature two
 * metres up, while bridge decks and shaded cuttings ice over above it. A car
 * on ice understeers; a motorcycle falls over.
 */
interface Thresholds {
  /** Below this, wet roads are treated as icy. */
  iceC: number;
  /** mm/h at which rain becomes a caution, then a warning. */
  rain: [number, number];
  /** Gust m/s for caution, then warning. */
  gust: [number, number];
  /** Sustained wind m/s — only matters where it is the rider doing the work. */
  wind?: [number, number];
  snow: WxLevel;
  fog: WxLevel;
  thunder: WxLevel;
  /** °C felt (wind chill included) for caution, then warning. */
  cold?: [number, number];
  heat: [number, number];
  /** Exposed to the weather, so wind chill applies. */
  exposed: boolean;
  /** Speed cap used for wind chill — a cyclist is not doing 110. */
  chillCapKmh: number;
}

const T: Record<Vehicle, Thresholds> = {
  car: {
    iceC: 0, rain: [4, 10], gust: [17, 25], snow: 'note', fog: 'caution',
    thunder: 'note', heat: [35, 99], exposed: false, chillCapKmh: 0,
  },
  truck: {
    // Lower wind, higher everything else: crosswind is the truck hazard.
    iceC: 0, rain: [4, 10], gust: [13, 20], snow: 'caution', fog: 'caution',
    thunder: 'caution', heat: [35, 99], exposed: false, chillCapKmh: 0,
  },
  motorcycle: {
    iceC: 3, rain: [1, 4], gust: [11, 17], snow: 'warn', fog: 'warn',
    thunder: 'warn', cold: [5, 0], heat: [35, 99], exposed: true, chillCapKmh: 110,
  },
  bike: {
    iceC: 3, rain: [0.5, 2.5], gust: [15, 99], wind: [8, 12], snow: 'warn',
    fog: 'warn', thunder: 'warn', cold: [0, -5], heat: [28, 33],
    exposed: true, chillCapKmh: 35,
  },
};

/** Wind chill (JAG/TI), valid at low temperature and real airflow. The wind a
 *  rider feels is their own speed plus the weather's. */
export function feelsLikeC(tempC: number, windMs: number, speedKmh: number, capKmh: number): number {
  const v = Math.min(speedKmh, capKmh) + windMs * 3.6;
  if (tempC > 10 || v <= 4.8) return tempC;
  const p = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * p + 0.3965 * tempC * p;
}

/** How much this hour matters to this traveller. Pure. */
export function severity(h: WxHour, vehicle: Vehicle, speedKmh: number): WxVerdict {
  const t = T[vehicle];
  const reasons: Array<{ code: WxReason; level: WxLevel }> = [];
  const add = (code: WxReason, level: WxLevel) => {
    if (level !== 'none') reasons.push({ code, level });
  };

  // Ice first: it outranks everything else it coincides with.
  if (h.tempC <= t.iceC && h.precipMm > 0.1) {
    add('ice', t.exposed ? 'warn' : h.tempC <= 0 ? 'caution' : 'note');
  }

  if (isFrozen(h.sym)) add('snow', h.precipMm > 1 ? worst(t.snow, 'caution') : t.snow);
  else if (isWet(h.sym) || h.precipMm > 0) {
    if (h.precipMm >= t.rain[1]) add('rain', 'warn');
    else if (h.precipMm >= t.rain[0]) add('rain', 'caution');
  }

  const gust = h.gustMs ?? h.windMs * 1.5;
  if (gust >= t.gust[1]) add('wind', 'warn');
  else if (gust >= t.gust[0]) add('wind', 'caution');
  if (t.wind) {
    if (h.windMs >= t.wind[1]) add('wind', 'warn');
    else if (h.windMs >= t.wind[0]) add('wind', 'caution');
  }

  if (kindOf(h.sym) === 'fog' || (h.fogPct ?? 0) >= 0.4) add('fog', t.fog);
  if (isThunder(h.sym)) add('thunder', t.thunder);

  if (t.cold && t.exposed) {
    const felt = feelsLikeC(h.tempC, h.windMs, speedKmh, t.chillCapKmh);
    if (felt <= t.cold[1]) add('cold', 'warn');
    else if (felt <= t.cold[0]) add('cold', 'caution');
  }

  if (h.tempC >= t.heat[1]) add('heat', 'warn');
  else if (h.tempC >= t.heat[0]) add('heat', vehicle === 'bike' ? 'caution' : 'note');

  if (vehicle === 'bike' && (h.uv ?? 0) >= 7) add('uv', 'note');

  return { level: reasons.reduce((acc, r) => worst(acc, r.level), 'none' as WxLevel), reasons };
}
