import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// hasGeoapify()/geoapifyTileLayer() read an import.meta.env value at module
// load, so the provider module is imported fresh per test with the Geoapify
// module mocked to the state under test.
async function providersWithKey(hasKey: boolean) {
  vi.resetModules();
  vi.doMock('../../api/geoapify', () => ({
    hasGeoapify: () => hasKey,
    geoapifyTileLayer: () => ({
      url: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}{r}.png?apiKey=test',
      attribution: 'Powered by Geoapify | &copy; OpenStreetMap contributors',
    }),
  }));
  const mod = await import('../tileProviders');
  return mod.tileProviders();
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock('../../api/geoapify'));

describe('tileProviders', () => {
  it('never serves Carto basemaps', async () => {
    // Carto's keyless raster tiles now answer with an image that has "API KEY
    // REQUIRED" printed on it, delivered as HTTP 200. Leaflet counts that as a
    // successful load, so no failover can catch it and the watermark covers the
    // whole map. The only defence is never requesting them.
    for (const hasKey of [true, false]) {
      for (const p of await providersWithKey(hasKey)) {
        expect(p.url, `hasKey=${hasKey}`).not.toMatch(/carto/i);
      }
    }
  });

  it('falls back to keyless OSM servers when no key is configured', async () => {
    const list = await providersWithKey(false);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const p of list) expect(p.url).not.toMatch(/apikey/i);
    expect(list[0].url).toMatch(/tile\.openstreetmap\.org/);
  });

  it('leads with the paid provider when a key is configured', async () => {
    const list = await providersWithKey(true);
    expect(list[0].url).toMatch(/geoapify/);
    // Keyless backups must still sit behind it, on separate infrastructure.
    expect(list.slice(1).some((p) => /tile\.openstreetmap\.org/.test(p.url))).toBe(true);
    expect(list.slice(1).some((p) => /tile\.openstreetmap\.de/.test(p.url))).toBe(true);
  });

  it('always offers somewhere to fall back to', async () => {
    for (const hasKey of [true, false]) {
      expect((await providersWithKey(hasKey)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('serves every provider over https and credits OpenStreetMap', async () => {
    for (const hasKey of [true, false]) {
      for (const p of await providersWithKey(hasKey)) {
        expect(p.url.startsWith('https://'), p.url).toBe(true);
        expect(p.attribution).toMatch(/OpenStreetMap/);
      }
    }
  });
});
