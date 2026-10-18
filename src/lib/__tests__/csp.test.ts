// The Content-Security-Policy, checked against the hosts the app really uses.
//
// A CSP that is too narrow fails in the worst way: the browser refuses the
// resource and the page renders as if the content simply did not exist. That is
// what happened to the stop photos — Wikimedia moved thumbnail serving from
// upload.wikimedia.org to thumb.wikimedia.org, the policy still named only the
// old host, and every photo in the app silently became a blank box. Nothing
// errored; the pictures were just gone.

import { describe, expect, it } from 'vitest';
import vercel from '../../../vercel.json';

const csp: string =
  vercel.headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')!.value;

function sources(directive: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === directive || d.startsWith(directive + ' '));
  return found ? found.split(/\s+/).slice(1) : [];
}

/** Does `directive` permit loading from `url`? Mirrors CSP host matching. */
function allows(directive: string, url: string): boolean {
  const { host } = new URL(url);
  return sources(directive).some((src) => {
    if (src.startsWith("'") || src.endsWith(':')) return false; // 'self', data:, blob:
    const pattern = src.replace(/^https:\/\//, '');
    // Per the CSP spec, *.example.com matches a subdomain but not the bare
    // domain, so the leading dot is kept deliberately.
    return pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern;
  });
}

describe('img-src', () => {
  // The exact URL shape the Wikipedia/Wikivoyage pageimages API returns, which
  // is where every photo in the app comes from (src/api/wikipedia.ts).
  it('allows Wikimedia thumbnails, on whichever host they are served from', () => {
    expect(allows('img-src', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/x.jpg')).toBe(
      true,
    );
    expect(allows('img-src', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/x.jpg')).toBe(
      true,
    );
  });

  it('still allows the map tile providers', () => {
    expect(allows('img-src', 'https://tile.openstreetmap.org/5/1/1.png')).toBe(true);
    expect(allows('img-src', 'https://maps.geoapify.com/v1/tile/osm-bright/5/1/1.png')).toBe(true);
  });

  // The wildcard above is scoped to one organisation's domain; this is what
  // stops it drifting into img-src * the next time something is blocked.
  it('does not permit arbitrary hosts', () => {
    expect(allows('img-src', 'https://example.com/tracker.gif')).toBe(false);
    expect(allows('img-src', 'https://wikimedia.org.evil.test/x.jpg')).toBe(false);
  });
});

describe('the policy keeps its teeth', () => {
  it('has no unsafe-inline or unsafe-eval in script-src', () => {
    expect(sources('script-src')).toEqual(["'self'"]);
  });

  it('forbids framing and plugin content', () => {
    expect(sources('frame-ancestors')).toEqual(["'none'"]);
    expect(sources('object-src')).toEqual(["'none'"]);
  });
});
