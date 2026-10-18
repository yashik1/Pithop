import { afterEach, describe, expect, it, vi } from 'vitest';

// The module reads import.meta.env into consts at load time, so each case has
// to stub the environment and then re-import. That is also what the real build
// does: Vite inlines these values, and nothing re-reads them at runtime.
async function load(env: Record<string, string> = {}) {
  // Clear first: stubs accumulate, so without this a second load() in the same
  // test would inherit the first's IDs and quietly assert the wrong thing.
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('../affiliates');
}

const VIATOR = { VITE_VIATOR_PID: 'P00075623' };
const GYG = { VITE_GYG_PARTNER_ID: 'ZWAHXS1' };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ticketLinks', () => {
  it('renders nothing until a partner is configured', async () => {
    const { ticketLinks, anyAffiliate } = await load();
    expect(ticketLinks('Royal Ontario Museum', 'museum')).toEqual([]);
    expect(anyAffiliate()).toBe(false);
  });

  // The bug this guards: an earlier version fell through Viator -> GYG, so
  // configuring both left GetYourGuide permanently unreachable.
  it('returns every configured partner, not just the first', async () => {
    const { ticketLinks } = await load({ ...VIATOR, ...GYG });
    const links = ticketLinks('Royal Ontario Museum', 'museum');
    expect(links.map((l) => l.partner)).toEqual(['viator', 'getyourguide']);
  });

  it('returns just the one that is configured', async () => {
    const onlyGyg = await load(GYG);
    expect(onlyGyg.ticketLinks('Royal Ontario Museum', 'museum').map((l) => l.partner)).toEqual([
      'getyourguide',
    ]);

    const onlyViator = await load(VIATOR);
    expect(onlyViator.ticketLinks('Royal Ontario Museum', 'museum').map((l) => l.partner)).toEqual([
      'viator',
    ]);
  });

  it("carries Viator's documented tracking triple", async () => {
    const { ticketLinks } = await load(VIATOR);
    const url = new URL(ticketLinks('Casa Loma', 'historic_site')[0].url);
    expect(url.origin + url.pathname).toBe('https://www.viator.com/searchResults/all');
    expect(url.searchParams.get('pid')).toBe('P00075623');
    // Viator's docs warn that dropping or altering medium/mcid breaks
    // attribution reporting, which fails silently — hence asserting them.
    expect(url.searchParams.get('mcid')).toBe('42383');
    expect(url.searchParams.get('medium')).toBe('link');
    expect(url.searchParams.get('text')).toBe('Casa Loma');
  });

  it('carries the GetYourGuide partner id on a search URL', async () => {
    const { ticketLinks } = await load(GYG);
    const url = new URL(ticketLinks('Casa Loma', 'historic_site')[0].url);
    expect(url.origin + url.pathname).toBe('https://www.getyourguide.com/s/');
    expect(url.searchParams.get('partner_id')).toBe('ZWAHXS1');
    expect(url.searchParams.get('q')).toBe('Casa Loma');
  });

  it('escapes place names with characters that would break the query', async () => {
    const { ticketLinks } = await load({ ...VIATOR, ...GYG });
    const name = 'Smith & Sons Museum of Art & Design';
    for (const link of ticketLinks(name, 'museum')) {
      const url = new URL(link.url);
      expect(url.searchParams.get(link.partner === 'viator' ? 'text' : 'q')).toBe(name);
    }
  });

  it('offers nothing for places that are free to walk into', async () => {
    const { ticketLinks } = await load({ ...VIATOR, ...GYG });
    for (const kind of ['viewpoint', 'park', 'picnic_site', 'fuel', 'restaurant', 'rest_area']) {
      expect(ticketLinks('Somewhere', kind)).toEqual([]);
    }
  });

  it('offers nothing for an unnamed place, which would search for ""', async () => {
    const { ticketLinks } = await load(VIATOR);
    expect(ticketLinks('   ', 'museum')).toEqual([]);
  });
});

// A kind listed in TICKET_KINDS that no source in src/api ever emits is a dead
// entry — the link can never appear. These are the kinds the sources actually
// produce today; see the categorize functions in api/overpass and api/geoapify
// and the RULES table in api/wikipedia.
describe('ticketed kinds line up with what the sources emit', () => {
  const TICKETED = ['attraction', 'museum', 'gallery', 'zoo', 'aquarium', 'theme_park', 'historic_site'];

  it('offers tickets for every ticketed kind the sources produce', async () => {
    const { ticketLinks } = await load(VIATOR);
    for (const kind of TICKETED) {
      expect(ticketLinks('Somewhere', kind), `${kind} should be ticketed`).toHaveLength(1);
    }
  });
});

describe('other partners', () => {
  it('links hotels only with both an ID and a destination', async () => {
    const off = await load();
    expect(off.hotelsLink('Montreal')).toBeNull();

    const on = await load({ VITE_BOOKING_AID: '12345' });
    expect(on.hotelsLink('')).toBeNull();
    const url = new URL(on.hotelsLink('Montreal')!);
    expect(url.searchParams.get('aid')).toBe('12345');
    expect(url.searchParams.get('ss')).toBe('Montreal');
  });

  it('passes the Upside referral link through untouched', async () => {
    const ref = 'https://upside.app.link/abc123';
    const { gasCashbackLink, anyAffiliate } = await load({ VITE_UPSIDE_REF_URL: ref });
    expect(gasCashbackLink()).toBe(ref);
    expect(anyAffiliate()).toBe(true);
  });
});
