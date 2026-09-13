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

const MAX_PICKS = 12;
const MIN_SPACING_KM = 8;

export function surprisePlan(
  stops: Stop[],
  budgetMin: number,
  prefs: TripPrefs = DEFAULT_PREFS,
  ctx: ScoreContext = {},
): string[] {
  // Score every candidate once up front — it does not depend on what has been
  // picked so far, so recomputing it inside the loop would only cost time.
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
      // Keep stops spread along the drive, not clustered in one town.
      if (picked.some((p) => Math.abs(p.alongKm - s.alongKm) < MIN_SPACING_KM)) continue;
      // Quality comes from the shared Pithop Score, so Surprise Me agrees with
      // the number shown on the card rather than ranking by its own rules.
      const quality = (scoreById.get(s.id) ?? 0) / 50; // ~0..2
      // Diversity: each repeat of a category is worth progressively less.
      const diversity = 1 / (1 + (catCount.get(s.category) ?? 0));
      // Efficiency: time spent enjoying vs. time spent detouring.
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

// Detour Roulette: one random wildcard pick, weighted toward the quirky stuff
// (attractions first, scenery next) and places with photos. Never re-deals the
// stop currently on the wheel when there's any alternative.
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

// Road Trip Bingo: a 4x4 card mixing real stops from this route with classic
// road-trip sightings. Squares are shuffled once per trip and persisted so the
// card survives reloads mid-drive.
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
  // Up to 6 real stops (short names read best on a small square).
  const stopSquares: BingoSquare[] = shuffled(stops.filter((s) => s.name.length <= 28))
    .slice(0, 6)
    .map((s) => ({ text: s.name, stopId: s.id }));
  const fillers: BingoSquare[] = shuffled(SIGHTINGS)
    .slice(0, 16 - stopSquares.length)
    .map((text) => ({ text }));
  return shuffled([...stopSquares, ...fillers]);
}

// All 4-in-a-row lines on a 4x4 card: rows, columns, both diagonals.
const BINGO_LINES: number[][] = [
  ...Array.from({ length: 4 }, (_, r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  ...Array.from({ length: 4 }, (_, c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

export function bingoLineCount(marked: boolean[]): number {
  return BINGO_LINES.filter((line) => line.every((i) => marked[i])).length;
}

// Trip vibes used to live here as four presets. They are now the thirteen trip
// personalities in score.ts, which both filter the list and weight the ranking.
