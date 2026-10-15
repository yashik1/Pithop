// The Pithop Score: how well a place fits THIS traveller on THIS trip.
//
// Deliberately deterministic — the same stop with the same preferences always
// scores the same, so it can be unit-tested and so a traveller never sees a
// place's score change under them. Any shuffling ("deal me a different mix")
// belongs to the caller, not here.
//
// It is a recommendation, not a measurement. The UI must label it as Pithop's
// own score and never present it as an objective rating of the place.

import type { Stop } from '../types';
import type { CategoryId } from './categories';
import { hoursStatus } from './hours';

export type PersonalityId =
  | 'scenic' | 'foodie' | 'hidden' | 'nature' | 'history' | 'family' | 'pets'
  | 'photo' | 'romantic' | 'budget' | 'outdoor' | 'attractions' | 'coffee';

export interface Personality {
  id: PersonalityId;
  emoji: string;
  cats: CategoryId[];
  weights: Partial<Record<CategoryId, number>>;
  kinds?: Record<string, number>;
}

export const PERSONALITIES: Personality[] = [
  { id: 'scenic', emoji: '🌄', cats: ['views', 'nature'], weights: { views: 2, nature: 1.4 } },
  { id: 'foodie', emoji: '🍽️', cats: ['food'], weights: { food: 2 }, kinds: { restaurant: 1.3, ice_cream: 1.15 } },
  { id: 'hidden', emoji: '💎', cats: ['fun', 'nature', 'history', 'views'], weights: { fun: 1.3, history: 1.2, nature: 1.2 } },
  { id: 'nature', emoji: '🌲', cats: ['nature', 'views'], weights: { nature: 2, views: 1.4 }, kinds: { waterfall: 1.3, nature_reserve: 1.2 } },
  { id: 'history', emoji: '🏛️', cats: ['history', 'museums'], weights: { history: 2, museums: 1.6 } },
  { id: 'family', emoji: '👨‍👩‍👧', cats: ['fun', 'nature', 'museums'], weights: { fun: 1.8, nature: 1.3, museums: 1.2 }, kinds: { zoo: 1.5, aquarium: 1.45, theme_park: 1.4, park: 1.25, ice_cream: 1.2 } },
  { id: 'pets', emoji: '🐕', cats: ['nature', 'views', 'rest'], weights: { nature: 1.8, views: 1.4, rest: 1.2 }, kinds: { park: 1.4, picnic_site: 1.35, nature_reserve: 1.2 } },
  { id: 'photo', emoji: '📷', cats: ['views', 'nature', 'fun'], weights: { views: 2, nature: 1.5, fun: 1.2 }, kinds: { viewpoint: 1.4, waterfall: 1.3 } },
  { id: 'romantic', emoji: '💞', cats: ['views', 'food', 'nature'], weights: { views: 1.8, food: 1.5, nature: 1.3 }, kinds: { viewpoint: 1.3, restaurant: 1.2 } },
  { id: 'budget', emoji: '💸', cats: ['views', 'nature', 'history'], weights: { views: 1.8, nature: 1.5, history: 1.2 } },
  { id: 'outdoor', emoji: '🥾', cats: ['nature', 'views'], weights: { nature: 2, views: 1.5 }, kinds: { trail: 1.4, nature_reserve: 1.3, waterfall: 1.2 } },
  { id: 'attractions', emoji: '🎡', cats: ['fun', 'museums'], weights: { fun: 2, museums: 1.3 }, kinds: { attraction: 1.3, theme_park: 1.25 } },
  { id: 'coffee', emoji: '☕', cats: ['food', 'history'], weights: { food: 1.8, history: 1.2 }, kinds: { cafe: 1.6, historic_site: 1.15 } },
];

export const PERSONALITY_MAP: Record<PersonalityId, Personality> = Object.fromEntries(
  PERSONALITIES.map((p) => [p.id, p]),
) as Record<PersonalityId, Personality>;

export type Pace = 'relaxed' | 'balanced' | 'efficient';

export interface TripPrefs {
  personalities: PersonalityId[];
  maxDetourMin: number;
  pace: Pace;
  withKids: boolean;
  withPets: boolean;
  /** Prefer EV charging and longer dwell at rest/charging stops. */
  ev: boolean;
  budget: 'low' | 'mid' | 'any';
}

export const DEFAULT_PREFS: TripPrefs = {
  personalities: [],
  maxDetourMin: 25,
  pace: 'balanced',
  withKids: false,
  withPets: false,
  ev: false,
  budget: 'any',
};

export type ReasonCode =
  | 'matchesVibe' | 'shortDetour' | 'longDetour' | 'openOnArrival' | 'closedOnArrival'
  | 'hasPhoto' | 'travellerPick' | 'hiddenGem' | 'quickStop' | 'kidFriendly' | 'evFriendly';

export interface ScoreReason {
  code: ReasonCode;
  value?: number;
}

export type Verdict = 'worth' | 'maybe' | 'skip';

export interface ScoredStop {
  score: number;
  reasons: ScoreReason[];
  verdict: Verdict;
  totalExtraMin: number;
}

export interface ScoreContext {
  eta?: Date;
}

const GEM_KINDS = new Set([
  'viewpoint', 'waterfall', 'picnic_site', 'historic_site', 'ruins', 'monument',
  'memorial', 'museum', 'gallery', 'attraction', 'artwork', 'nature_reserve', 'park',
]);

