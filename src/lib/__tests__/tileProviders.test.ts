import { describe, it, expect } from 'vitest';
import { tileProviders } from '../tileProviders';

describe('tileProviders', () => {
  it('offers three providers to fall through', () => {
    expect(tileProviders()).toHaveLength(3);
  });

  it('uses only keyless tile sources', () => {
    // The map must never be able to render a provider's "API key required"
    // image: that arrives as a successful tile load, so no amount of failover
    // logic can detect it. Keeping every source keyless removes the failure
    // mode rather than trying to recover from it.
    for (const p of tileProviders()) {
      expect(p.url, p.url).not.toMatch(/apikey|api_key|access_token|\{key\}/i);
      expect(p.url, p.url).not.toMatch(/geoapify/i);
    }
  });

  it('leads with Carto Voyager and keeps OSM mirrors behind it', () => {
    const [first, ...rest] = tileProviders();
    expect(first.url).toMatch(/cartocdn/);
    expect(rest.some((p) => /tile\.openstreetmap\.org/.test(p.url))).toBe(true);
    expect(rest.some((p) => /tile\.openstreetmap\.de/.test(p.url))).toBe(true);
  });

  it('serves every provider over https and credits OpenStreetMap', () => {
    for (const p of tileProviders()) {
      expect(p.url.startsWith('https://'), p.url).toBe(true);
      expect(p.attribution).toMatch(/OpenStreetMap/);
    }
  });

  it('spreads Carto across subdomains so one host is not the bottleneck', () => {
    const carto = tileProviders()[0];
    expect(carto.url).toContain('{s}');
    expect(carto.subdomains && carto.subdomains.length).toBeGreaterThan(1);
  });
});
