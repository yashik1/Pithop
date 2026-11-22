// Distance-unit preference (km / mi), persisted in localStorage. Defaults from
// the browser locale on first visit.

import { defaultUnits, type Units } from './format';

const KEY = 'sq-units';

export function getUnits(): Units {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'km' || v === 'mi') return v;
  } catch {
    // fall through to locale default
  }
  return defaultUnits();
}

export function setUnits(u: Units): void {
  try {
    localStorage.setItem(KEY, u);
  } catch {
    // Storage blocked — the choice just won't persist.
  }
}

// Temperature preference (°C / °F), stored separately from distance because
// the two genuinely differ by region — the UK reads miles and Celsius.

import { defaultTempUnit, type TempUnit } from './format';

const TEMP_KEY = 'sq-temp';

export function getTempUnit(): TempUnit {
  try {
    const v = localStorage.getItem(TEMP_KEY);
    if (v === 'c' || v === 'f') return v;
  } catch {
    // fall through to locale default
  }
  return defaultTempUnit();
}

export function setTempUnit(u: TempUnit): void {
  try {
    localStorage.setItem(TEMP_KEY, u);
  } catch {
    // Storage blocked — the choice just won't persist.
  }
}
