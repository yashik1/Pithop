// Guards the on-page SEO/AEO properties an external audit measures, so a future
// copy edit cannot quietly undo them. Thresholds come from the audit's own
// wording ("rewrite to 70-160 characters", "expand beyond 300 words").

import { describe, it, expect } from 'vitest';

// Loaded through Vite's ?raw imports rather than node:fs on purpose. The app's
// tsconfig covers src/ and deliberately has no Node types — that is what keeps
// browser code from reaching for process.env — and these imports keep the test
// inside that world. A missing file fails the import, which is the assertion.
import html from '../../../index.html?raw';
import llms from '../../../public/llms.txt?raw';
import robots from '../../../public/robots.txt?raw';
import sitemap from '../../../public/sitemap.xml?raw';

const attr = (name: string): string => {
  const m = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 's').exec(html);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

/** Words in the served HTML body, ignoring scripts and markup. */
function staticWordCount(): number {
  const body = /<body>(.*)<\/body>/s.exec(html)?.[1] ?? '';
  const text = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  return text.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
}

describe('meta description', () => {
  it('sits inside the 70-160 characters search engines display', () => {
    const d = attr('description');
    expect(d.length).toBeGreaterThanOrEqual(70);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it('leads with what people actually search for', () => {
    expect(attr('description').toLowerCase()).toContain('road trip planner');
  });
});

describe('served HTML content', () => {
  it('carries enough substantive copy to not read as a thin page', () => {
    // The app is client-rendered, so this static block is the entire page for a
    // crawler or an AI answer engine that does not run JavaScript.
    expect(staticWordCount()).toBeGreaterThanOrEqual(300);
  });

  it('is structured with a single h1 and supporting h2s', () => {
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('still lets crawlers index and follow, with large image previews', () => {
    const robots = attr('robots');
    expect(robots).toMatch(/\bindex\b/);
    expect(robots).toMatch(/\bfollow\b/);
    expect(robots).toContain('max-image-preview:large');
  });

  it('keeps the title under the length Google shows whole', () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

describe('crawler-facing files', () => {
  it('publishes llms.txt for AI answer engines', () => {
    // The convention: an H1 name, a blockquote summary, and links to key pages.
    expect(llms).toMatch(/^# \S/m);
    expect(llms).toMatch(/^> /m);
    expect(llms).toContain('https://pithop.com/');
  });

  it('publishes robots.txt pointing at the sitemap', () => {
    expect(robots).toMatch(/^User-agent:/m);
    expect(robots).toContain('Sitemap: https://pithop.com/sitemap.xml');
  });

  it('only lists the home page in the sitemap, and it is indexable', () => {
    // privacy.html and terms.html carry noindex, so listing them would ask
    // Google to index pages that refuse to be indexed.
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(['https://pithop.com/']);
    expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
  });
});