export function isHiddenGem(s: Stop): boolean {
  if (s.category === 'rest') return false;
  if (s.source === 'community') return true;
  if (s.wikiUrl?.includes('wikivoyage')) return true;
  if (s.source === 'wiki') return !s.imageUrl && Boolean(s.description) && s.offRouteKm > 1.5;
  return GEM_KINDS.has(s.kind) && s.offRouteKm > 1;
}

const unit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

function matchFactor(s: Stop, prefs: TripPrefs): number {
  if (prefs.personalities.length === 0) return 0.55;
  let best = 0;
  for (const id of prefs.personalities) {
    const p = PERSONALITY_MAP[id];
    if (!p) continue;
    const w = (p.weights[s.category] ?? 0.55) * (p.kinds?.[s.kind] ?? 1);
    if (w > best) best = w;
  }
  if (prefs.personalities.includes('hidden') && isHiddenGem(s)) best *= 1.25;
  return unit(best / 2.6);
}

function qualityFactor(s: Stop): number {
  let q = 0.3;
  if (s.imageUrl) q += 0.3;
  if (s.description) q += 0.2;
  if (s.wikiUrl) q += 0.1;
  if (s.source === 'community') q += 0.2;
  return unit(q);
}

function detourFactor(s: Stop, prefs: TripPrefs): number {
  const allowance = Math.max(5, prefs.maxDetourMin);
  return unit(1 - s.detourMin / (allowance * 1.4));
}

function openFactor(s: Stop, ctx: ScoreContext): number {
  if (!s.hours || !ctx.eta) return 0.55;
  const st = hoursStatus(s.hours, ctx.eta);
  if (!st) return 0.55;
  return st.open ? 1 : 0.05;
}

function fitFactor(s: Stop, prefs: TripPrefs): number {
  const ideal = prefs.pace === 'efficient' ? 25 : prefs.pace === 'relaxed' ? 90 : 50;
  const ratio = s.visitMin / ideal;
  return unit(1 - Math.abs(Math.log(Math.max(ratio, 0.05))) / 2.2);
}

const WEIGHTS = { match: 0.34, quality: 0.2, detour: 0.24, open: 0.12, fit: 0.1 };

export function pithopScore(s: Stop, prefs: TripPrefs, ctx: ScoreContext = {}): ScoredStop {
  const f = {
    match: matchFactor(s, prefs),
    quality: qualityFactor(s),
    detour: detourFactor(s, prefs),
    open: openFactor(s, ctx),
    fit: fitFactor(s, prefs),
  };
  let raw =
    f.match * WEIGHTS.match +
    f.quality * WEIGHTS.quality +
    f.detour * WEIGHTS.detour +
    f.open * WEIGHTS.open +
    f.fit * WEIGHTS.fit;

  const gem = isHiddenGem(s);
  if (gem) raw += 0.06;
  if (prefs.withKids && (s.kind === 'zoo' || s.kind === 'aquarium' || s.kind === 'theme_park' || s.kind === 'park')) {
    raw += 0.04;
  }
  if (prefs.withPets && (s.kind === 'park' || s.kind === 'picnic_site' || s.kind === 'nature_reserve')) {
    raw += 0.04;
  }
  if (prefs.ev && (s.kind === 'charging_station' || s.kind === 'services')) {
    raw += 0.08;
  }
  if (prefs.budget === 'low' && s.parking === 'paid') raw -= 0.05;

  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));
  const totalExtraMin = s.detourMin + s.visitMin;

  const reasons: ScoreReason[] = [];
  if (f.match >= 0.6 && prefs.personalities.length > 0) reasons.push({ code: 'matchesVibe' });
  if (gem) reasons.push({ code: 'hiddenGem' });
  if (s.source === 'community') reasons.push({ code: 'travellerPick' });
  if (s.detourMin <= 10) reasons.push({ code: 'shortDetour', value: s.detourMin });
  if (f.open === 1) reasons.push({ code: 'openOnArrival' });
  if (f.open <= 0.1) reasons.push({ code: 'closedOnArrival' });
  if (s.imageUrl) reasons.push({ code: 'hasPhoto' });
  if (s.visitMin <= 20) reasons.push({ code: 'quickStop', value: s.visitMin });
  if (prefs.withKids && (s.kind === 'zoo' || s.kind === 'aquarium' || s.kind === 'theme_park')) {
    reasons.push({ code: 'kidFriendly' });
  }
  if (prefs.ev && s.kind === 'charging_station') reasons.push({ code: 'evFriendly' });
  if (s.detourMin > prefs.maxDetourMin) reasons.push({ code: 'longDetour', value: s.detourMin });

  return { score, reasons: reasons.slice(0, 3), verdict: verdictFor(score, totalExtraMin, prefs), totalExtraMin };
}

function allowanceMin(prefs: TripPrefs): number {
  let a = prefs.maxDetourMin + (prefs.pace === 'relaxed' ? 75 : prefs.pace === 'efficient' ? 25 : 45);
  if (prefs.personalities.includes('hidden')) a *= 1.25;
  if (prefs.pace === 'efficient') a *= 0.85;
  return a;
}

export function verdictFor(score: number, totalExtraMin: number, prefs: TripPrefs): Verdict {
  const allowance = allowanceMin(prefs);
  if (totalExtraMin > allowance * 1.6) return 'skip';
  if (score >= 70 && totalExtraMin <= allowance) return 'worth';
  if (score < 45) return 'skip';
  return 'maybe';
}
