// Keeps the three places that know about a route guide in step: the list the
// app renders, the files on disk, and sitemap.xml. Any one of them drifting is
// silent — a guide that exists but is unreachable, or a link to a page that is
// not there — so it is checked rather than remembered.

import { describe, expect, it } from 'vitest';
import { ROUTE_GUIDES } from '../guides';
import sitemap from '../../../public/sitemap.xml?raw';
import indexHtml from '../../../index.html?raw';

// Served paths of every guide file that actually exists.
const onDisk = Object.keys(
  import.meta.glob('../../../public/guides/*.html', { query: '?raw', eager: true }),
).map((p) => p.replace('../../../public', ''));

const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
  m[1].replace('https://pithop.com', ''),
);

describe('route guides', () => {
  it('links only to guides that exist', () => {
    for (const g of ROUTE_GUIDES) {
      expect(onDisk, `${g.href} is linked but no such file exists`).toContain(g.href);
    }
  });

  // The failure that prompted this list: guides shipped, were indexed, and no
  // visitor could reach them.
  it('leaves no guide unreachable from the app', () => {
    for (const path of onDisk) {
      expect(
        ROUTE_GUIDES.map((g) => g.href),
        `${path} exists but nothing in the app links to it`,
      ).toContain(path);
    }
  });

  it('offers every guide to search engines too', () => {
    for (const g of ROUTE_GUIDES) {
      expect(sitemapPaths, `${g.href} is missing from sitemap.xml`).toContain(g.href);
    }
  });

  // index.html is what a crawler reads before running any JavaScript, so the
  // guides have to be linked there as well as in the app.
  it('keeps the crawler-facing links in index.html', () => {
    for (const g of ROUTE_GUIDES) {
      expect(indexHtml, `${g.href} is not linked from index.html`).toContain(`href="${g.href}"`);
    }
  });

  it('gives each guide a distinct label and a blurb', () => {
    const labels = ROUTE_GUIDES.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const g of ROUTE_GUIDES) {
      expect(g.blurb.trim().length, `${g.label} needs a blurb`).toBeGreaterThan(10);
    }
  });
});
