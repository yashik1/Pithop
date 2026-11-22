export function fmtDur(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
}

export type Units = 'km' | 'mi';

const KM_PER_MI = 1.60934;

// Default to miles for locales that use them (US, UK, Liberia, Myanmar),
// else kilometres. Persisted choice overrides this.
export function defaultUnits(): Units {
  try {
    const locale = (navigator.language || '').toLowerCase();
    return /(^|-)(us|gb|uk|lr|mm)\b/.test(locale) ? 'mi' : 'km';
  } catch {
    return 'km';
  }
}

// A distance value stored in km, formatted in the chosen units with a label.
export function fmtDist(km: number, units: Units): string {
  const v = units === 'mi' ? km / KM_PER_MI : km;
  return `${Math.round(v)} ${units}`;
}

// Bare number (no unit label) — for "km 47 along the route" style position.
export function distValue(km: number, units: Units): number {
  return Math.round(units === 'mi' ? km / KM_PER_MI : km);
}

// ---------------------------------------------------------------------------
// Temperature. Deliberately a separate axis from `Units` above: that preference
// maps the UK to miles, and the UK uses Celsius, so deriving one from the other
// is wrong for a large share of travellers.
// ---------------------------------------------------------------------------

export type TempUnit = 'c' | 'f';

// Fahrenheit is the United States and a handful of territories that follow it.
// The UK is deliberately absent despite using miles — that is the whole reason
// this is not derived from `defaultUnits()`.
const FAHRENHEIT_LOCALES = /(^|-)(us|bs|bz|ky|fm|gu|mh|pw|pr|vi)\b/;

export function defaultTempUnit(): TempUnit {
  try {
    return FAHRENHEIT_LOCALES.test((navigator.language || '').toLowerCase()) ? 'f' : 'c';
  } catch {
    return 'c';
  }
}

/** A Celsius value formatted in the traveller's preference. Whole degrees, as
 *  fmtDist uses whole units — a tenth of a degree is noise on a forecast. */
export function fmtTemp(c: number, unit: TempUnit): string {
  const v = unit === 'f' ? c * 1.8 + 32 : c;
  return `${Math.round(v)}°`;
}

/** Speed follows the DISTANCE preference, unlike temperature: someone reading
 *  miles wants mph. */
export function fmtSpeed(kmh: number, units: Units): string {
  return units === 'mi' ? `${Math.round(kmh / KM_PER_MI)} mph` : `${Math.round(kmh)} km/h`;
}

/** Wall-clock time, in the viewer's locale. Gathers up the identical
 *  toLocaleTimeString call that had been written out in three places. */
export function clockTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
