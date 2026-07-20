// "Surprise Me": turn a spare-time budget into an itinerary. Each stop's cost
// is its visit time plus its round-trip detour, so the plan honestly fits the
// time the traveller has. Selection is greedy by score with category diversity
// and along-route spacing, plus a pinch of randomness so tapping again deals a
// fresh mix ("shuffle").

import type { Stop } from '../types';
import type { CategoryId } from './categories';

const MAX_PICKS = 12;
const MIN_SPACING_KM = 8;

export function surprisePlan(stops: Stop[], budgetMin: number): string[] {
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
      // Quality: photos/descriptions signal genuinely interesting places;
      // community stops are traveller-vouched gems.
      const quality =
        1 + (s.imageUrl ? 1.2 : 0) + (s.description ? 0.6 : 0) + (s.source === 'community' ? 0.8 : 0);
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

// Trip vibes: one-tap presets over the category filter.
export interface Theme {
  id: 'weird' | 'foodie' | 'nature' | 'history';
  emoji: string;
  cats: CategoryId[];
}

export const THEMES: Theme[] = [
  { id: 'weird', emoji: '🛸', cats: ['fun'] },
  { id: 'foodie', emoji: '🍔', cats: ['food'] },
  { id: 'nature', emoji: '🏞️', cats: ['nature', 'views'] },
  { id: 'history', emoji: '🏛️', cats: ['history', 'museums'] },
];
