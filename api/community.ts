// Community places — traveller-submitted stops shared with every user.
// Storage is Upstash Redis (Vercel Marketplace, free tier): one hash of
// stops, one hash of report counters, and per-IP rate-limit counters.
// A single HGETALL per search keeps the command budget tiny; if the dataset
// ever outgrows that (thousands of places), switch to Redis GEO commands.
//
// Without the Redis env vars the handler answers 503 and the client hides
// the whole feature, so forks and local dev keep working.

import { Redis } from '@upstash/redis';

const STOPS_KEY = 'community:stops';
const REPORTS_KEY = 'community:reports';
const HIDE_AT_REPORTS = 3;
const MAX_POINTS = 60;
const RADIUS_KM = 12;
const MAX_RESULTS = 500;
const DAILY_SUBMISSIONS_PER_IP = 10;
const CATEGORIES = ['fun', 'views', 'nature', 'history', 'museums', 'food', 'rest'];
const VISIT_OPTIONS = [15, 30, 60, 120];
const PARKING_OPTIONS = ['free', 'paid', 'none'];

interface CommunityRecord {
  name: string;
  note: string;
  category: string;
  visitMin: number;
  parking?: string;
  lat: number;
  lng: number;
  createdAt: number;
  // Contributor attribution + moderation id (uid never sent to clients).
  by?: string;
  uid?: string;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// First name + initial from the verified identity, for public attribution.
function attribution(user: any): string {
  const full: string = (user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '').trim();
  if (full) {
    const parts = full.split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
  }
  const local = String(user?.email ?? '').split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Traveller';
}

const AUTH_ENABLED = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

// Verify a Supabase access token by asking Supabase who it belongs to. Returns
// null on any failure. No server SDK needed — one authenticated GET.
async function verifyUser(authHeader: string | undefined): Promise<{ uid: string; by: string } | null> {
  const token = /^Bearer (.+)$/.exec(authHeader ?? '')?.[1];
  if (!token) return null;
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY as string },
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    return { uid: String(user.id), by: attribution(user) };
  } catch {
    return null;
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

function parseRecord(val: unknown): CommunityRecord | null {
  try {
    const r = (typeof val === 'string' ? JSON.parse(val) : val) as CommunityRecord;
    return r && typeof r.name === 'string' && Number.isFinite(r.lat) && Number.isFinite(r.lng) ? r : null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  const redis = getRedis();
  if (!redis) {
    res.status(503).json({ error: 'community database not configured' });
    return;
  }

  if (req.method === 'GET') {
    const pointsRaw = String(req.query?.points ?? '');
    if (!pointsRaw) {
      // Availability probe.
      res.status(200).json({ ok: true });
      return;
    }
    const points = pointsRaw
      .split('|')
      .slice(0, MAX_POINTS)
      .map((s: string) => s.split(',').map(Number))
      .filter(([lat, lng]: number[]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!points.length) {
      res.status(400).json({ error: 'points must be lat,lng pairs separated by |' });
      return;
    }
    try {
      const [stops, reports] = await Promise.all([
        redis.hgetall<Record<string, unknown>>(STOPS_KEY),
        redis.hgetall<Record<string, number>>(REPORTS_KEY),
      ]);
      const out: Array<Omit<CommunityRecord, 'uid'> & { id: string }> = [];
      for (const [id, val] of Object.entries(stops ?? {})) {
        if (Number(reports?.[id] ?? 0) >= HIDE_AT_REPORTS) continue;
        const rec = parseRecord(val);
        if (!rec) continue;
        if (points.some(([lat, lng]: number[]) => haversineKm(lat, lng, rec.lat, rec.lng) <= RADIUS_KM)) {
          const { uid: _uid, ...pub } = rec; // never expose the contributor's uid
          out.push({ id, ...pub });
          if (out.length >= MAX_RESULTS) break;
        }
      }
      res.status(200).json({ stops: out });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};

    if (body.action === 'report') {
      const id = String(body.id ?? '');
      if (!/^cs_[a-z0-9]+$/.test(id)) {
        res.status(400).json({ error: 'bad id' });
        return;
      }
      await redis.hincrby(REPORTS_KEY, id, 1);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action !== 'submit') {
      res.status(400).json({ error: 'action must be submit or report' });
      return;
    }
    const name = String(body.name ?? '')
      .trim()
      .slice(0, 60);
    const note = String(body.note ?? '')
      .trim()
      .slice(0, 200);
    const category = String(body.category ?? '');
    const visitMin = Number(body.visitMin);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'unknown category' });
      return;
    }
    if (!VISIT_OPTIONS.includes(visitMin)) {
      res.status(400).json({ error: 'visitMin must be one of 15, 30, 60, 120' });
      return;
    }
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) {
      res.status(400).json({ error: 'coordinates out of range' });
      return;
    }
    const parking = PARKING_OPTIONS.includes(body.parking) ? body.parking : undefined;

    // When auth is configured, adding requires a valid signed-in account.
    let account: { uid: string; by: string } | null = null;
    if (AUTH_ENABLED) {
      account = await verifyUser(req.headers?.authorization);
      if (!account) {
        res.status(401).json({ error: 'Please sign in to add a place' });
        return;
      }
    }

    // Rate-limit per account when signed in, else per IP.
    const ip = String(req.headers?.['x-forwarded-for'] ?? 'unknown').split(',')[0].trim() || 'unknown';
    const rlKey = `community:rl:${account ? `u:${account.uid}` : ip}`;
    const n = await redis.incr(rlKey);
    if (n === 1) await redis.expire(rlKey, 86400);
    if (n > DAILY_SUBMISSIONS_PER_IP) {
      res.status(429).json({ error: 'Daily sharing limit reached — try again tomorrow' });
      return;
    }

    const id = `cs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const record: CommunityRecord = {
      name,
      note,
      category,
      visitMin,
      parking,
      lat,
      lng,
      createdAt: Date.now(),
      by: account?.by,
      uid: account?.uid,
    };
    await redis.hset(STOPS_KEY, { [id]: JSON.stringify(record) });
    // Never leak uid to clients.
    const { uid: _uid, ...publicRecord } = record;
    res.status(200).json({ stop: { id, ...publicRecord } });
    return;
  }

  res.status(405).json({ error: 'GET or POST only' });
}
