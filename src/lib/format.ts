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
