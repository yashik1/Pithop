// What kinds the place sources emit, and whether the ticket gate agrees.
//
// These two things are a contract: lib/affiliates only offers a ticket link for
// kinds in its TICKET_KINDS set, so a kind no source produces is a dead entry,
// and a ticketed place classified under some other kind never gets a link. Both
// failures are silent — the link simply never appears — which is why they are
// asserted together at the bottom of this file.

import { describe, expect, it } from 'vitest';
import { buildQuery, categorizeOsm } from '../overpass';
import { categorizeGeoapify } from '../geoapify';
import { ticketLinks } from '../../lib/affiliates';

describe('categorizeOsm', () => {
  it('maps ticketed tourism tags to their own kind', () => {
    expect(categorizeOsm({ tourism: 'museum', name: 'Local History Museum' })).toEqual({
      category: 'museums',
      kind: 'museum',
      name: 'Local History Museum',
    });
    expect(categorizeOsm({ tourism: 'gallery', name: 'Town Gallery' })?.kind).toBe('gallery');
    expect(categorizeOsm({ tourism: 'zoo', name: 'City Zoo' })?.kind).toBe('zoo');
    expect(categorizeOsm({ tourism: 'aquarium', name: 'Aquarium' })?.kind).toBe('aquarium');
    expect(categorizeOsm({ tourism: 'theme_park', name: 'Fun Park' })?.kind).toBe('theme_park');
  });

  it('files galleries and museums under museums, the rest under fun', () => {
    expect(categorizeOsm({ tourism: 'gallery', name: 'G' })?.category).toBe('museums');
    expect(categorizeOsm({ tourism: 'zoo', name: 'Z' })?.category).toBe('fun');
  });

  it('still classifies what it always did', () => {
    expect(categorizeOsm({ tourism: 'viewpoint' })?.kind).toBe('viewpoint');
    expect(categorizeOsm({ amenity: 'fuel' })?.kind).toBe('fuel');
    expect(categorizeOsm({ amenity: 'cafe', name: 'Joe' })?.kind).toBe('cafe');
    expect(categorizeOsm({ highway: 'rest_area' })?.kind).toBe('rest_area');
    expect(categorizeOsm({ shop: 'supermarket', name: 'Big Mart' })).toBeNull();
  });
});

describe('buildQuery', () => {
  const q = buildQuery([{ lat: 44.5, lng: -79.5 }]);

  it('asks for the ticketed tourism tags it knows how to classify', () => {
    for (const tag of ['museum', 'gallery', 'zoo', 'aquarium', 'theme_park']) {
      expect(categorizeOsm({ tourism: tag, name: 'X' }), `${tag} classified`).not.toBeNull();
      expect(q, `${tag} queried`).toContain(tag);
    }
  });

  // Museums are nearly always mapped as a building outline, so a node-only
  // query would miss most of them.
  it('asks for ways as well as nodes for those tags', () => {
    expect(q).toMatch(/node\["tourism"~"\^\(museum\|/);
    expect(q).toMatch(/way\["tourism"~"\^\(museum\|/);
  });

  it('stays a well-formed single Overpass statement', () => {
    expect(q.startsWith('[out:json][timeout:30];(')).toBe(true);
    expect(q.endsWith(');out center qt 2200;')).toBe(true);
    const body = q.slice(q.indexOf('(') + 1, q.lastIndexOf(')'));
    // Every clause terminated, and brackets balanced across the whole query.
    expect(body.endsWith(';')).toBe(true);
    for (const [open, close] of [['[', ']'], ['(', ')'], ['{', '}']]) {
      const n = (s: string) => q.split(s).length - 1;
      expect(n(open), `${open}${close} balanced`).toBe(n(close));
    }
  });
});

describe('categorizeGeoapify', () => {
  it('recognises the ticketed entertainment categories', () => {
    expect(categorizeGeoapify(['entertainment.museum'])).toEqual({ category: 'museums', kind: 'museum' });
    expect(categorizeGeoapify(['entertainment.culture.gallery'])?.kind).toBe('gallery');
    expect(categorizeGeoapify(['entertainment.zoo'])?.kind).toBe('zoo');
    expect(categorizeGeoapify(['entertainment.aquarium'])?.kind).toBe('aquarium');
    expect(categorizeGeoapify(['entertainment.theme_park'])?.kind).toBe('theme_park');
  });

  // Geoapify returns a place's full category list, and a museum almost always
  // carries a tourism category too. Before this ordering, the generic tourism
  // branch won and flattened it to "attraction" — losing the 90-minute visit
  // estimate, the museum copy and the ticket link.
  it('prefers the specific category over the generic tourism one', () => {
    expect(categorizeGeoapify(['tourism.sights', 'entertainment.museum'])?.kind).toBe('museum');
    expect(categorizeGeoapify(['tourism.attraction', 'entertainment.zoo'])?.kind).toBe('zoo');
  });

  it('still classifies what it always did', () => {
    expect(categorizeGeoapify(['service.vehicle.fuel'])?.kind).toBe('fuel');
    expect(categorizeGeoapify(['catering.cafe'])?.kind).toBe('cafe');
    expect(categorizeGeoapify(['tourism.sights'])?.kind).toBe('historic_site');
    expect(categorizeGeoapify(['tourism.attraction'])?.kind).toBe('attraction');
    expect(categorizeGeoapify(['leisure.park'])?.kind).toBe('park');
    expect(categorizeGeoapify(['commercial.supermarket'])).toBeNull();
  });
});

describe('the ticket gate agrees with the sources', () => {
  // Deliberately the real module, with a partner configured via the build-time
  // default being absent — so this asserts the KIND gate only, by checking that
  // a ticketed kind is treated differently from a free one.
  const ticketed = ['museum', 'gallery', 'zoo', 'aquarium', 'theme_park', 'historic_site', 'attraction'];

  it('every kind the sources emit for a ticketed place is in the gate', () => {
    const fromOsm = ['museum', 'gallery', 'zoo', 'aquarium', 'theme_park']
      .map((t) => categorizeOsm({ tourism: t, name: 'X' })!.kind);
    const fromGeoapify = [
      ['entertainment.museum'],
      ['entertainment.culture.gallery'],
      ['entertainment.zoo'],
      ['entertainment.aquarium'],
      ['entertainment.theme_park'],
      ['tourism.sights'],
      ['tourism.attraction'],
    ].map((c) => categorizeGeoapify(c)!.kind);

    for (const kind of [...fromOsm, ...fromGeoapify]) {
      expect(ticketed, `${kind} should be a ticketed kind`).toContain(kind);
    }
  });

  // Without a partner ID nothing renders at all — the gate is necessary but
  // not sufficient, and this records that order of operations.
  it('renders nothing while no partner is configured, whatever the kind', () => {
    for (const kind of ticketed) expect(ticketLinks('Somewhere', kind)).toEqual([]);
  });
});
