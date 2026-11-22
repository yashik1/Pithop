// Client for the weather proxy (api/weather.ts).
//
// The forecast provider is never called from the browser — see the proxy for
// why. If it is not deployed or has no User-Agent configured, hasWeather()
// resolves false and the app hides weather entirely rather than showing empty
// slots where a forecast should be.

import type { WxCell, WxGrid } from '../lib/weather';

let available: boolean | null = null;

export async function hasWeather(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const res = await fetch('/api/weather');
    // A static host answers an unknown path with the SPA's index.html, so a
    // 200 alone proves nothing — require the JSON handshake.
    available = res.ok && (await res.json()).ok === true;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Forecast timelines for a set of grid cells.
 *
 * Cells the proxy could not reach are simply absent from the result; the
 * caller shows nothing for those rather than guessing from a neighbour.
 */
export async function fetchWeather(cells: WxCell[]): Promise<WxGrid> {
  if (cells.length === 0) return {};
  const res = await fetch('/api/weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells: cells.map((c) => c.k) }),
  });
  if (!res.ok) throw new Error(`Weather lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return (data?.cells ?? {}) as WxGrid;
}
