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
