import { haversineKm, type LatLng } from '../lib/geo';
import type { Stop } from '../types';
import { visitMinutes, type CategoryId } from '../lib/categories';

interface WikiPage {
  pageid: number;
  title: string;
  description?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  thumbnail?: { source: string };
  fullurl?: string;
}

// Wikipedia geosearch returns lots of administrative/organizational pages that
// aren't stops. Filter them out by description before categorizing.
const BLACKLIST = [
  'county',
  'city in',
  'city of',
  'town in',
  'village in',
  'census',
  'unincorporated',
  'neighborhood',
  'neighbourhood',
  'suburb',
  'school district',
  'metropolitan',
  'micropolitan',
  'human settlement',
  'radio station',
  'television',
  'tv station',
  'newspaper',
  'magazine',
  'highway',
  'interstate',
  'u.s. route',
  'state route',
  'road in',
  'street in',
  'railway',
  'railroad',
  'rail line',
  'airline',
  'airport',
  'company',
  'corporation',
  'school in',
  'high school',
  'middle school',
  'elementary',
  'university',
  'college',
  'hospital',
  'clinic',
  'shopping center',
  'shopping centre',
  'sports team',
  'football team',
  'baseball team',
  'basketball team',
  'military unit',
  'regiment',
  'battalion',
  'episode',
  'album',
  'song',
];

// Checked in order — first match wins. Keywords match at word starts,
// prefix-style ("archaeolog" matches "archaeological").
const RULES: Array<{ category: CategoryId; kind: string; keywords: string[] }> = [
  {
    category: 'views',
    kind: 'viewpoint',
    keywords: ['overlook', 'viewpoint', 'scenic', 'observation deck', 'observation tower'],
  },
  {
    category: 'museums',
    kind: 'museum',
    keywords: ['museum', 'gallery', 'planetarium', 'science center', 'art center', 'arts centre', 'heritage center'],
  },
  {
    category: 'fun',
    kind: 'attraction',
    keywords: [
      'zoo',
      'aquarium',
      'amusement park',
      'theme park',
      'water park',
      'roadside attraction',
      'ferris',
      'casino',
      'winery',
      'brewery',
      'distillery',
      'stadium',
      'arena',
      'attraction',
      'sculpture',
      'statue',
    ],
  },
  {
    category: 'food',
    kind: 'restaurant',
    keywords: ['restaurant', 'diner', 'café', 'cafe', 'barbecue', 'bakery', 'ice cream'],
  },
  {
    category: 'nature',
    kind: 'park',
    keywords: [
      'state park',
      'national park',
      'park',
      'lake',
      'waterfall',
      'falls',
      'river',
      'nature',
      'wildlife',
      'refuge',
      'forest',
      'botanical',
      'garden',
      'preserve',
      'reserve',
      'canyon',
      'cave',
      'spring',
      'mountain',
      'beach',
      'trail',
      'recreation area',
      'arboretum',
    ],
  },
  {
    category: 'history',
    kind: 'historic_site',
    keywords: [
      'historic',
      'history',
      'monument',
      'memorial',
      'fort',
      'battle',
      'ruins',
      'archaeolog',
      'courthouse',
      'mission',
      'church',
      'chapel',
      'cathedral',
      'castle',
      'mansion',
      'plantation',
      'lighthouse',
      'cemetery',
      'landmark',
      'bridge',
      'building',
      'house',
      'hotel',
      'theater',
      'theatre',
      'opera',
    ],
  },
];

