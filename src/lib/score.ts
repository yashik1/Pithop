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
  /** Categories the chip narrows the list to when tapped. */
  cats: CategoryId[];
  /** Ranking weight per category. 1 = neutral; above 1 promotes. */
  weights: Partial<Record<CategoryId, number>>;
  /** Finer-grained promotion for specific place kinds. */
  kinds?: Record<string, number>;
}

// Thirteen travel personalities. `cats` drives filtering (what you see at all)
// and `weights`/`kinds` drive ranking (what floats to the top) — a personality
// that only filtered would make every remaining stop look equally good.
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
  /** The traveller's own max-detour filter, in minutes (round trip). */
  maxDetourMin: number;
  pace: Pace;
  withKids: boolean;
  withPets: boolean;
  budget: 'low' | 'mid' | 'any';
}

export const DEFAULT_PREFS: TripPrefs = {
  personalities: [],
  maxDetourMin: 25,
  pace: 'balanced',
  withKids: false,
  withPets: false,
  budget: 'any',
};

// Why a stop scored the way it did. Codes, not sentences, so the UI can
// translate them — score.ts stays free of copy and of the i18n module.
export type ReasonCode =
  | 'matchesVibe' | 'shortDetour' | 'longDetour' | 'openOnArrival' | 'closedOnArrival'
  | 'hasPhoto' | 'travellerPick' | 'hiddenGem' | 'quickStop' | 'kidFriendly';

export interface ScoreReason {
  code: ReasonCode;
  value?: number;
}

export type Verdict = 'worth' | 'maybe' | 'skip';

export interface ScoredStop {
  /** 0-100, rounded. */
  score: number;
  reasons: ScoreReason[];
  verdict: Verdict;
  /** Detour there and back plus time spent at the place. */
  totalExtraMin: number;
}

export interface ScoreContext {
  /** Projected arrival, used to judge opening hours. Omit to skip that factor. */
  eta?: Date;
}

// The kinds of place the brief means by "hidden gem": small museums, waterfalls,
// viewpoints, quirky roadside stops, local history. Deliberately excludes the
// things every route has — fuel, restrooms, fast food, chain stops.
const GEM_KINDS = new Set([
  'viewpoint', 'waterfall', 'picnic_site', 'historic_site', 'ruins', 'monument',
  'memorial', 'museum', 'gallery', 'attraction', 'artwork', 'nature_reserve', 'park',
]);

// A hidden gem is somewhere interesting that is NOT the obvious stop:
// traveller-vouched, traveller-curated, a described-but-unphotographed landmark,
// or an interesting kind of place a little way off the main road. Fuel and
// restrooms never qualify however they were found.
export function isHiddenGem(s: Stop): boolean {
  if (s.category === 'rest') return false;
  if (s.source === 'community') return true;
  if (s.wikiUrl?.includes('wikivoyage')) return true;
  if (s.source === 'wiki') return !s.imageUrl && Boolean(s.description) && s.offRouteKm > 1.5;
  // Map-data places (OSM/Geoapify): the kind has to be interesting AND the place
  // has to sit off the highway, which is what separates a gem from a services
  // sign. 1 km is roughly "you have to mean it".
  return GEM_KINDS.has(s.kind) && s.offRouteKm > 1;
}

/** Clamp helper — keeps every sub-score inside 0..1 before weighting. */
const unit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// How well the place matches the chosen personalities. Neutral (0.55) when the
// traveller has picked none, so an unfiltered trip still ranks on quality and
// detour rather than collapsing every stop to the same number.
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
  // Weights top out around 2.6; normalise that range onto 0..1.
  return unit(best / 2.6);
}

// Signals that a place is genuinely worth someone's time: a photo, a real
// description, an article to read, or another traveller vouching for it.
function qualityFactor(s: Stop): number {
  let q = 0.3;
  if (s.imageUrl) q += 0.3;
  if (s.description) q += 0.2;
  if (s.wikiUrl) q += 0.1;
  if (s.source === 'community') q += 0.2;
  return unit(q);
}

// Detour cost, measured against the traveller's own tolerance rather than an
// absolute figure: 25 minutes is cheap to someone hunting hidden gems and
// expensive to someone trying to get there.
function detourFactor(s: Stop, prefs: TripPrefs): number {
  const allowance = Math.max(5, prefs.maxDetourMin);
  return unit(1 - s.detourMin / (allowance * 1.4));
}

// Closed when you arrive is close to disqualifying; open is worth a real nudge.
// Unknown hours stay neutral — most OSM places carry none, and guessing would
// punish them for a gap in the data rather than anything about the place.
function openFactor(s: Stop, ctx: ScoreContext): number {
  if (!s.hours || !ctx.eta) return 0.55;
  const st = hoursStatus(s.hours, ctx.eta);
  if (!st) return 0.55;
  return st.open ? 1 : 0.05;
}

// Does the length of the stop suit the pace of the trip?
function fitFactor(s: Stop, prefs: TripPrefs): number {
  const ideal = prefs.pace === 'efficient' ? 25 : prefs.pace === 'relaxed' ? 90 : 50;
  const ratio = s.visitMin / ideal;
  // Bell-ish: 1 at the ideal, tailing off either side of it.
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
  if (gem) raw += 0.06; // a small, flat nudge — gems are the point of the app
  if (prefs.withKids && (s.kind === 'zoo' || s.kind === 'aquarium' || s.kind === 'theme_park' || s.kind === 'park')) {
    raw += 0.04;
  }
  if (prefs.withPets && (s.kind === 'park' || s.kind === 'picnic_site' || s.kind === 'nature_reserve')) {
    raw += 0.04;
  }
  if (prefs.budget === 'low' && s.parking === 'paid') raw -= 0.05;

  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));
  const totalExtraMin = s.detourMin + s.visitMin;

  // Reasons, strongest first, capped at three so the card stays readable.
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
  if (s.detourMin > prefs.maxDetourMin) reasons.push({ code: 'longDetour', value: s.detourMin });

  return { score, reasons: reasons.slice(0, 3), verdict: verdictFor(score, totalExtraMin, prefs), totalExtraMin };
}

// How much extra time the traveller will plausibly accept for one stop. Someone
// hunting hidden gems or taking it slow will go further out of their way than
// someone optimising the drive.
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
