// Weather proxy.
//
// The browser never talks to the forecast provider directly, for three
// reasons. MET Norway require an identifying User-Agent and block requests
// without one, and a browser cannot set that header. Their CORS terms are
// still "under review", so a direct call is not something to build on. And a
// direct call would hand every traveller's IP address and coordinates to a
// third party, which is not what the privacy page promises.
//
// Going through here also means no Content-Security-Policy change: the page
// already allows connect-src 'self'.
//
// Forecasts are keyed on a fixed global grid (see src/lib/weather.ts), so the
// weather for a stretch of road is the same entry for every traveller who
// passes it. That is what makes the cache worth having — unlike user data,
// this is shared by construction.

import { Redis } from '@upstash/redis';
import { cellCentre, parseMetSeries, type WxHour } from '../src/lib/weather';

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const MAX_CELLS = 24;
// Misses fetched per request. The rest come back in `missing` and the client
// leaves those slots blank — protecting this function's execution budget as
// much as MET's servers.
const MAX_FETCH = 12;
const CONCURRENCY = 6;
const CACHE_MIN_S = 600;
const CACHE_MAX_S = 3600;
const CACHE_DEFAULT_S = 1800;
const CELLS_PER_HOUR = 600;

interface Cached {
  /** MET's Last-Modified, replayed as If-Modified-Since on refresh. */
  lm?: string;
  hours: WxHour[];
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function clientIp(req: any): string {
  const real = String(req.headers?.['x-real-ip'] ?? '').trim();
  if (real) return real;
  const fwd = String(req.headers?.['x-forwarded-for'] ?? '');
  return fwd.split(',').pop()?.trim() || 'unknown';
}

// Falls back to a per-instance Map when Redis is absent. Deliberately unlike
// api/community.ts, which 503s without it: community data IS the database,
// whereas weather is merely faster with one. A fork with no Redis still works.
const memo = new Map<string, { at: number; ttl: number; value: Cached }>();

function cacheTtl(res: { headers: { get(name: string): string | null } }): number {
  const expires = res.headers.get('expires');
  if (!expires) return CACHE_DEFAULT_S;
  const secs = Math.round((Date.parse(expires) - Date.now()) / 1000);
  if (!Number.isFinite(secs)) return CACHE_DEFAULT_S;
  return Math.min(CACHE_MAX_S, Math.max(CACHE_MIN_S, secs));
}

async function fetchCell(
  key: string,
  prev: Cached | null,
  ua: string,
): Promise<{ value: Cached; ttl: number } | null> {
  const { lat, lng } = cellCentre(key);
  const headers: Record<string, string> = { 'User-Agent': ua };
  // MET ask for this, and a 304 costs them almost nothing.
  if (prev?.lm) headers['If-Modified-Since'] = prev.lm;

  const res = await fetch(`${MET_URL}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`, { headers });
  const ttl = cacheTtl(res);
  if (res.status === 304 && prev) return { value: prev, ttl };
  if (!res.ok) return null;

  const hours = parseMetSeries(await res.json());
  if (hours.length === 0) return null;
  return { value: { lm: res.headers.get('last-modified') ?? undefined, hours }, ttl };
}

/** Run jobs a few at a time rather than firing two dozen requests at once. */
async function pooled<T>(jobs: Array<() => Promise<T>>, width: number): Promise<T[]> {
  const out: T[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, jobs.length) }, async () => {
      while (i < jobs.length) {
        const mine = i++;
        out[mine] = await jobs[mine]();
      }
    }),
  );
  return out;
}

export default async function handler(req: any, res: any) {
  // The one thing that must be configured. A fork sending Pithop's contact
  // details would be impersonating us, and one sending a generic string gets
  // blocked by MET — so refuse rather than guess.
  const ua = process.env.WEATHER_UA;
  if (!ua) {
    res.status(503).json({ error: 'weather not configured' });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ ok: true }); // availability probe
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  const cells: string[] = Array.isArray(body.cells)
    ? body.cells.filter((k: unknown) => typeof k === 'string' && /^-?\d+,-?\d+$/.test(k)).slice(0, MAX_CELLS)
    : [];
  if (cells.length === 0) {
    res.status(400).json({ error: 'no cells' });
    return;
  }

  const redis = getRedis();

  if (redis) {
    // Counted in cells, not requests: this endpoint is read-heavy where
    // community.ts is write-heavy, so the meaningful unit is work done.
    const rlKey = `wx:rl:${clientIp(req)}`;
    const used = await redis.incrby(rlKey, cells.length);
    if (used === cells.length) await redis.expire(rlKey, 3600);
    if (used > CELLS_PER_HOUR) {
      res.status(429).json({ error: 'weather rate limit' });
      return;
    }
  }

  const keyOf = (k: string) => `wx:v1:${k}`;
  const now = Date.now();
  const known = new Map<string, Cached>();

  if (redis) {
    const hits = await redis.mget<Array<Cached | null>>(...cells.map(keyOf));
    cells.forEach((k, i) => {
      if (hits[i]) known.set(k, hits[i] as Cached);
    });
  } else {
    for (const k of cells) {
      const m = memo.get(k);
      if (m && now - m.at < m.ttl * 1000) known.set(k, m.value);
    }
  }

  const misses = cells.filter((k) => !known.has(k));
  const toFetch = misses.slice(0, MAX_FETCH);

  const fetched = await pooled(
    toFetch.map((k) => async () => {
      try {
        const got = await fetchCell(k, known.get(k) ?? null, ua);
        return [k, got] as const;
      } catch {
        // One cell failing must not sink the whole request.
        return [k, null] as const;
      }
    }),
    CONCURRENCY,
  );

  for (const [k, got] of fetched) {
    if (!got) continue;
    known.set(k, got.value);
    // TTL follows MET's own Expires header, clamped — they ask callers not to
    // poll faster than their model updates.
    if (redis) await redis.set(keyOf(k), got.value, { ex: got.ttl });
    else memo.set(k, { at: now, ttl: got.ttl, value: got.value });
  }

  const out: Record<string, WxHour[]> = {};
  for (const [k, v] of known) out[k] = v.hours;

  // Let the CDN absorb repeat loads of a busy corridor before Redis is asked.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900');
  res.status(200).json({
    cells: out,
    missing: cells.filter((k) => !known.has(k)),
    attribution: 'Weather data from MET Norway',
  });
}
