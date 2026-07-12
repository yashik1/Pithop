import type { LatLng } from '../lib/geo';
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
  const desc = (description ?? '').toLowerCase();
  if (BLACKLIST.some((b) => desc.includes(b))) return null;
  const text = `${title.toLowerCase()} ${desc}`;
  for (const rule of RULE_REGEXES) {
    if (rule.regexes.some((re) => re.test(text))) {
      return { category: rule.category, kind: rule.kind };
    }
  }
  return null;
}

async function fetchNear(p: LatLng): Promise<WikiPage[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=geosearch&ggscoord=${p.lat.toFixed(5)}%7C${p.lng.toFixed(5)}&ggsradius=10000&ggslimit=50` +
    `&prop=coordinates%7Cdescription%7Cpageimages%7Cinfo&inprop=url&piprop=thumbnail&pithumbsize=240`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {}) as WikiPage[];
}

export async function fetchWikiStops(samples: LatLng[]): Promise<Stop[]> {
  const byId = new Map<number, WikiPage>();
  const BATCH = 6;
  for (let i = 0; i < samples.length; i += BATCH) {
    const results = await Promise.allSettled(samples.slice(i, i + BATCH).map(fetchNear));
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const page of r.value) byId.set(page.pageid, page);
      }
    }
  }
  if (byId.size === 0) throw new Error('Wikipedia returned no places');

  const stops: Stop[] = [];
  for (const page of byId.values()) {
    const coord = page.coordinates?.[0];
    if (!coord) continue;
    const cat = categorizeWiki(page.title, page.description);
    if (!cat) continue;
    stops.push({
      id: `wiki/${page.pageid}`,
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