const RULE_REGEXES = RULES.map((rule) => ({
  ...rule,
  regexes: rule.keywords.map((k) => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
}));

function categorizeWiki(title: string, description: string | undefined): { category: CategoryId; kind: string } | null {
  title = String(title ?? '');
  const desc = String(description ?? '').toLowerCase();
  if (BLACKLIST.some((b) => desc.includes(b))) return null;
  const text = `${title.toLowerCase()} ${desc}`;
  for (const rule of RULE_REGEXES) {
    if (rule.regexes.some((re) => re.test(text))) {
      return { category: rule.category, kind: rule.kind };
    }
  }
  return null;
}

// Fuller "what is this place" text, fetched lazily when a traveller opens a
// stop (one request per page, cached for the session). The geosearch response
// only carries the terse short description; this adds the article intro.
const extractCache = new Map<number, Promise<string | null>>();

export function fetchWikiExtract(pageid: number): Promise<string | null> {
  let cached = extractCache.get(pageid);
  if (!cached) {
    cached = (async () => {
      const url =
        `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
        `&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=${pageid}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Wikipedia extract failed (HTTP ${res.status})`);
      const data = await res.json();
      const text: string | undefined = data.query?.pages?.[pageid]?.extract;
      return text?.trim() || null;
    })().catch(() => {
      extractCache.delete(pageid); // allow a retry next time the stop is opened
      return null;
    });
    extractCache.set(pageid, cached);
  }
  return cached;
}

// Two Wikimedia sources share the same geosearch API: Wikipedia (landmarks
// notable enough for an article) and Wikivoyage (traveller-curated destination
// pages — parks, scenic areas — whose links open a practical travel guide).
const WIKI_HOST = 'en.wikipedia.org';
const VOYAGE_HOST = 'en.wikivoyage.org';

// Radius and limit are both sized to the app's search corridor rather than to
// the bare minimum: geosearch bills per request, not per result, so a bigger
// disc and a higher cap surface far more landmarks for the same request count.
async function fetchNear(host: string, p: LatLng): Promise<WikiPage[]> {
  const url =
    `https://${host}/w/api.php?action=query&format=json&origin=*` +
    `&generator=geosearch&ggscoord=${p.lat.toFixed(5)}%7C${p.lng.toFixed(5)}&ggsradius=10000&ggslimit=100` +
    `&prop=coordinates%7Cdescription%7Cpageimages%7Cinfo&inprop=url&piprop=thumbnail&pithumbsize=240`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {}) as WikiPage[];
}

function pagesToStops(pages: Iterable<WikiPage>, idPrefix: string): Stop[] {
  const stops: Stop[] = [];
  for (const page of pages) {
    const coord = page.coordinates?.[0];
    if (!coord) continue;
    const cat = categorizeWiki(page.title, page.description);
    if (!cat) continue;
    stops.push({
      id: `${idPrefix}/${page.pageid}`,
      name: page.title,
      lat: coord.lat,
      lng: coord.lon,
      category: cat.category,
      kind: cat.kind,
      visitMin: visitMinutes(cat.kind),
      source: 'wiki',
      description: page.description,
      imageUrl: page.thumbnail?.source,
      wikiUrl: page.fullurl,
      offRouteKm: 0,
      alongKm: 0,
      detourMin: 0,
    });
  }
  return stops;
}

// Long routes need several request rounds; onPartial streams the cumulative
// results after each round so the first stops render while the rest load.
// Wikivoyage is queried at every 2nd disc (destination pages are sparse, so
// coarser coverage loses little and halves the extra request load); its pages
// run through the same blacklist/rules, and ones that duplicate a Wikipedia
// landmark nearby are dropped.
export async function fetchWikiStops(samples: LatLng[], onPartial?: (stops: Stop[]) => void): Promise<Stop[]> {
  const wikiById = new Map<number, WikiPage>();
  const voyById = new Map<number, WikiPage>();
  const BATCH = 12;

  const assemble = (): Stop[] => {
    const wiki = pagesToStops(wikiById.values(), 'wiki');
    const merged = [...wiki];
    for (const v of pagesToStops(voyById.values(), 'wikiv')) {
      const vn = v.name.toLowerCase();
      if (!wiki.some((w) => w.name.toLowerCase() === vn && haversineKm(w, v) < 2)) merged.push(v);
    }
    return merged;
  };

  for (let i = 0; i < samples.length; i += BATCH) {
    const slice = samples.slice(i, i + BATCH);
    const [wikiRes, voyRes] = await Promise.all([
      Promise.allSettled(slice.map((p) => fetchNear(WIKI_HOST, p))),
      Promise.allSettled(slice.filter((_, j) => (i + j) % 2 === 0).map((p) => fetchNear(VOYAGE_HOST, p))),
    ]);
    for (const r of wikiRes) {
      if (r.status === 'fulfilled') for (const page of r.value) wikiById.set(page.pageid, page);
    }
    for (const r of voyRes) {
      if (r.status === 'fulfilled') for (const page of r.value) voyById.set(page.pageid, page);
    }
    if (onPartial && wikiById.size > 0 && i + BATCH < samples.length) onPartial(assemble());
  }
  if (wikiById.size === 0 && voyById.size === 0) throw new Error('Wikipedia returned no places');
  return assemble();
}
