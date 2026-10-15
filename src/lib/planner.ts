// "Surprise Me": turn a spare-time budget into an itinerary. Each stop's cost
// is its visit time plus its round-trip detour, so the plan honestly fits the
// time the traveller has. Selection is greedy by Pithop Score with category
// diversity and along-route spacing, plus a pinch of randomness so tapping
// again deals a fresh mix ("shuffle").
//
// The quality judgement lives in score.ts and is deterministic; the randomness
// is applied HERE, at the point of selection, so the score a traveller sees on
// a card never moves under them.

import type { Stop } from '../types';
import type { CategoryId } from './categories';
import { pithopScore, DEFAULT_PREFS, type ScoreContext, type TripPrefs } from './score';
import { hoursStatus } from './hours';

const MAX_PICKS = 12;
const MIN_SPACING_KM = 8;

export function surprisePlan(
  stops: Stop[],
  budgetMin: number,
  prefs: TripPrefs = DEFAULT_PREFS,
  ctx: ScoreContext = {},
): string[] {
  const scoreById = new Map(stops.map((s) => [s.id, pithopScore(s, prefs, ctx).score]));
  const picked: Stop[] = [];
  const catCount = new Map<CategoryId, number>();
  let remaining = budgetMin;
  const pool = stops.filter((s) => s.visitMin + s.detourMin <= budgetMin);
  while (remaining > 0 && picked.length < MAX_PICKS) {
    let best: Stop | null = null;
    let bestScore = 0;
    for (const s of pool) {
      const cost = s.visitMin + s.detourMin;
      if (cost > remaining || picked.includes(s)) continue;
      if (picked.some((p) => Math.abs(p.alongKm - s.alongKm) < MIN_SPACING_KM)) continue;
      const quality = (scoreById.get(s.id) ?? 0) / 50;
      const diversity = 1 / (1 + (catCount.get(s.category) ?? 0));
      const efficiency = s.visitMin / cost;
      const score = quality * diversity * efficiency * (0.8 + Math.random() * 0.4);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) break;
    picked.push(best);
    remaining -= best.visitMin + best.detourMin;
    catCount.set(best.category, (catCount.get(best.category) ?? 0) + 1);
  }
  return picked.map((s) => s.id);
}

export function rouletteSpin(stops: Stop[], excludeId?: string): Stop | null {
  const pool = stops.filter((s) => s.id !== excludeId);
  const candidates = pool.length ? pool : stops;
  if (!candidates.length) return null;
  const weight = (s: Stop) =>
    (s.category === 'fun' ? 4 : s.category === 'views' || s.category === 'nature' ? 2 : 1) +
    (s.imageUrl ? 2 : 0);
  const total = candidates.reduce((sum, s) => sum + weight(s), 0);
  let roll = Math.random() * total;
  for (const s of candidates) {
    roll -= weight(s);
    if (roll <= 0) return s;
  }
  return candidates[candidates.length - 1];
}

export interface BingoSquare {
  text: string;
  stopId?: string;
}

const SIGHTINGS = [
  'A water tower',
  'A red barn',
  'A dog riding in a truck',
  'A funny town name',
  'A license plate from far away',
  'A field of cows',
  'Hay bales',
  'Wind turbines',
  'A freight train',
  'A classic car',
  'A weird roadside statue',
  'Someone singing in their car',
  'A rainbow or an epic cloud',
  'A tractor on the road',
  'A billboard pun',
  'Horses',
];

export function buildBingoCard(stops: Stop[]): BingoSquare[] {
  const shuffled = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const stopSquares: BingoSquare[] = shuffled(stops.filter((s) => s.name.length <= 28))
    .slice(0, 6)
    .map((s) => ({ text: s.name, stopId: s.id }));
  const fillers: BingoSquare[] = shuffled(SIGHTINGS)
    .slice(0, 16 - stopSquares.length)
    .map((text) => ({ text }));
  return shuffled([...stopSquares, ...fillers]);
}

const BINGO_LINES: number[][] = [
  ...Array.from({ length: 4 }, (_, r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  ...Array.from({ length: 4 }, (_, c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

export function bingoLineCount(marked: boolean[]): number {
  return BINGO_LINES.filter((line) => line.every((i) => marked[i])).length;
}

export interface OptimizeResult {
  planIds: string[];
  totalExtraMin: number;
  dropped: Array<{ id: string; reason: 'budget' | 'closed' | 'lowScore' }>;
}

export function optimizePlan(
  candidates: Stop[],
  budgetMin: number,
  prefs: TripPrefs = DEFAULT_PREFS,
  opts: {
    preferredIds?: ReadonlySet<string>;
    ctx?: ScoreContext;
    skipClosed?: boolean;
    minScore?: number;
  } = {},
): OptimizeResult {
  const minScore = opts.minScore ?? 40;
  const preferred = opts.preferredIds ?? new Set<string>();
  const scored = candidates
    .map((s) => ({ stop: s, scored: pithopScore(s, prefs, opts.ctx) }))
    .filter(({ scored: sc }) => sc.score >= minScore);

  scored.sort((a, b) => {
    const ap = preferred.has(a.stop.id) ? 1 : 0;
    const bp = preferred.has(b.stop.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.scored.score - a.scored.score;
  });

  const kept: Stop[] = [];
  const dropped: OptimizeResult['dropped'] = [];
  let used = 0;

  for (const { stop, scored: sc } of scored) {
    if (opts.skipClosed && opts.ctx?.eta && stop.hours) {
      const hs = hoursStatus(stop.hours, opts.ctx.eta);
      if (hs && !hs.open) {
        dropped.push({ id: stop.id, reason: 'closed' });
        continue;
      }
    }
    const cost = stop.visitMin + stop.detourMin;
    if (used + cost > budgetMin) {
      dropped.push({ id: stop.id, reason: 'budget' });
      continue;
    }
    if (kept.some((k) => Math.abs(k.alongKm - stop.alongKm) < 5) && !preferred.has(stop.id)) {
      dropped.push({ id: stop.id, reason: 'lowScore' });
      continue;
    }
    kept.push(stop);
    used += cost;
  }

  kept.sort((a, b) => a.alongKm - b.alongKm);
  return {
    planIds: kept.map((s) => s.id),
    totalExtraMin: Math.round(used),
    dropped,
  };
}

export function suggestInsert(
  allStops: Stop[],
  plan: Stop[],
  prefs: TripPrefs = DEFAULT_PREFS,
  ctx: ScoreContext = {},
): Stop | null {
  const planIds = new Set(plan.map((s) => s.id));
  const ordered = [...plan].sort((a, b) => a.alongKm - b.alongKm);
  let windowStart = 0;
  let windowEnd = Infinity;
  if (ordered.length >= 2) {
    let bestGap = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
      const gap = ordered[i + 1].alongKm - ordered[i].alongKm;
      if (gap > bestGap) {
        bestGap = gap;
        windowStart = ordered[i].alongKm;
        windowEnd = ordered[i + 1].alongKm;
      }
    }
  } else if (ordered.length === 1) {
    windowStart = ordered[0].alongKm - 30;
    windowEnd = ordered[0].alongKm + 30;
  }

  let best: Stop | null = null;
  let bestScore = 0;
  for (const s of allStops) {
    if (planIds.has(s.id)) continue;
    if (s.alongKm < windowStart || s.alongKm > windowEnd) continue;
    const sc = pithopScore(s, prefs, ctx).score;
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best;
}
